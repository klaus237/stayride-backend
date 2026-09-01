import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserRole, LoyaltyTier, Language } from '../../../common/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ name: 'password_hash', nullable: true, select: false })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  @Index()
  role: UserRole;

  @Column({
    type: 'enum',
    enum: Language,
    default: Language.FR,
  })
  language: Language;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'email_verified_at', nullable: true })
  emailVerifiedAt: Date;

  @Column({ name: 'email_verification_token', nullable: true, select: false })
  emailVerificationToken: string;

  @Column({ name: 'email_verification_expires', nullable: true, select: false })
  emailVerificationExpires: Date;

  @Column({ name: 'password_reset_token', nullable: true, select: false })
  passwordResetToken: string;

  @Column({ name: 'password_reset_expires', nullable: true, select: false })
  passwordResetExpires: Date;

  @Index({ unique: true })
  @Column({ name: 'referral_code', nullable: true, unique: true })
  referralCode: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'referred_by' })
  referredBy: User;

  @Column({ name: 'loyalty_points', default: 0 })
  loyaltyPoints: number;

  @Column({
    name: 'loyalty_tier',
    type: 'enum',
    enum: LoyaltyTier,
    default: LoyaltyTier.BRONZE,
  })
  loyaltyTier: LoyaltyTier;

  @Column({
    name: 'wallet_balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  walletBalance: number;

  // Champs calculés / relations virtuelles
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
