import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../config/redis.service';

export interface PlatformSetting {
  key: string;
  value: any;
  description: string;
  updatedBy: string;
  updatedAt: Date;
}

// Entité inline pour éviter import circulaire
import {
  Entity, PrimaryColumn, Column, UpdateDateColumn,
} from 'typeorm';

@Entity('platform_settings')
export class PlatformSettingEntity {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'jsonb' })
  value: any;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  // Valeurs par défaut
  private readonly defaults: Record<string, any> = {
    kyc_required: false,
    license_required: false,
    deposit_required: true,
    commission_rate: 10,
    platform_name: 'StayRide',
    default_currency: 'XAF',
    loyalty_points_rate: 1, // 1 point par 1000 XAF
    loyalty_tier_thresholds: {
      BRONZE: 0,
      SILVER: 500,
      GOLD: 2000,
      PLATINUM: 5000,
    },
    referral_reward_referrer: 5000, // XAF offerts au parrain
    referral_reward_referred: 2500, // XAF offerts au filleul
    payment_methods_enabled: {
      ORANGE_MONEY: {
        enabled: true,
        label: 'Orange Money',
        merchant_code: 'STAYRIDE',
        instructions_fr: 'Composez #150# → Paiement marchand → Code STAYRIDE',
        instructions_en: 'Dial #150# → Merchant payment → Code STAYRIDE',
      },
      MTN_MOMO: {
        enabled: true,
        label: 'MTN MoMo',
        merchant_code: 'STAYRIDE',
        instructions_fr: 'Composez *126# → Paiement → Code STAYRIDE',
        instructions_en: 'Dial *126# → Payment → Code STAYRIDE',
      },
      STRIPE: {
        enabled: false,
        label: 'Carte bancaire (Stripe)',
      },
      PAYPAL: {
        enabled: false,
        label: 'PayPal',
      },
      CASH: {
        enabled: true,
        label: 'Espèces',
        instructions_fr: 'Paiement en espèces à la remise des clés',
        instructions_en: 'Cash payment at key handover',
      },
    },
  };

  constructor(
    @InjectRepository(PlatformSettingEntity)
    private readonly settingsRepo: Repository<PlatformSettingEntity>,
    private readonly redisService: RedisService,
  ) {}

  // ─── Récupérer une valeur ─────────────────────────────────────────────────

  async get(key: string): Promise<any> {
    // Chercher en cache Redis d'abord
    const cached = await this.redisService.getCachedSettings();
    if (cached && key in cached) return cached[key];

    // Chercher en base
    const setting = await this.settingsRepo.findOne({ where: { key } });
    if (setting) return setting.value;

    // Retourner la valeur par défaut
    return this.defaults[key] ?? null;
  }

  // ─── Récupérer toutes les settings ────────────────────────────────────────

  async getAll(): Promise<Record<string, any>> {
    // Cache Redis
    const cached = await this.redisService.getCachedSettings();
    if (cached) return cached;

    const settings = await this.settingsRepo.find();
    const result: Record<string, any> = { ...this.defaults };

    for (const s of settings) {
      result[s.key] = s.value;
    }

    // Mettre en cache 5 min
    await this.redisService.cacheSettings(result);
    return result;
  }

  // ─── Récupérer settings publiques (sans données sensibles) ───────────────

  async getPublic(): Promise<Record<string, any>> {
    const all = await this.getAll();
    const {
      kyc_required,
      license_required,
      deposit_required,
      default_currency,
      platform_name,
      payment_methods_enabled,
    } = all;

    // Filtrer les instructions pour ne garder que ce qui est public
    const publicPaymentMethods: Record<string, any> = {};
    for (const [method, config] of Object.entries(payment_methods_enabled as Record<string, any>)) {
      if (config.enabled) {
        publicPaymentMethods[method] = {
          enabled: true,
          label: config.label,
          merchant_code: config.merchant_code,
          instructions_fr: config.instructions_fr,
          instructions_en: config.instructions_en,
        };
      }
    }

    return {
      kyc_required,
      license_required,
      deposit_required,
      default_currency,
      platform_name,
      payment_methods: publicPaymentMethods,
    };
  }

  // ─── Mettre à jour une valeur ─────────────────────────────────────────────

  async set(key: string, value: any, adminId: string): Promise<void> {
    await this.settingsRepo.upsert(
      { key, value, updatedBy: adminId },
      ['key'],
    );

    // Invalider le cache
    await this.redisService.invalidateSettingsCache();
    this.logger.log(`Setting modifié: ${key} par admin ${adminId}`);
  }

  // ─── Toggle mode de paiement ──────────────────────────────────────────────

  async togglePaymentMethod(
    method: string,
    enabled: boolean,
    adminId: string,
  ): Promise<void> {
    const current = await this.get('payment_methods_enabled');
    if (!current[method]) {
      throw new NotFoundException(`Mode de paiement ${method} inconnu`);
    }

    current[method].enabled = enabled;
    await this.set('payment_methods_enabled', current, adminId);

    this.logger.log(
      `Mode paiement ${method} ${enabled ? 'activé' : 'désactivé'} par ${adminId}`,
    );
  }

  // ─── Mettre à jour config mode de paiement ────────────────────────────────

  async updatePaymentMethod(
    method: string,
    config: Partial<{
      instructions_fr: string;
      instructions_en: string;
      merchant_code: string;
    }>,
    adminId: string,
  ): Promise<void> {
    const current = await this.get('payment_methods_enabled');
    if (!current[method]) {
      throw new NotFoundException(`Mode de paiement ${method} inconnu`);
    }

    current[method] = { ...current[method], ...config };
    await this.set('payment_methods_enabled', current, adminId);
  }

  // ─── Mettre à jour plusieurs settings d'un coup ───────────────────────────

  async setMany(settings: Record<string, any>, adminId: string): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.settingsRepo.upsert(
        { key, value, updatedBy: adminId },
        ['key'],
      );
    }
    await this.redisService.invalidateSettingsCache();
  }
}
