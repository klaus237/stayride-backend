import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { NotificationChannel } from '../../common/enums';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.PUSH,
  })
  channel: NotificationChannel;

  @Column({ name: 'read_at', nullable: true })
  readAt: Date;

  @Column({ name: 'sent_at', nullable: true })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;
}
