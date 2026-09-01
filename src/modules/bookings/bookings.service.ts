import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { v4 as uuidv4 } from "uuid";

import { Booking } from "./entities/booking.entity";
import { BookingExtension } from "./entities/booking-extension.entity";
import { RedisService } from "../../config/redis.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { ExtendBookingDto } from "./dto/extend-booking.dto";
import {
  BookingStatus,
  ResourceType,
  UserRole,
  DepositStatus,
} from "../../common/enums";
import {
  countNights,
  countDays,
  calculateBookingPrice,
  calculateCarRentalPrice,
  getPaginationOptions,
  paginate,
  datesOverlap,
} from "../../common/utils";

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepo: Repository<Booking>,
    @InjectRepository(BookingExtension)
    private readonly extensionsRepo: Repository<BookingExtension>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Créer une réservation ────────────────────────────────────────────────

  async create(dto: CreateBookingDto, customerId: string): Promise<Booking> {
    const lockKey = `${dto.resource_type}:${dto.resource_id}:${dto.start_date}:${dto.end_date}`;

    // 1. Vérifier disponibilité
    const isAvailable = await this.checkAvailability(
      dto.resource_id,
      dto.resource_type,
      dto.start_date,
      dto.end_date,
    );
    if (!isAvailable) {
      throw new ConflictException(
        "Ces dates ne sont pas disponibles. Veuillez choisir d'autres dates.",
      );
    }

    // 2. Acquérir le verrou Redis (TTL 10 min)
    const lockAcquired = await this.redisService.acquireLock(lockKey, 600);
    if (!lockAcquired) {
      throw new ConflictException(
        "Une autre réservation est en cours pour ces dates. Réessayez dans quelques secondes.",
      );
    }

    try {
      // 3. Double vérification après lock (race condition)
      const stillAvailable = await this.checkAvailability(
        dto.resource_id,
        dto.resource_type,
        dto.start_date,
        dto.end_date,
      );
      if (!stillAvailable) {
        throw new ConflictException("Ces dates viennent d'être réservées.");
      }

      // 4. Calculer le prix
      const pricing = await this.calculatePrice(dto);

      // 5. Transaction PostgreSQL
      const booking = await this.dataSource.transaction(async (manager) => {
        const newBooking = (manager.create as any)(Booking, {
          customerId,
          resourceType: dto.resource_type,
          propertyId:
            dto.resource_type === ResourceType.PROPERTY
              ? dto.resource_id
              : null,
          carId:
            dto.resource_type === ResourceType.CAR ? dto.resource_id : null,
          startDate: dto.start_date,
          endDate: dto.end_date,
          guestsCount: dto.guests_count || 1,
          status: BookingStatus.PENDING,
          basePrice: pricing.basePrice,
          cleaningFee: pricing.cleaningFee,
          platformFee: pricing.platformFee,
          discountAmount: pricing.discountAmount,
          couponCode: dto.coupon_code || null,
          loyaltyPointsUsed: dto.use_loyalty_points || 0,
          walletUsed: dto.use_wallet ? pricing.walletUsed || 0 : 0,
          totalAmount: pricing.total,
          currency: "XAF",
          depositAmount: pricing.depositAmount,
          depositStatus:
            pricing.depositAmount > 0
              ? DepositStatus.PENDING
              : DepositStatus.NONE,
          specialRequests: dto.special_requests || null,
          version: 1,
        });

        return manager.save(newBooking);
      });

      this.logger.log(
        `Réservation créée: #${booking.id.slice(0, 8)} — ${booking.resourceType} — ${customerId}`,
      );

      // 6. Émettre événement → notifications + tâches automatiques
      this.eventEmitter.emit("booking.created", booking);

      return booking as Booking;
    } finally {
      // 7. Toujours libérer le lock
      await this.redisService.releaseLock(lockKey);
    }
  }

  // ─── Vérification disponibilité ───────────────────────────────────────────

  async checkAvailability(
    resourceId: string,
    resourceType: ResourceType,
    startDate: string,
    endDate: string,
  ): Promise<boolean> {
    const qb = this.bookingsRepo
      .createQueryBuilder("b")
      .where("b.status NOT IN (:...excludedStatuses)", {
        excludedStatuses: [
          BookingStatus.CANCELLED,
          BookingStatus.REJECTED,
          BookingStatus.REFUNDED,
        ],
      })
      .andWhere("b.start_date < :endDate", { endDate })
      .andWhere("b.end_date > :startDate", { startDate });

    if (resourceType === ResourceType.PROPERTY) {
      qb.andWhere("b.property_id = :resourceId", { resourceId });
    } else {
      qb.andWhere("b.car_id = :resourceId", { resourceId });
    }

    const count = await qb.getCount();
    return count === 0;
  }

  // ─── Extension de séjour ──────────────────────────────────────────────────

  async extend(
    bookingId: string,
    dto: ExtendBookingDto,
    customerId: string,
  ): Promise<BookingExtension> {
    const booking = await this.bookingsRepo.findOne({
      where: { id: bookingId, customerId },
    });

    if (!booking) {
      throw new NotFoundException("Réservation introuvable");
    }

    if (
      ![BookingStatus.CONFIRMED, BookingStatus.ACTIVE].includes(booking.status)
    ) {
      throw new BadRequestException(
        "Seules les réservations confirmées ou actives peuvent être prolongées",
      );
    }

    if (dto.new_end_date <= booking.endDate) {
      throw new BadRequestException(
        "La nouvelle date de fin doit être après la date de fin actuelle",
      );
    }

    // Vérifier disponibilité pour les nouvelles dates
    const lockKey = `ext:${booking.resourceType}:${booking.propertyId || booking.carId}:${booking.endDate}:${dto.new_end_date}`;

    const isAvailable = await this.checkAvailability(
      booking.propertyId || booking.carId,
      booking.resourceType,
      booking.endDate, // on part de la fin actuelle
      dto.new_end_date,
    );

    if (!isAvailable) {
      throw new ConflictException(
        "Ces dates ne sont pas disponibles pour la prolongation",
      );
    }

    // Calculer le supplément
    const extraNights = countNights(booking.endDate, dto.new_end_date);
    const extraDays = countDays(booking.endDate, dto.new_end_date);
    const units =
      booking.resourceType === ResourceType.PROPERTY ? extraNights : extraDays;

    // Prix unitaire de base (à récupérer depuis la propriété/voiture)
    const pricePerUnit =
      booking.basePrice /
      (booking.resourceType === ResourceType.PROPERTY
        ? countNights(booking.startDate, booking.endDate)
        : countDays(booking.startDate, booking.endDate));
    const extraAmount = Math.round(pricePerUnit * units);

    // Créer la demande d'extension
    const extension = this.extensionsRepo.create({
      bookingId,
      requestedBy: customerId,
      previousEndDate: booking.endDate,
      newEndDate: dto.new_end_date,
      extraNightsDays: units,
      extraAmount,
      status: "PENDING",
      notes: dto.notes,
    });

    const saved = await this.extensionsRepo.save(extension);

    this.eventEmitter.emit("booking.extension_requested", {
      booking,
      extension: saved,
    });

    return saved;
  }

  // ─── Annulation ───────────────────────────────────────────────────────────

  async cancel(
    bookingId: string,
    user: { id: string; role: UserRole },
    reason?: string,
  ): Promise<Booking> {
    const booking = await this.bookingsRepo.findOneOrFail({
      where: { id: bookingId },
    });

    // Vérifier que le customer annule sa propre réservation
    if (user.role === UserRole.CUSTOMER && booking.customerId !== user.id) {
      throw new ForbiddenException(
        "Vous ne pouvez annuler que vos réservations",
      );
    }

    if (
      [BookingStatus.COMPLETED, BookingStatus.REFUNDED].includes(booking.status)
    ) {
      throw new BadRequestException(
        "Cette réservation ne peut pas être annulée",
      );
    }

    await this.bookingsRepo.update(bookingId, {
      status: BookingStatus.CANCELLED,
      cancellationReason: reason || undefined,
      cancelledBy: user.id,
    });

    const updated = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });

    this.eventEmitter.emit("booking.cancelled", updated);
    this.logger.log(
      `Réservation annulée: #${bookingId.slice(0, 8)} par ${user.id}`,
    );

    return updated as Booking;
  }

  // ─── Complétion (après check-out) ────────────────────────────────────────

  async complete(bookingId: string): Promise<Booking> {
    await this.bookingsRepo.update(bookingId, {
      status: BookingStatus.COMPLETED,
      checkoutAt: new Date(),
    });

    const booking = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });
    this.eventEmitter.emit("booking.completed", booking);
    return booking as Booking;
  }

  // ─── Récupération ─────────────────────────────────────────────────────────

  async findAll(user: { id: string; role: UserRole }, query: any) {
    const { skip, take, page, perPage } = getPaginationOptions(query);
    const qb = this.bookingsRepo.createQueryBuilder("b");

    if (user.role === UserRole.CUSTOMER) {
      qb.where("b.customer_id = :userId", { userId: user.id });
    } else if (user.role === UserRole.OWNER) {
      qb.leftJoin(
        "properties",
        "p",
        "p.id = b.property_id AND p.owner_id = :userId",
        { userId: user.id },
      )
        .leftJoin("cars", "c", "c.id = b.car_id AND c.owner_id = :userId", {
          userId: user.id,
        })
        .where("p.id IS NOT NULL OR c.id IS NOT NULL");
    } else if (user.role === UserRole.CONCIERGE) {
      qb.where("b.concierge_id = :userId", { userId: user.id });
    }
    // ADMIN → pas de filtre, voit tout

    if (query.status)
      qb.andWhere("b.status = :status", { status: query.status });
    if (query.resource_type)
      qb.andWhere("b.resource_type = :resourceType", {
        resourceType: query.resource_type,
      });
    if (query.from) qb.andWhere("b.created_at >= :from", { from: query.from });
    if (query.to)
      qb.andWhere("b.created_at <= :to", { to: query.to + "T23:59:59" });

    qb.orderBy("b.created_at", "DESC").skip(skip).take(take);
    const [items, total] = await qb.getManyAndCount();

    const enriched = await Promise.all(
      items.map(async (booking) => {
        const result: any = { ...booking };
        if (booking.propertyId) {
          result.property = await this.bookingsRepo.manager.findOne(
            "Property",
            {
              where: { id: booking.propertyId },
              select: [
                "id",
                "title",
                "coverImageUrl",
                "city",
                "neighborhood",
                "checkinTime",
                "checkoutTime",
                "slug",
              ],
            } as any,
          );
        }
        if (booking.carId) {
          result.car = await this.bookingsRepo.manager.findOne("Car", {
            where: { id: booking.carId },
            select: [
              "id",
              "brand",
              "model",
              "year",
              "coverImageUrl",
              "city",
              "slug",
            ],
          } as any);
        }
        if (booking.customerId) {
          result.customer = await this.bookingsRepo.manager.findOne("User", {
            where: { id: booking.customerId },
            select: ["id", "firstName", "lastName", "email", "phone"],
          } as any);
        }
        return result;
      }),
    );

    return paginate(enriched, total, { page, perPage });
  }

  async findOne(id: string, userId: string, role: UserRole): Promise<Booking> {
    const booking = await this.bookingsRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException("Réservation introuvable");

    if (role === UserRole.CUSTOMER && booking.customerId !== userId) {
      throw new ForbiddenException("Accès refusé");
    }

    return booking as Booking;
  }

  // ─── Calcul du prix ───────────────────────────────────────────────────────

  private async calculatePrice(dto: CreateBookingDto): Promise<any> {
    if (dto.resource_type === ResourceType.PROPERTY) {
      const nights = countNights(dto.start_date, dto.end_date);
      // TODO: récupérer pricePerNight, cleaningFee, depositAmount depuis la propriété
      const pricePerNight = 45000; // placeholder
      const cleaningFee = 8000;
      const depositAmount = 0;

      return calculateBookingPrice({
        pricePerNight,
        nights,
        cleaningFee,
        commissionRate: 10,
        depositAmount,
      });
    } else {
      const days = countDays(dto.start_date, dto.end_date);
      const pricePerDay = 18000; // placeholder
      const depositAmount = 50000;

      return calculateCarRentalPrice({
        pricePerDay,
        days,
        commissionRate: 10,
        depositAmount,
      });
    }
  }
}
