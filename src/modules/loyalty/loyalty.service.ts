import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Booking } from '../bookings/entities/booking.entity';
import { AdminSettingsService } from '../admin/admin-settings.service';
import { calculateLoyaltyPoints } from '../../common/utils';
import { LoyaltyTier } from '../../common/enums';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settingsService: AdminSettingsService,
  ) {}

  // ─── Gagner des points ────────────────────────────────────────────────────

  @OnEvent('booking.completed')
  async earnPointsOnCompletion(booking: Booking) {
    await this.earnPoints(
      booking.customerId,
      booking.id,
      Number(booking.totalAmount),
    );
  }

  async earnPoints(
    userId: string,
    bookingId: string,
    amount: number,
  ): Promise<void> {
    const points = calculateLoyaltyPoints(amount);
    if (points <= 0) return;

    await this.dataSource.transaction(async (manager) => {
      // Ajouter les points à l'utilisateur
      await manager.query(
        `UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2`,
        [points, userId],
      );

      // Enregistrer la transaction
      await manager.query(
        `INSERT INTO loyalty_transactions (id, user_id, type, points, reason, booking_id, created_at)
         VALUES (gen_random_uuid(), $1, 'EARN', $2, 'Réservation complétée', $3, NOW())`,
        [userId, points, bookingId],
      );
    });

    // Mettre à jour le tier
    await this.updateTier(userId);
    this.logger.log(`Points gagnés: +${points} pour ${userId}`);
  }

  // ─── Utiliser des points ──────────────────────────────────────────────────

  async spendPoints(
    userId: string,
    bookingId: string,
    points: number,
  ): Promise<number> {
    // 100 points = 1000 XAF
    const discount = points * 10;

    const user = await this.dataSource.manager.query(
      `SELECT loyalty_points FROM users WHERE id = $1`,
      [userId],
    );

    if (!user[0] || user[0].loyalty_points < points) {
      throw new BadRequestException('Points insuffisants');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id = $2`,
        [points, userId],
      );

      await manager.query(
        `INSERT INTO loyalty_transactions (id, user_id, type, points, reason, booking_id, created_at)
         VALUES (gen_random_uuid(), $1, 'SPEND', $2, 'Utilisé pour réservation', $3, NOW())`,
        [userId, points, bookingId],
      );
    });

    return discount;
  }

  // ─── Mettre à jour le tier ────────────────────────────────────────────────

  async updateTier(userId: string): Promise<void> {
    const user = await this.dataSource.manager.query(
      `SELECT loyalty_points FROM users WHERE id = $1`,
      [userId],
    );
    if (!user[0]) return;

    const points = user[0].loyalty_points;
    const settings = await this.settingsService.get('loyalty_tier_thresholds');

    let tier = LoyaltyTier.BRONZE;
    if (points >= (settings?.PLATINUM || 5000)) tier = LoyaltyTier.PLATINUM;
    else if (points >= (settings?.GOLD || 2000)) tier = LoyaltyTier.GOLD;
    else if (points >= (settings?.SILVER || 500)) tier = LoyaltyTier.SILVER;

    await this.dataSource.manager.query(
      `UPDATE users SET loyalty_tier = $1 WHERE id = $2`,
      [tier, userId],
    );
  }

  // ─── Récupérer infos fidélité ─────────────────────────────────────────────

  async getUserLoyalty(userId: string) {
    const user = await this.dataSource.manager.query(
      `SELECT loyalty_points, loyalty_tier, wallet_balance FROM users WHERE id = $1`,
      [userId],
    );
    if (!user[0]) throw new NotFoundException('Utilisateur introuvable');

    const transactions = await this.dataSource.manager.query(
      `SELECT * FROM loyalty_transactions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId],
    );

    const settings = await this.settingsService.get('loyalty_tier_thresholds');

    return {
      points: user[0].loyalty_points,
      tier: user[0].loyalty_tier,
      wallet_balance: user[0].wallet_balance,
      transactions,
      tiers: settings,
      next_tier_points: this.getNextTierThreshold(user[0].loyalty_points, settings),
    };
  }

  private getNextTierThreshold(points: number, thresholds: any): number | null {
    if (points < (thresholds?.SILVER || 500)) return thresholds?.SILVER || 500;
    if (points < (thresholds?.GOLD || 2000)) return thresholds?.GOLD || 2000;
    if (points < (thresholds?.PLATINUM || 5000)) return thresholds?.PLATINUM || 5000;
    return null;
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────

  async creditWallet(userId: string, amount: number, reason: string, bookingId?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [amount, userId],
      );

      const balanceResult = await manager.query(
        `SELECT wallet_balance FROM users WHERE id = $1`,
        [userId],
      );

      await manager.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, reason, booking_id, created_at)
         VALUES (gen_random_uuid(), $1, 'CREDIT', $2, $3, $4, $5, NOW())`,
        [userId, amount, balanceResult[0].wallet_balance, reason, bookingId || null],
      );
    });
  }

  async debitWallet(userId: string, amount: number, reason: string): Promise<void> {
    const user = await this.dataSource.manager.query(
      `SELECT wallet_balance FROM users WHERE id = $1`,
      [userId],
    );

    if (!user[0] || Number(user[0].wallet_balance) < amount) {
      throw new BadRequestException('Solde du portefeuille insuffisant');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
        [amount, userId],
      );

      const balanceResult = await manager.query(
        `SELECT wallet_balance FROM users WHERE id = $1`,
        [userId],
      );

      await manager.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, reason, created_at)
         VALUES (gen_random_uuid(), $1, 'DEBIT', $2, $3, $4, NOW())`,
        [userId, amount, balanceResult[0].wallet_balance, reason],
      );
    });
  }

  // ─── Parrainage ───────────────────────────────────────────────────────────

  @OnEvent('referral.created')
  async processReferral(payload: { referrerId: string; referredId: string }) {
    const settings = await this.settingsService.getAll();
    const referrerReward = settings.referral_reward_referrer || 5000;
    const referredReward = settings.referral_reward_referred || 2500;

    await Promise.all([
      this.creditWallet(payload.referrerId, referrerReward, 'Bonus de parrainage'),
      this.creditWallet(payload.referredId, referredReward, 'Bienvenue — bonus parrainage'),
    ]);

    await this.dataSource.manager.query(
      `INSERT INTO referrals (id, referrer_id, referred_id, status, referrer_reward, referred_reward,
       reward_type, rewarded_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'REWARDED', $3, $4, 'wallet', NOW(), NOW())`,
      [payload.referrerId, payload.referredId, referrerReward, referredReward],
    );

    this.logger.log(
      `Parrainage traité: ${payload.referrerId} → ${payload.referredId}`,
    );
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  async validateCoupon(
    code: string,
    userId: string,
    bookingAmount: number,
  ): Promise<{ valid: boolean; discount: number; message?: string }> {
    const coupon = await this.dataSource.manager.query(
      `SELECT * FROM coupons WHERE code = $1 AND is_active = true
       AND (valid_from IS NULL OR valid_from <= NOW())
       AND (valid_until IS NULL OR valid_until >= NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
      [code.toUpperCase()],
    );

    if (!coupon[0]) {
      return { valid: false, discount: 0, message: 'Code promo invalide ou expiré' };
    }

    const c = coupon[0];

    // Vérifier usage par utilisateur
    if (c.max_uses_per_user) {
      const userUsage = await this.dataSource.manager.query(
        `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1 AND user_id = $2`,
        [c.id, userId],
      );
      if (parseInt(userUsage[0].count) >= c.max_uses_per_user) {
        return { valid: false, discount: 0, message: 'Vous avez déjà utilisé ce code' };
      }
    }

    // Vérifier montant minimum
    if (c.min_booking_amt && bookingAmount < c.min_booking_amt) {
      return {
        valid: false,
        discount: 0,
        message: `Montant minimum requis: ${c.min_booking_amt} XAF`,
      };
    }

    // Calculer la remise
    let discount = c.type === 'PERCENTAGE'
      ? Math.round(bookingAmount * (c.value / 100))
      : c.value;

    if (c.max_discount_amt) {
      discount = Math.min(discount, c.max_discount_amt);
    }

    return { valid: true, discount };
  }

  async applyCoupon(code: string, userId: string, bookingId: string, discount: number): Promise<void> {
    const coupon = await this.dataSource.manager.query(
      `SELECT id FROM coupons WHERE code = $1`,
      [code.toUpperCase()],
    );

    if (!coupon[0]) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO coupon_usages (id, coupon_id, user_id, booking_id, discount_applied, used_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        [coupon[0].id, userId, bookingId, discount],
      );

      await manager.query(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
        [coupon[0].id],
      );
    });
  }
}
