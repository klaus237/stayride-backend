import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import * as argon2 from "argon2";

import { User } from "../users/entities/user.entity";
import { TokenService } from "./token.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UserRole } from "../../common/enums";
import { generateReferralCode } from "../../common/utils";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Inscription ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Vérifier unicité email
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException("Un compte existe déjà avec cet email");
    }

    // Hash du mot de passe avec argon2
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Code de vérification email
    const emailVerificationToken = this.tokenService.generateSecureToken();
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Gestion parrainage
    let referredBy: User | null = null;
    if (dto.referral_code) {
      referredBy = await this.usersRepo.findOne({
        where: { referralCode: dto.referral_code.toUpperCase() },
      });
    }

    // Création utilisateur
    const user = this.usersRepo.create({
      email: dto.email.toLowerCase(),
      phone: dto.phone,
      firstName: dto.first_name,
      lastName: dto.last_name,
      passwordHash,
      role: UserRole.CUSTOMER,
      language: (dto.language || "fr") as any,
      referralCode: generateReferralCode(dto.first_name),
      referredBy: referredBy || undefined,
      emailVerificationToken,
      emailVerificationExpires,
      isEmailVerified: false,
      isActive: true,
      loyaltyPoints: 0,
      walletBalance: 0,
    });

    const savedUser = await this.usersRepo.save(user) as unknown as User;

    // Envoyer email de vérification
    await this.notificationsService.sendEmailVerification(
      savedUser,
      emailVerificationToken,
    );

    // Émettre événement parrainage
    if (referredBy) {
      this.eventEmitter.emit("referral.created", {
        referrerId: referredBy.id,
        referredId: savedUser.id,
      });
    }

    this.logger.log(`Nouvel utilisateur inscrit: ${savedUser.email}`);

    // Générer les tokens
    const tokens = await this.tokenService.generateTokens(savedUser);

    return {
      user: this.sanitizeUser(savedUser),
      ...tokens,
    };
  }

  // ─── Connexion ────────────────────────────────────────────────────────────

  async login(dto: LoginDto, deviceInfo?: any) {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      select: [
        "id",
        "email",
        "phone",
        "firstName",
        "lastName",
        "passwordHash",
        "role",
        "language",
        "isActive",
        "isEmailVerified",
        "referralCode",
        "loyaltyPoints",
        "loyaltyTier",
        "walletBalance",
      ],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Email ou mot de passe incorrect");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Compte suspendu. Contactez le support.");
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException("Email ou mot de passe incorrect");
    }

    const tokens = await this.tokenService.generateTokens(user, deviceInfo);
    this.logger.log(`Connexion: ${user.email} [${user.role}]`);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ─── Refresh token ────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    const { user, newTokens } =
      await this.tokenService.refreshTokens(refreshToken);
    return {
      user: this.sanitizeUser(user),
      ...newTokens,
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
    }
    this.logger.log(`Déconnexion: ${userId}`);
    return { message: "Déconnecté" };
  }

  // ─── Vérification email ───────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.usersRepo.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException("Token invalide");
    }

    if (user.emailVerificationExpires < new Date()) {
      throw new BadRequestException("Token expiré. Demandez un nouveau.");
    }

    if (user.isEmailVerified) {
      return { message: "Email déjà vérifié" };
    }

    await this.usersRepo.update(user.id, {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      emailVerificationToken: undefined,
      emailVerificationExpires: undefined,
    });

    this.eventEmitter.emit("user.email_verified", { userId: user.id });
    return { message: "Email vérifié avec succès" };
  }

  // ─── Mot de passe oublié ──────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.usersRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    // Toujours retourner le même message (évite l'énumération d'emails)
    if (!user) {
      return { message: "Si ce compte existe, un email a été envoyé." };
    }

    const resetToken = this.tokenService.generateSecureToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.usersRepo.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    await this.notificationsService.sendPasswordReset(user, resetToken);
    return { message: "Si ce compte existe, un email a été envoyé." };
  }

  // ─── Réinitialisation mot de passe ────────────────────────────────────────

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersRepo.findOne({
      where: { passwordResetToken: token },
    });

    if (!user || user.passwordResetExpires < new Date()) {
      throw new BadRequestException("Token invalide ou expiré");
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.usersRepo.update(user.id, {
      passwordHash,
      passwordResetToken: undefined,
      passwordResetExpires: undefined,
    });

    // Révoquer tous les refresh tokens
    await this.tokenService.revokeAllUserTokens(user.id);

    return { message: "Mot de passe modifié. Reconnectez-vous." };
  }

  // ─── Renvoi email vérification ────────────────────────────────────────────

  async resendVerification(userId: string) {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });

    if (user.isEmailVerified) {
      return { message: "Email déjà vérifié" };
    }

    const token = this.tokenService.generateSecureToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.usersRepo.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    });

    await this.notificationsService.sendEmailVerification(user, token);
    return { message: "Email de vérification renvoyé" };
  }

  // ─── Sanitize ─────────────────────────────────────────────────────────────

  private sanitizeUser(user: User) {
    const {
      passwordHash,
      passwordResetToken,
      emailVerificationToken,
      ...safe
    } = user;
    return safe;
  }
}
