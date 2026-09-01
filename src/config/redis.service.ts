import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => this.logger.log('Redis connecté'));
    this.client.on('error', (err) => this.logger.error('Redis erreur', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ─── Opérations de base ──────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ─── Verrous distribués (anti-double réservation) ─────────────────────────

  async acquireLock(key: string, ttlSeconds = 600): Promise<boolean> {
    // NX = seulement si la clé n'existe pas (atomique)
    const result = await this.client.set(
      `lock:${key}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(`lock:${key}`);
  }

  // ─── Cache JSON ───────────────────────────────────────────────────────────

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // ─── Tracking GPS véhicule ────────────────────────────────────────────────

  async setCarLocation(
    carId: string,
    location: { lat: number; lng: number; speed?: number },
  ): Promise<void> {
    await this.setJson(`car:location:${carId}`, {
      ...location,
      updatedAt: new Date().toISOString(),
    }, 60); // TTL 60s — écrasé à chaque mise à jour
  }

  async getCarLocation(carId: string): Promise<{
    lat: number;
    lng: number;
    speed?: number;
    updatedAt: string;
  } | null> {
    return this.getJson(`car:location:${carId}`);
  }

  // ─── Blacklist JWT (logout) ───────────────────────────────────────────────

  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.set(`blacklist:${jti}`, '1', ttlSeconds);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.exists(`blacklist:${jti}`);
  }

  // ─── Cache settings plateforme ────────────────────────────────────────────

  async cacheSettings(settings: Record<string, any>): Promise<void> {
    await this.setJson('platform:settings', settings, 300); // 5 min
  }

  async getCachedSettings(): Promise<Record<string, any> | null> {
    return this.getJson('platform:settings');
  }

  async invalidateSettingsCache(): Promise<void> {
    await this.del('platform:settings');
  }
}
