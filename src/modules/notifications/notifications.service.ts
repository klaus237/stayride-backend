import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { OnEvent } from "@nestjs/event-emitter";
import { Notification } from "./notification.entity";
import { User } from "../users/entities/user.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { NotificationChannel } from "../../common/enums";

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
  ) {}

  onModuleInit() {
    this.initFirebase();
    this.initMailer();
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private initFirebase() {
    try {
      const projectId = this.configService.get("FIREBASE_PROJECT_ID");
      const privateKey = this.configService.get("FIREBASE_PRIVATE_KEY");
      const clientEmail = this.configService.get("FIREBASE_CLIENT_EMAIL");

      if (projectId && privateKey && clientEmail) {
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey: privateKey.replace(/\\n/g, "\n"),
              clientEmail,
            }),
          });
        }
        this.firebaseInitialized = true;
        this.logger.log("Firebase FCM initialisé");
      }
    } catch (err) {
      this.logger.warn(`Firebase non initialisé: ${err.message}`);
    }
  }

  private initMailer() {
    const nodeEnv = this.configService.get("NODE_ENV");

    if (nodeEnv === "development") {
      // MailHog en développement
      this.transporter = nodemailer.createTransport({
        host: "localhost",
        port: 1025,
        ignoreTLS: true,
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: "smtp.mailgun.org",
        port: 587,
        auth: {
          user: `postmaster@${this.configService.get("MAILGUN_DOMAIN")}`,
          pass: this.configService.get("MAILGUN_API_KEY"),
        },
      });
    }
    this.logger.log("Mailer initialisé");
  }

  // ─── Envoi Push FCM ───────────────────────────────────────────────────────

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseInitialized) return;

    try {
      // Récupérer les tokens FCM de l'utilisateur depuis la DB
      // TODO: requête fcm_tokens table
      // Pour l'instant on log
      this.logger.log(`Push → ${userId}: ${title}`);
    } catch (err) {
      this.logger.error(`Erreur push notification: ${err.message}`);
    }
  }

  async sendPushToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseInitialized) return;

    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data,
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      });
    } catch (err) {
      this.logger.error(`Erreur push token: ${err.message}`);
    }
  }

  // ─── Envoi Email ──────────────────────────────────────────────────────────

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `${this.configService.get("MAIL_FROM_NAME", "StayRide")} <${this.configService.get("MAIL_FROM", "noreply@stayride.cm")}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email envoyé à ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Erreur email: ${err.message}`);
    }
  }

  // ─── Templates email ──────────────────────────────────────────────────────

  async sendEmailVerification(user: User, token: string): Promise<void> {
    const frontendUrl = this.configService.get(
      "FRONTEND_URL",
      "http://localhost:4200",
    );
    const url = `${frontendUrl}/auth/verify-email?token=${token}`;
    const lang = user.language || "fr";

    const subjects = {
      fr: "Vérifiez votre adresse email — StayRide",
      en: "Verify your email address — StayRide",
    };

    const html =
      lang === "fr"
        ? this.emailTemplate(`
          <h2>Bonjour ${user.firstName},</h2>
          <p>Merci de vous être inscrit sur StayRide. Cliquez sur le bouton ci-dessous pour vérifier votre adresse email.</p>
          <a href="${url}" style="background:#E85D24;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
            Vérifier mon email
          </a>
          <p>Ce lien expire dans 24 heures.</p>
          <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
        `)
        : this.emailTemplate(`
          <h2>Hello ${user.firstName},</h2>
          <p>Thank you for signing up on StayRide. Click the button below to verify your email address.</p>
          <a href="${url}" style="background:#E85D24;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
            Verify my email
          </a>
          <p>This link expires in 24 hours.</p>
        `);

    await this.sendEmail(user.email, subjects[lang], html);
  }

  async sendPasswordReset(user: User, token: string): Promise<void> {
    const frontendUrl = this.configService.get("FRONTEND_URL");
    const url = `${frontendUrl}/auth/reset-password?token=${token}`;
    const lang = user.language || "fr";

    const html = this.emailTemplate(`
      <h2>${lang === "fr" ? "Réinitialisation de mot de passe" : "Password Reset"}</h2>
      <p>${
        lang === "fr"
          ? `Bonjour ${user.firstName}, vous avez demandé à réinitialiser votre mot de passe.`
          : `Hello ${user.firstName}, you requested a password reset.`
      }</p>
      <a href="${url}" style="background:#E85D24;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
        ${lang === "fr" ? "Réinitialiser mon mot de passe" : "Reset my password"}
      </a>
      <p>${lang === "fr" ? "Ce lien expire dans 1 heure." : "This link expires in 1 hour."}</p>
    `);

    await this.sendEmail(
      user.email,
      lang === "fr"
        ? "Réinitialisation de mot de passe — StayRide"
        : "Password Reset — StayRide",
      html,
    );
  }

  async sendBookingConfirmation(booking: Booking): Promise<void> {
    // TODO: récupérer user et envoyer email de confirmation
    this.logger.log(`Email confirmation réservation: ${booking.id}`);
  }

  // ─── Sauvegarder notification en base ────────────────────────────────────

  async saveNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: any,
    channel: NotificationChannel = NotificationChannel.PUSH,
  ): Promise<Notification> {
    const notif = this.notifRepo.create({
      userId,
      type,
      title,
      body,
      data,
      channel,
      sentAt: new Date(),
    });
    return this.notifRepo.save(notif);
  }

  // ─── Listeners d'événements ───────────────────────────────────────────────

  @OnEvent("booking.created")
  async onBookingCreated(booking: Booking) {
    await Promise.all([
      this.sendPush(
        booking.customerId,
        "Réservation reçue",
        "Votre demande est en cours de traitement.",
        { booking_id: booking.id, type: "BOOKING_CREATED" },
      ),
      this.saveNotification(
        booking.customerId,
        "BOOKING_CREATED",
        "Réservation reçue",
        "Effectuez le paiement pour confirmer.",
        { booking_id: booking.id },
      ),
    ]);
  }

  @OnEvent("booking.confirmed")
  async onBookingConfirmed(booking: Booking) {
    await Promise.all([
      this.sendPush(
        booking.customerId,
        "✅ Réservation confirmée !",
        "Votre paiement a été reçu. Bonne location !",
        { booking_id: booking.id, type: "BOOKING_CONFIRMED" },
      ),
      this.saveNotification(
        booking.customerId,
        "BOOKING_CONFIRMED",
        "Réservation confirmée",
        "Votre paiement a été reçu.",
        { booking_id: booking.id },
      ),
    ]);
  }

  @OnEvent("booking.cancelled")
  async onBookingCancelled(booking: Booking) {
    await this.sendPush(
      booking.customerId,
      "Réservation annulée",
      "Votre réservation a été annulée.",
      { booking_id: booking.id, type: "BOOKING_CANCELLED" },
    );
  }

  @OnEvent("booking.extension_requested")
  async onExtensionRequested(payload: { booking: Booking; extension: any }) {
    // Notifier le propriétaire si approbation requise
    this.logger.log(`Extension demandée: ${payload.extension.id}`);
  }

  @OnEvent("booking.completed")
  async onBookingCompleted(booking: Booking) {
    await this.sendPush(
      booking.customerId,
      "Séjour terminé",
      "Comment s'est passé votre séjour ? Laissez un avis !",
      { booking_id: booking.id, type: "REVIEW_REQUEST" },
    );
  }

  // ─── Template HTML email ──────────────────────────────────────────────────

  private emailTemplate(content: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
            <div style="background:#1a1a2e;padding:20px 30px;">
              <h1 style="color:#fff;margin:0;font-size:24px;">StayRide</h1>
              <p style="color:#aaa;margin:4px 0 0;font-size:12px;">Appartements & Voitures au Cameroun</p>
            </div>
            <div style="padding:30px;color:#333;line-height:1.6;">
              ${content}
            </div>
            <div style="background:#f9f9f9;padding:20px 30px;text-align:center;font-size:12px;color:#999;">
              <p>© 2026 StayRide · Cameroun</p>
              <p>Si vous avez des questions, contactez-nous sur WhatsApp ou à support@stayride.cm</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // ─── Récupération des notifications ──────────────────────────────────────

  async getUserNotifications(userId: string) {
    return this.notifRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async markAsRead(notifId: string, userId: string): Promise<void> {
    await this.notifRepo.update(
      { id: notifId, userId },
      { readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notifRepo.update({ userId }, { readAt: new Date() });
  }
}
