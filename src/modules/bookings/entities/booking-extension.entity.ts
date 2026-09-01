import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ExtensionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

@Entity('booking_extensions')
export class BookingExtension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id' })
  bookingId: string;

  @Column({ name: 'requested_by' })
  requestedBy: string;

  @Column({ name: 'previous_end_date', type: 'date' })
  previousEndDate: string;

  @Column({ name: 'new_end_date', type: 'date' })
  newEndDate: string;

  @Column({ name: 'extra_nights_days' })
  extraNightsDays: number;

  @Column({ name: 'extra_amount', type: 'decimal', precision: 12, scale: 2 })
  extraAmount: number;

  @Column({ default: 'PENDING' })
  status: ExtensionStatus;

  @Column({ name: 'payment_id', nullable: true })
  paymentId: string;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'confirmed_at', nullable: true })
  confirmedAt: Date;
}
