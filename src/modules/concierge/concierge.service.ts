import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import dayjs from "dayjs";

import { Task } from "./entities/task.entity";
import { ConciergeAssignment } from "./entities/concierge-assignment.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { StorageService } from "../storage/cloudinary.service";
import {
  TaskStatus,
  TaskType,
  BookingStatus,
  DepositStatus,
} from "../../common/enums";

@Injectable()
export class ConciergeService {
  private readonly logger = new Logger(ConciergeService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(ConciergeAssignment)
    private readonly assignmentsRepo: Repository<ConciergeAssignment>,
    @InjectRepository(Booking)
    private readonly bookingsRepo: Repository<Booking>,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Vue du jour ──────────────────────────────────────────────────────────

  async getTodayOverview(conciergeId: string) {
    const today = dayjs().format("YYYY-MM-DD");

    // Récupérer les IDs des propriétés assignées
    const assignments = await this.assignmentsRepo.find({
      where: { conciergeId, isActive: true },
    });
    const propertyIds = assignments
      .filter((a) => a.propertyId)
      .map((a) => a.propertyId);
    const carIds = assignments.filter((a) => a.carId).map((a) => a.carId);

    if (!propertyIds.length && !carIds.length) {
      return {
        checkins: [],
        checkouts: [],
        tasks: [],
        summary: { checkins: 0, checkouts: 0, tasks: 0 },
      };
    }

    // Check-ins du jour
    const checkins = await this.bookingsRepo
      .createQueryBuilder("b")
      .where("b.start_date = :today", { today })
      .andWhere("b.status = :status", { status: BookingStatus.CONFIRMED })
      .andWhere(
        propertyIds.length ? "b.property_id IN (:...propertyIds)" : "1=0",
        { propertyIds },
      )
      .getMany();

    // Check-outs du jour
    const checkouts = await this.bookingsRepo
      .createQueryBuilder("b")
      .where("b.end_date = :today", { today })
      .andWhere("b.status IN (:...statuses)", {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.ACTIVE],
      })
      .andWhere(
        propertyIds.length ? "b.property_id IN (:...propertyIds)" : "1=0",
        { propertyIds },
      )
      .getMany();

    // Tâches du jour
    const tasks = await this.tasksRepo
      .createQueryBuilder("t")
      .where("t.assigned_to = :conciergeId", { conciergeId })
      .andWhere("t.status != :done", { done: TaskStatus.DONE })
      .orderBy("t.priority", "DESC")
      .addOrderBy("t.due_at", "ASC")
      .getMany();

    return {
      checkins,
      checkouts,
      tasks,
      summary: {
        checkins: checkins.length,
        checkouts: checkouts.length,
        tasks: tasks.length,
      },
    };
  }

  // ─── Gestion des tâches ───────────────────────────────────────────────────

  async getTasks(conciergeId: string, query: any) {
    const qb = this.tasksRepo
      .createQueryBuilder("t")
      .where("t.assigned_to = :conciergeId", { conciergeId })
      .orderBy("t.priority", "DESC")
      .addOrderBy("t.due_at", "ASC");

    if (query.status)
      qb.andWhere("t.status = :status", { status: query.status });
    if (query.priority)
      qb.andWhere("t.priority = :priority", { priority: query.priority });

    return qb.getMany();
  }

  async getTask(taskId: string, conciergeId: string): Promise<Task> {
    const task = await this.tasksRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Tâche introuvable");
    if (task.assignedTo !== conciergeId)
      throw new ForbiddenException("Accès refusé");
    return task;
  }

  async startTask(taskId: string, conciergeId: string): Promise<Task> {
    await this.getTask(taskId, conciergeId);
    await this.tasksRepo.update(taskId, {
      status: TaskStatus.IN_PROGRESS,
      startedAt: new Date(),
    });
    return this.tasksRepo.findOne({ where: { id: taskId } }) as any;
  }

  async completeTask(
    taskId: string,
    conciergeId: string,
    data: { notes?: string; photos?: string[] },
  ): Promise<Task> {
    const task = await this.getTask(taskId, conciergeId);

    await this.tasksRepo.update(taskId, {
      status: TaskStatus.DONE,
      completedAt: new Date(),
      notes: data.notes,
      photos: data.photos || task.photos || [],
    });

    const updated = await this.tasksRepo.findOne({ where: { id: taskId } });
    this.eventEmitter.emit("task.completed", updated);
    return updated!;
  }

  async reportIssue(
    taskId: string,
    conciergeId: string,
    description: string,
  ): Promise<Task> {
    await this.getTask(taskId, conciergeId);
    await this.tasksRepo.update(taskId, {
      status: TaskStatus.ISSUE_REPORTED,
      issueReported: true,
      issueDescription: description,
    });

    const updated = await this.tasksRepo.findOne({ where: { id: taskId } });
    this.eventEmitter.emit("task.issue_reported", updated);
    return updated!;
  }

  // ─── Workflow Check-in ────────────────────────────────────────────────────

  async startCheckin(bookingId: string, conciergeId: string) {
    const booking = await this.validateConciergeAccess(bookingId, conciergeId);

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        "La réservation doit être confirmée pour faire le check-in",
      );
    }

    this.logger.log(
      `Check-in démarré: ${bookingId} par concierge ${conciergeId}`,
    );
    return { message: "Check-in démarré", booking };
  }

  async collectDeposit(
    bookingId: string,
    conciergeId: string,
    data: {
      amount_received: number;
      proof_url?: string;
      client_signature?: string;
    },
  ): Promise<Booking> {
    const booking = await this.validateConciergeAccess(bookingId, conciergeId);

    if (booking.depositStatus !== DepositStatus.PENDING) {
      throw new BadRequestException(
        "La caution a déjà été collectée ou n'est pas requise",
      );
    }

    await this.bookingsRepo.update(bookingId, {
      depositStatus: DepositStatus.HELD,
      depositCollectedAt: new Date(),
      depositCollectedBy: conciergeId,
      depositProofUrl: data.proof_url,
    });

    this.logger.log(
      `Caution collectée: ${data.amount_received} XAF — Résa ${bookingId}`,
    );
    return this.bookingsRepo.findOne({ where: { id: bookingId } }) as any;
  }

  async confirmCheckin(
    bookingId: string,
    conciergeId: string,
  ): Promise<Booking> {
    const booking = await this.validateConciergeAccess(bookingId, conciergeId);

    await this.bookingsRepo.update(bookingId, {
      status: BookingStatus.ACTIVE,
      checkinAt: new Date(),
    });

    const updated = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });
    this.eventEmitter.emit("booking.checkin_confirmed", updated);
    this.logger.log(`Check-in confirmé: ${bookingId}`);
    return updated!;
  }

  // ─── Workflow Check-out ───────────────────────────────────────────────────

  async startCheckout(bookingId: string, conciergeId: string) {
    const booking = await this.validateConciergeAccess(bookingId, conciergeId);

    if (booking.status !== BookingStatus.ACTIVE) {
      throw new BadRequestException(
        "La réservation doit être active pour faire le check-out",
      );
    }

    return { message: "Check-out démarré", booking };
  }

  async confirmCheckout(
    bookingId: string,
    conciergeId: string,
  ): Promise<Booking> {
    const booking = await this.validateConciergeAccess(bookingId, conciergeId);

    await this.bookingsRepo.update(bookingId, {
      status: BookingStatus.COMPLETED,
      checkoutAt: new Date(),
      depositStatus:
        booking.depositStatus === DepositStatus.HELD
          ? DepositStatus.UNDER_REVIEW
          : booking.depositStatus,
    });

    const updated = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });
    this.eventEmitter.emit("booking.completed", updated);
    this.logger.log(`Check-out confirmé: ${bookingId}`);
    return updated!;
  }

  // ─── Inspection véhicule ──────────────────────────────────────────────────

  async createInspection(
    bookingId: string,
    conciergeId: string,
    data: {
      type: "PRE_RENTAL" | "POST_RENTAL";
      condition: string;
      fuel_level_pct: number;
      mileage_km: number;
      damages_found: boolean;
      damage_notes?: string;
      photos?: string[];
      client_signature?: string;
    },
  ) {
    await this.validateConciergeAccess(bookingId, conciergeId);

    const inspection = await this.dataSource.manager.save(
      "vehicle_inspections",
      {
        bookingId,
        carId: null, // récupéré depuis la réservation
        inspectionType: data.type,
        inspectedBy: conciergeId,
        condition: data.condition,
        fuelLevelPct: data.fuel_level_pct,
        mileageKm: data.mileage_km,
        damagesFound: data.damages_found,
        damageNotes: data.damage_notes,
        photos: data.photos || [],
        clientSignature: data.client_signature,
        inspectedAt: new Date(),
      },
    );

    if (data.damages_found && data.type === "POST_RENTAL") {
      this.eventEmitter.emit("inspection.damages_found", {
        bookingId,
        inspection,
      });
    }

    return inspection;
  }

  // ─── Assignation concierge ────────────────────────────────────────────────

  async assignConcierge(
    conciergeId: string,
    resourceType: "PROPERTY" | "CAR",
    resourceId: string,
    assignedBy: string,
  ): Promise<ConciergeAssignment> {
    const existing = await this.assignmentsRepo.findOne({
      where: {
        conciergeId,
        ...(resourceType === "PROPERTY"
          ? { propertyId: resourceId }
          : { carId: resourceId }),
        isActive: true,
      },
    });

    if (existing) return existing;

    const assignment = (this.assignmentsRepo.create as any)({
      conciergeId,
      resourceType,
      propertyId: resourceType === "PROPERTY" ? resourceId : null,
      carId: resourceType === "CAR" ? resourceId : null,
      assignedBy,
      isActive: true,
    });

    return this.assignmentsRepo.save(assignment as any);
  }

  // ─── Création tâche par propriétaire ─────────────────────────────────────

  async createTask(data: {
    bookingId?: string;
    assignedTo: string;
    createdBy: string;
    type: TaskType;
    title: string;
    description?: string;
    priority?: string;
    dueAt?: Date;
  }): Promise<Task> {
    const task = (this.tasksRepo.create as any)({
      bookingId: data.bookingId,
      assignedTo: data.assignedTo,
      createdBy: data.createdBy,
      type: data.type,
      title: data.title,
      description: data.description,
      priority: data.priority || "MEDIUM",
      status: TaskStatus.TODO,
      dueAt: data.dueAt,
    });

    const saved = await this.tasksRepo.save(task);
    this.eventEmitter.emit("task.created", saved);
    return saved as unknown as Task;
  }

  // ─── Validation accès concierge ───────────────────────────────────────────

  private async validateConciergeAccess(
    bookingId: string,
    conciergeId: string,
  ): Promise<Booking> {
    const booking = await this.bookingsRepo.findOne({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException("Réservation introuvable");

    // Vérifier l'assignation
    const resourceId = booking.propertyId || booking.carId;
    const assignment = await this.assignmentsRepo.findOne({
      where: {
        conciergeId,
        isActive: true,
        ...(booking.propertyId
          ? { propertyId: booking.propertyId }
          : { carId: booking.carId }),
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        "Vous n'êtes pas assigné à ce bien / véhicule",
      );
    }

    return booking;
  }
}
