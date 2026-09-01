import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { RedisService } from '../../config/redis.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  // ─── Génération des tokens ────────────────────────────────────────────────

  async generateTokens(user: User, deviceInfo?: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(), // JWT ID unique pour la blacklist
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES', '15m'),
    });

    const refreshTokenValue = this.generateSecureToken();

    // Stocker le refresh token hashé en base
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const refreshToken = this.refreshTokenRepo.create({
      user,
      tokenHash: this.hashToken(refreshTokenValue),
      deviceInfo: deviceInfo || {},
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
      expires_in: 900, // 15 minutes en secondes
    };
  }

  // ─── Refresh des tokens ───────────────────────────────────────────────────

  async refreshTokens(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (storedToken.revokedAt) {
      // Token déjà révoqué — potentielle attaque de réutilisation
      this.logger.warn(
        `Tentative de réutilisation de refresh token révoqué: ${storedToken.user.email}`,
      );
      await this.revokeAllUserTokens(storedToken.user.id);
      throw new UnauthorizedException('Session compromise. Reconnectez-vous.');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
    }

    // Rotation du refresh token (révocation + nouveau)
    await this.refreshTokenRepo.update(storedToken.id, {
      revokedAt: new Date(),
    });

    const newTokens = await this.generateTokens(storedToken.user);
    return { user: storedToken.user, newTokens };
  }

  // ─── Révocation ───────────────────────────────────────────────────────────

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenRepo.update(
      { tokenHash },
      { revokedAt: new Date() },
    );
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { user: { id: userId }, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  async validateAccessToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
      });

      // Vérifier blacklist Redis
      if (await this.redisService.isTokenBlacklisted(payload.jti)) {
        throw new UnauthorizedException('Token révoqué');
      }

      return payload;
    } catch (err) {
      throw new UnauthorizedException('Token invalide');
    }
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  generateSecureToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
