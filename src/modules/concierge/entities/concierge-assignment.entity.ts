import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('concierge_assignments')
export class ConciergeAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'concierge_id' })
  conciergeId: string;

  @Column({ name: 'resource_type', nullable: true })
  resourceType: string;

  @Column({ name: 'property_id', nullable: true })
  propertyId: string;

  @Column({ name: 'car_id', nullable: true })
  carId: string;

  @Column({ name: 'assigned_by' })
  assignedBy: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
