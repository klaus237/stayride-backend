import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { TaskType, TaskStatus, TaskPriority } from '../../../common/enums';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', nullable: true })
  bookingId: string;

  @Column({ name: 'assigned_to' })
  @Index()
  assignedTo: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ type: 'enum', enum: TaskType, default: TaskType.OTHER })
  type: TaskType;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  @Index()
  status: TaskStatus;

  @Column({ name: 'due_at', nullable: true })
  dueAt: Date;

  @Column({ name: 'started_at', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt: Date;

  @Column({ type: 'simple-array', nullable: true })
  photos: string[];

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ name: 'issue_reported', default: false })
  issueReported: boolean;

  @Column({ name: 'issue_description', nullable: true, type: 'text' })
  issueDescription: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
