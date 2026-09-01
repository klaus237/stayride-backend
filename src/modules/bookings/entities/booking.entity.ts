import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import {
  BookingStatus,
  ResourceType,
  DepositStatus,
} from "../../../common/enums";

@Entity("bookings")
@Index(["resourceType", "propertyId", "startDate", "endDate", "status"])
@Index(["resourceType", "carId", "startDate", "endDate", "status"])
export class Booking {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "bundle_id", nullable: true })
  @Index()
  bundleId: string;

  @Column({ name: "customer_id" })
  @Index()
  customerId: string;

  @Column({
    name: "resource_type",
    type: "enum",
    enum: ResourceType,
  })
  @Index()
  resourceType: ResourceType;

  @Column({ name: "property_id", nullable: true })
  propertyId: string;

  @Column({ name: "car_id", nullable: true })
  carId: string;

  @ManyToOne("Property", { nullable: true, eager: false })
  @JoinColumn({ name: "property_id" })
  property: any;

  @ManyToOne("Car", { nullable: true, eager: false })
  @JoinColumn({ name: "car_id" })
  car: any;

  @Column({ name: "concierge_id", nullable: true })
  conciergeId: string;

  @Column({ name: "start_date", type: "date" })
  @Index()
  startDate: string;

  @Column({ name: "end_date", type: "date" })
  @Index()
  endDate: string;

  @Column({ name: "guests_count", default: 1 })
  guestsCount: number;

  @Column({
    type: "enum",
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  @Index()
  status: BookingStatus;

  @Column({ name: "base_price", type: "decimal", precision: 12, scale: 2 })
  basePrice: number;

  @Column({
    name: "cleaning_fee",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  cleaningFee: number;

  @Column({
    name: "platform_fee",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  platformFee: number;

  @Column({
    name: "discount_amount",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  discountAmount: number;

  @Column({ name: "coupon_code", nullable: true })
  couponCode: string;

  @Column({ name: "loyalty_points_used", default: 0 })
  loyaltyPointsUsed: number;

  @Column({
    name: "wallet_used",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  walletUsed: number;

  @Column({ name: "total_amount", type: "decimal", precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ name: "currency", default: "XAF" })
  currency: string;

  @Column({
    name: "deposit_amount",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  depositAmount: number;

  @Column({
    name: "deposit_status",
    type: "enum",
    enum: DepositStatus,
    default: DepositStatus.NONE,
  })
  depositStatus: DepositStatus;

  @Column({ name: "deposit_collected_at", nullable: true })
  depositCollectedAt: Date;

  @Column({ name: "deposit_collected_by", nullable: true })
  depositCollectedBy: string;

  @Column({ name: "deposit_proof_url", nullable: true })
  depositProofUrl: string;

  @Column({
    name: "deposit_deducted_amount",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  depositDeductedAmount: number;

  @Column({ name: "deposit_reason", nullable: true })
  depositReason: string;

  @Column({ name: "checkin_at", nullable: true })
  checkinAt: Date;

  @Column({ name: "checkout_at", nullable: true })
  checkoutAt: Date;

  @Column({ name: "original_end_date", type: "date", nullable: true })
  originalEndDate: string;

  @Column({ name: "extension_count", default: 0 })
  extensionCount: number;

  @Column({ name: "cancellation_reason", nullable: true })
  cancellationReason: string;

  @Column({ name: "cancelled_by", nullable: true })
  cancelledBy: string;

  @Column({ name: "special_requests", nullable: true })
  specialRequests: string;

  @Column({ name: "version", default: 1 })
  version: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
