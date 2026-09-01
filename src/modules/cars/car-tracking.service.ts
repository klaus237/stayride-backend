import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RedisService } from '../../config/redis.service';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus, ResourceType } from '../../common/enums';

export interface LocationPoint {
  lat: number;
  lng: number;
  speed?: number;
  recordedAt: string;
}

@Injectable()
export class CarTrackingService {
  private readonly logger = new Logger(CarTrackingService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepo: Repository<Booking>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Mettre à jour position (appelé depuis l'app client) ──────────────────

  async updateLocation(
    carId: string,
    bookingId: string,
    customerId: string,
    lat: number,
    lng: number,
    speed?: number,
  ): Promise<void> {
    // Vérifier que la réservation est active et appartient au client
    const booking = await this.bookingsRepo.findOne({
      where: {
        id: bookingId,
        carId,
        customerId,
        status: BookingStatus.ACTIVE,
        resourceType: ResourceType.CAR,
      },
    });

    if (!booking) {
      throw new ForbiddenException(
        'Tracking non autorisé pour cette réservation',
      );
    }

    // Stocker en Redis (temps réel, TTL 60s)
    await this.redisService.setCarLocation(carId, { lat, lng, speed });

    // Persister en PostgreSQL (historique)
    await this.dataSource.manager.insert('vehicle_tracking_logs', {
      car_id: carId,
      booking_id: bookingId,
      lat,
      lng,
      speed_kmh: speed || null,
      recorded_at: new Date(),
    });

    // Mettre à jour la position dans la table cars
    await this.dataSource.manager.update(
      'cars',
      { id: carId },
      {
        last_known_lat: lat,
        last_known_lng: lng,
        last_location_at: new Date(),
      },
    );
  }

  // ─── Obtenir position actuelle ────────────────────────────────────────────

  async getLastLocation(
    carId: string,
    bookingId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<LocationPoint | null> {
    // Vérifier l'accès
    await this.validateTrackingAccess(bookingId, requesterId, requesterRole);

    // Essayer Redis d'abord (plus récent)
    const redisLocation = await this.redisService.getCarLocation(carId);
    if (redisLocation) {
      return {
        lat: redisLocation.lat,
        lng: redisLocation.lng,
        speed: redisLocation.speed,
        recordedAt: redisLocation.updatedAt,
      };
    }

    // Fallback PostgreSQL
    const result = await this.dataSource.manager.query(
      `SELECT lat, lng, speed_kmh, recorded_at
       FROM vehicle_tracking_logs
       WHERE car_id = $1 AND booking_id = $2
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [carId, bookingId],
    );

    if (!result.length) return null;

    return {
      lat: result[0].lat,
      lng: result[0].lng,
      speed: result[0].speed_kmh,
      recordedAt: result[0].recorded_at,
    };
  }

  // ─── Historique complet du trajet ─────────────────────────────────────────

  async getTrackingHistory(
    bookingId: string,
    ownerId: string,
  ): Promise<LocationPoint[]> {
    // Vérifier que la voiture appartient au propriétaire
    const booking = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) throw new ForbiddenException('Réservation introuvable');

    const logs = await this.dataSource.manager.query(
      `SELECT lat, lng, speed_kmh, recorded_at
       FROM vehicle_tracking_logs
       WHERE booking_id = $1
       ORDER BY recorded_at ASC`,
      [bookingId],
    );

    return logs.map((l: any) => ({
      lat: parseFloat(l.lat),
      lng: parseFloat(l.lng),
      speed: l.speed_kmh ? parseFloat(l.speed_kmh) : undefined,
      recordedAt: l.recorded_at,
    }));
  }

  // ─── Arrêter le tracking (fin de location) ────────────────────────────────

  async stopTracking(carId: string, bookingId: string): Promise<void> {
    await this.redisService.del(`car:location:${carId}`);
    this.logger.log(`Tracking arrêté: voiture ${carId}, réservation ${bookingId}`);
  }

  // ─── Validation accès tracking ────────────────────────────────────────────

  private async validateTrackingAccess(
    bookingId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    if (role === 'ADMIN') return; // Admin voit tout

    const booking = await this.bookingsRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new ForbiddenException('Réservation introuvable');

    if (role === 'CUSTOMER') {
      // Le client ne voit que sa propre location, seulement si active
      if (booking.customerId !== userId) throw new ForbiddenException('Accès refusé');
      if (booking.status !== BookingStatus.ACTIVE) {
        throw new BadRequestException('Le tracking n\'est disponible que pendant la location');
      }
    }

    // OWNER → vérifié dans le controller via ownership guard
  }
}
