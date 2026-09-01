import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, Between } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import dayjs from "dayjs";
import { Booking } from "../bookings/entities/booking.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingStatus } from "../../common/enums";

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepo: Repository<Booking>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Rappel check-in J-1 (chaque matin à 9h) ─────────────────────────────

  @Cron("0 9 * * *", { name: "checkin-reminder" })
  async sendCheckinReminders() {
    this.logger.log("Cron: envoi rappels check-in J-1");
    const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");

    const bookings = await this.bookingsRepo.find({
      where: {
        startDate: tomorrow,
        status: BookingStatus.CONFIRMED,
      },
    });

    for (const booking of bookings) {
      await this.notificationsService.sendPush(
        booking.customerId,
        "🏠 Check-in demain !",
        `Votre séjour commence demain. Préparez-vous !`,
        { booking_id: booking.id, type: "CHECKIN_REMINDER" },
      );
    }

    this.logger.log(`Rappels check-in envoyés: ${bookings.length}`);
  }

  // ─── Rappel check-out J-0 (chaque matin à 8h) ────────────────────────────

  @Cron("0 8 * * *", { name: "checkout-reminder" })
  async sendCheckoutReminders() {
    this.logger.log("Cron: envoi rappels check-out");
    const today = dayjs().format("YYYY-MM-DD");

    const bookings = await this.bookingsRepo.find({
      where: {
        endDate: today,
        status: BookingStatus.ACTIVE,
      },
    });

    for (const booking of bookings) {
      await this.notificationsService.sendPush(
        booking.customerId,
        "🔑 Check-out aujourd'hui",
        "N'oubliez pas votre heure de départ.",
        { booking_id: booking.id, type: "CHECKOUT_REMINDER" },
      );
    }
  }

  // ─── Notification prolongation J-1 (20h) ─────────────────────────────────

  @Cron("0 20 * * *", { name: "extension-reminder" })
  async sendExtensionReminders() {
    this.logger.log("Cron: rappels prolongation séjour J-1");
    const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");

    const bookings = await this.bookingsRepo.find({
      where: {
        endDate: tomorrow,
        status: BookingStatus.ACTIVE,
      },
    });

    for (const booking of bookings) {
      await this.notificationsService.sendPush(
        booking.customerId,
        "📅 Votre séjour se termine demain",
        "Souhaitez-vous prolonger votre séjour ?",
        { booking_id: booking.id, type: "EXTENSION_OFFER" },
      );
    }
  }

  // ─── Demande d'avis post-séjour (chaque matin à 10h) ─────────────────────

  @Cron("0 10 * * *", { name: "review-request" })
  async sendReviewRequests() {
    this.logger.log("Cron: demandes d'avis post-séjour");
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

    const bookings = await this.bookingsRepo.find({
      where: {
        endDate: yesterday,
        status: BookingStatus.COMPLETED,
      },
    });

    for (const booking of bookings) {
      await this.notificationsService.sendPush(
        booking.customerId,
        "⭐ Comment était votre séjour ?",
        "Partagez votre expérience et aidez les autres voyageurs.",
        { booking_id: booking.id, type: "REVIEW_REQUEST" },
      );
    }
  }

  // ─── Nettoyage logs GPS anciens (toutes les 6h) ───────────────────────────

  @Cron("0 */6 * * *", { name: "cleanup-tracking-logs" })
  async cleanupOldTrackingLogs() {
    this.logger.log("Cron: nettoyage logs GPS anciens");
    // Garder seulement les 30 derniers jours
    const cutoff = dayjs().subtract(30, "days").toDate();

    try {
      const result = await this.bookingsRepo.manager.query(
        `DELETE FROM vehicle_tracking_logs WHERE recorded_at < $1`,
        [cutoff],
      );
      this.logger.log(`Logs GPS supprimés: ${result[1] || 0} entrées`);
    } catch (err: any) {
      this.logger.error(`Erreur nettoyage logs GPS: ${err?.message}`);
    }
  }

  // ─── Expiration points fidélité (chaque semaine le lundi) ────────────────

  @Cron("0 0 * * 1", { name: "expire-loyalty-points" })
  async expireLoyaltyPoints() {
    this.logger.log("Cron: expiration points fidélité");
    // TODO: implémenter expiration points
  }

  // ─── Marquer réservations comme complétées auto (minuit) ─────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: "auto-complete-bookings",
  })
  async autoCompleteBookings() {
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

    const result = await this.bookingsRepo
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.COMPLETED })
      .where("end_date <= :yesterday", { yesterday })
      .andWhere("status = :status", { status: BookingStatus.ACTIVE })
      .execute();

    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Réservations auto-complétées: ${result.affected}`);
    }
  }

  @Cron("*/5 * * * *")
  async cancelExpiredPendingBookings() {
    try {
      const expiredTime = new Date(Date.now() - 15 * 60 * 1000);
      const result = await this.bookingsRepo
        .createQueryBuilder()
        .update(Booking)
        .set({ status: BookingStatus.CANCELLED })
        .where("status = :status", { status: BookingStatus.PENDING })
        .andWhere("created_at < :expiredTime", { expiredTime })
        .andWhere(
          `id NOT IN (
        SELECT p.booking_id FROM payments p 
        WHERE p.status = 'PENDING'
      )`,
        )
        .execute();
      if (result.affected && result.affected > 0) {
        this.logger.log(
          `${result.affected} réservation(s) expirée(s) annulées`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Erreur annulation bookings expirés: ${err?.message}`);
    }
  }

  // ─── Santé du scheduler (toutes les heures) ───────────────────────────────

  @Cron(CronExpression.EVERY_HOUR, { name: "health-check" })
  async healthCheck() {
    this.logger.debug("Scheduler actif");
  }
}
