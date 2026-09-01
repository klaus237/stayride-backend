import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import Stripe from "stripe";

import { Payment } from "./entities/payment.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { RedisService } from "../../config/redis.service";
import { AdminSettingsService } from "../admin/admin-settings.service";
import {
  PaymentMethod,
  PaymentStatus,
  BookingStatus,
  UserRole,
} from "../../common/enums";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Booking)
    private readonly bookingsRepo: Repository<Booking>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly settingsService: AdminSettingsService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const stripeKey = this.configService.get<string>("STRIPE_SECRET_KEY");
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    }
  }

  // ─── Initier un paiement ──────────────────────────────────────────────────

  async initiatePayment(
    bookingId: string,
    method: PaymentMethod,
    customerId: string,
    phone?: string,
  ): Promise<Payment> {
    // Vérifier que le mode est activé
    await this.validatePaymentMethodEnabled(method);

    const booking = await this.bookingsRepo.findOne({
      where: { id: bookingId, customerId },
    });
    if (!booking) throw new NotFoundException("Réservation introuvable");

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        "Cette réservation ne nécessite pas de paiement",
      );
    }

    // Vérifier qu'un paiement actif n'existe pas déjà
    const existing = await this.paymentsRepo.findOne({
      where: {
        bookingId,
        status: PaymentStatus.PENDING,
      },
    });
    if (existing) return existing;

    // Créer l'enregistrement de paiement
    const payment = this.paymentsRepo.create({
      bookingId,
      payerId: customerId,
      method,
      status: PaymentStatus.CREATED,
      amountExpected: booking.totalAmount,
      amountReceived: 0,
      currency: booking.currency,
      reference: this.generateReference(bookingId),
      phoneNumber: phone,
    });

    const saved = await this.paymentsRepo.save(payment);

    // Pour Stripe → créer un PaymentIntent
    if (method === PaymentMethod.STRIPE) {
      return this.createStripeIntent(saved, booking);
    }

    // Pour PayPal → créer une commande
    if (method === PaymentMethod.PAYPAL) {
      return this.createPaypalOrder(saved, booking);
    }

    // Pour Mobile Money / Cash → passer en PENDING (admin confirme)
    await this.paymentsRepo.update(saved.id, { status: PaymentStatus.PENDING });
    await this.bookingsRepo.update(bookingId, {
      status: BookingStatus.PAYMENT_PENDING,
    });
    saved.status = PaymentStatus.PENDING;

    this.logger.log(
      `Paiement initié: ${method} — ${booking.totalAmount} ${booking.currency} — Réf: ${saved.reference}`,
    );

    this.eventEmitter.emit("payment.initiated", { payment: saved, booking });
    return saved;
  }

  // ─── Confirmation manuelle (admin) ────────────────────────────────────────

  async confirmManual(
    paymentId: string,
    adminId: string,
    data: {
      amount_received: number;
      reference: string;
      payment_date: string;
      notes?: string;
    },
  ): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Paiement introuvable");

    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException("Ce paiement est déjà confirmé");
    }

    const isPartial = data.amount_received < Number(payment.amountExpected);
    const newStatus = isPartial
      ? PaymentStatus.PARTIALLY_PAID
      : PaymentStatus.PAID;

    await this.dataSource.transaction(async (manager) => {
      // Mettre à jour le paiement
      await manager.update(Payment, paymentId, {
        status: newStatus,
        amountReceived: data.amount_received,
        reference: data.reference,
        confirmedBy: adminId,
        confirmedAt: new Date(),
        notes: data.notes,
      });

      // Si paiement complet → confirmer la réservation
      if (!isPartial) {
        await manager.update(Booking, payment.bookingId, {
          status: BookingStatus.CONFIRMED,
        });
      }
    });

    const updated = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    const booking = await this.bookingsRepo.findOne({
      where: { id: payment.bookingId },
    });

    if (!isPartial) {
      this.eventEmitter.emit("booking.confirmed", booking);
      this.eventEmitter.emit("payment.confirmed", {
        payment: updated,
        booking,
      });
      this.logger.log(
        `Paiement confirmé par admin ${adminId}: ${data.amount_received} ${payment.currency}`,
      );
    } else {
      this.eventEmitter.emit("payment.partial", { payment: updated, booking });
    }

    return updated!;
  }

  // ─── Rejet paiement (admin) ───────────────────────────────────────────────

  async rejectPayment(
    paymentId: string,
    adminId: string,
    reason?: string,
  ): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Paiement introuvable");

    await this.paymentsRepo.update(paymentId, {
      status: PaymentStatus.FAILED,
      confirmedBy: adminId,
      confirmedAt: new Date(),
      notes: reason,
    });

    const updated = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    this.eventEmitter.emit("payment.rejected", { payment: updated });
    return updated!;
  }

  // ─── Remboursement (admin) ────────────────────────────────────────────────

  async processRefund(
    paymentId: string,
    adminId: string,
    amount?: number,
  ): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Paiement introuvable");

    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        "Seuls les paiements confirmés peuvent être remboursés",
      );
    }

    const refundAmount = amount || Number(payment.amountReceived);

    // Remboursement Stripe automatique
    if (payment.method === PaymentMethod.STRIPE && payment.stripePaymentId) {
      await this.stripe.refunds.create({
        payment_intent: payment.stripePaymentId,
        amount: Math.round(refundAmount * 100), // Stripe en centimes
      });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Payment, paymentId, {
        status: PaymentStatus.REFUNDED,
        refundedAmount: refundAmount,
        refundedAt: new Date(),
        confirmedBy: adminId,
      });

      await manager.update(Booking, payment.bookingId, {
        status: BookingStatus.REFUNDED,
      });
    });

    const updated = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    this.eventEmitter.emit("payment.refunded", { payment: updated });
    this.logger.log(
      `Remboursement: ${refundAmount} ${payment.currency} — Admin: ${adminId}`,
    );

    return updated!;
  }

  // ─── Webhook Stripe ───────────────────────────────────────────────────────

  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>(
      "STRIPE_WEBHOOK_SECRET",
    );
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret!,
      );
    } catch (err) {
      this.logger.error(`Webhook Stripe invalide: ${(err as any)?.message}`);
      throw new BadRequestException("Signature webhook invalide");
    }

    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.handleStripeSuccess(intent);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.handleStripeFailure(intent);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        this.logger.log(`Remboursement Stripe confirmé: ${charge.id}`);
        break;
      }
    }
  }

  private async handleStripeSuccess(
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { stripePaymentId: intent.id },
    });
    if (!payment) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Payment, payment.id, {
        status: PaymentStatus.PAID,
        amountReceived: intent.amount_received / 100,
        confirmedAt: new Date(),
      });
      await manager.update(Booking, payment.bookingId, {
        status: BookingStatus.CONFIRMED,
      });
    });

    const booking = await this.bookingsRepo.findOne({
      where: { id: payment.bookingId },
    });
    this.eventEmitter.emit("booking.confirmed", booking);
    this.logger.log(`Paiement Stripe confirmé: ${intent.id}`);
  }

  private async handleStripeFailure(
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    await this.paymentsRepo.update(
      { stripePaymentId: intent.id },
      { status: PaymentStatus.FAILED },
    );
    this.logger.warn(`Paiement Stripe échoué: ${intent.id}`);
  }

  // ─── Stripe PaymentIntent ─────────────────────────────────────────────────

  private async createStripeIntent(
    payment: Payment,
    booking: Booking,
  ): Promise<Payment> {
    if (!this.stripe) throw new BadRequestException("Stripe non configuré");

    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(Number(payment.amountExpected) * 100),
      currency: "xaf",
      metadata: {
        booking_id: booking.id,
        payment_id: payment.id,
        reference: payment.reference,
      },
    });

    await this.paymentsRepo.update(payment.id, {
      stripePaymentId: intent.id,
      status: PaymentStatus.PENDING,
    });

    return {
      ...payment,
      stripePaymentId: intent.id,
      status: PaymentStatus.PENDING,
      stripeClientSecret: intent.client_secret, // retourné au frontend
    } as any;
  }

  private async createPaypalOrder(
    payment: Payment,
    booking: Booking,
  ): Promise<Payment> {
    // TODO: intégration PayPal SDK
    // Pour l'instant on retourne le paiement en PENDING
    await this.paymentsRepo.update(payment.id, {
      status: PaymentStatus.PENDING,
    });
    return { ...payment, status: PaymentStatus.PENDING };
  }

  // ─── Validation mode de paiement activé ──────────────────────────────────

  private async validatePaymentMethodEnabled(
    method: PaymentMethod,
  ): Promise<void> {
    const settings = await this.settingsService.get("payment_methods_enabled");
    const methodConfig = settings?.[method];

    if (!methodConfig || !methodConfig.enabled) {
      throw new BadRequestException(
        `Le mode de paiement ${method} est actuellement désactivé`,
      );
    }
  }

  // ─── Statut paiement ──────────────────────────────────────────────────────

  async getPaymentStatus(paymentId: string, userId: string): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Paiement introuvable");
    if (payment.payerId !== userId)
      throw new ForbiddenException("Accès refusé");
    return payment;
  }

  async getUserPayments(userId: string, query: any) {
    const payments = await this.paymentsRepo.find({
      where: { payerId: userId },
      order: { createdAt: "DESC" },
      take: 50,
    });
    return payments;
  }

  // ─── Admin — liste tous les paiements ─────────────────────────────────────

  async findAllAdmin(query: any) {
    const qb = this.paymentsRepo
      .createQueryBuilder("p")
      .orderBy("p.created_at", "DESC");

    if (query.status) qb.where("p.status = :status", { status: query.status });
    if (query.method)
      qb.andWhere("p.method = :method", { method: query.method });
    if (query.from) qb.andWhere("p.created_at >= :from", { from: query.from });
    if (query.to)
      qb.andWhere("p.created_at <= :to", { to: query.to + "T23:59:59" });

    const [items, total] = await qb
      .take(query.perPage || 20)
      .skip(((query.page || 1) - 1) * (query.perPage || 20))
      .getManyAndCount();

    // Charger les relations manuellement
    const enriched = await Promise.all(
      items.map(async (payment) => {
        const result: any = { ...payment };
        if (payment.payerId) {
          result.payer = await this.paymentsRepo.manager.findOne("User", {
            where: { id: payment.payerId },
            select: ["id", "firstName", "lastName", "email", "phone"],
          } as any);
        }
        if (payment.bookingId) {
          result.booking = await this.paymentsRepo.manager.findOne("Booking", {
            where: { id: payment.bookingId },
          } as any);

          if (result.booking?.propertyId) {
            result.booking.property = await this.paymentsRepo.manager.findOne(
              "Property",
              {
                where: { id: result.booking.propertyId },
                select: ["id", "title", "city", "slug"],
              } as any,
            );
          }
          if (result.booking?.carId) {
            result.booking.car = await this.paymentsRepo.manager.findOne(
              "Car",
              {
                where: { id: result.booking.carId },
                select: ["id", "brand", "model", "year", "city"],
              } as any,
            );
          }
        }
        return result;
      }),
    );

    return { data: enriched, meta: { total, page: query.page || 1 } };
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  private generateReference(bookingId: string): string {
    const ts = Date.now().toString(36).toUpperCase();
    const suffix = bookingId.slice(0, 6).toUpperCase();
    return `SR-${ts}-${suffix}`;
  }
}
