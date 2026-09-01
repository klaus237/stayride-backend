import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking } from './entities/booking.entity';
import { BookingExtension } from './entities/booking-extension.entity';
import { RedisService } from '../../config/redis.service';
import { BookingStatus, ResourceType, UserRole } from '../../common/enums';

// Mock du repository TypeORM
const mockBookingsRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockExtensionsRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockRedis = {
  acquireLock: jest.fn(),
  releaseLock: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking), useValue: mockBookingsRepo },
        { provide: getRepositoryToken(BookingExtension), useValue: mockExtensionsRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: 'DataSource', useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
  });

  // ─── Test 1: Double réservation ───────────────────────────────────────────

  describe('create()', () => {
    it('doit refuser si les dates sont déjà réservées', async () => {
      // Simuler une disponibilité bloquée
      jest.spyOn(service, 'checkAvailability').mockResolvedValue(false);

      await expect(
        service.create(
          {
            resource_type: ResourceType.PROPERTY,
            resource_id: 'prop-uuid',
            start_date: '2026-09-11',
            end_date: '2026-09-14',
          },
          'customer-uuid',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('doit refuser si le verrou Redis est déjà pris', async () => {
      jest.spyOn(service, 'checkAvailability').mockResolvedValue(true);
      mockRedis.acquireLock.mockResolvedValue(false);

      await expect(
        service.create(
          {
            resource_type: ResourceType.PROPERTY,
            resource_id: 'prop-uuid',
            start_date: '2026-09-11',
            end_date: '2026-09-14',
          },
          'customer-uuid',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('doit libérer le verrou même en cas d\'erreur', async () => {
      jest.spyOn(service, 'checkAvailability').mockResolvedValue(true);
      mockRedis.acquireLock.mockResolvedValue(true);
      mockDataSource.transaction.mockRejectedValue(new Error('DB Error'));

      await expect(
        service.create(
          {
            resource_type: ResourceType.PROPERTY,
            resource_id: 'prop-uuid',
            start_date: '2026-09-11',
            end_date: '2026-09-14',
          },
          'customer-uuid',
        ),
      ).rejects.toThrow();

      // Le verrou DOIT être libéré même en cas d'erreur
      expect(mockRedis.releaseLock).toHaveBeenCalled();
    });
  });

  // ─── Test 2: Annulation ───────────────────────────────────────────────────

  describe('cancel()', () => {
    it('doit refuser qu\'un client annule la réservation d\'un autre', async () => {
      mockBookingsRepo.findOneOrFail.mockResolvedValue({
        id: 'booking-uuid',
        customerId: 'autre-customer-uuid',
        status: BookingStatus.CONFIRMED,
      });

      await expect(
        service.cancel(
          'booking-uuid',
          { id: 'mon-customer-uuid', role: UserRole.CUSTOMER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('doit refuser d\'annuler une réservation déjà complétée', async () => {
      mockBookingsRepo.findOneOrFail.mockResolvedValue({
        id: 'booking-uuid',
        customerId: 'customer-uuid',
        status: BookingStatus.COMPLETED,
      });

      await expect(
        service.cancel(
          'booking-uuid',
          { id: 'customer-uuid', role: UserRole.CUSTOMER },
        ),
      ).rejects.toThrow();
    });

    it('doit autoriser l\'admin à annuler n\'importe quelle réservation', async () => {
      mockBookingsRepo.findOneOrFail.mockResolvedValue({
        id: 'booking-uuid',
        customerId: 'autre-uuid',
        status: BookingStatus.CONFIRMED,
      });
      mockBookingsRepo.update.mockResolvedValue({});
      mockBookingsRepo.findOne.mockResolvedValue({
        id: 'booking-uuid',
        status: BookingStatus.CANCELLED,
      });

      const result = await service.cancel(
        'booking-uuid',
        { id: 'admin-uuid', role: UserRole.ADMIN },
      );

      expect(mockBookingsRepo.update).toHaveBeenCalled();
    });
  });

  // ─── Test 3: Vérification disponibilité ──────────────────────────────────

  describe('checkAvailability()', () => {
    it('doit retourner true si aucune réservation active sur ces dates', async () => {
      const mockQB = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      mockBookingsRepo.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.checkAvailability(
        'prop-uuid',
        ResourceType.PROPERTY,
        '2026-09-11',
        '2026-09-14',
      );

      expect(result).toBe(true);
    });

    it('doit retourner false si une réservation existe sur ces dates', async () => {
      const mockQB = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };
      mockBookingsRepo.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.checkAvailability(
        'prop-uuid',
        ResourceType.PROPERTY,
        '2026-09-11',
        '2026-09-14',
      );

      expect(result).toBe(false);
    });
  });

  // ─── Test 4: Extension ────────────────────────────────────────────────────

  describe('extend()', () => {
    it('doit refuser une extension si la nouvelle date est avant la date actuelle', async () => {
      mockBookingsRepo.findOne.mockResolvedValue({
        id: 'booking-uuid',
        customerId: 'customer-uuid',
        status: BookingStatus.CONFIRMED,
        endDate: '2026-09-14',
      });

      await expect(
        service.extend(
          'booking-uuid',
          { new_end_date: '2026-09-13' }, // avant la date actuelle !
          'customer-uuid',
        ),
      ).rejects.toThrow();
    });
  });
});
