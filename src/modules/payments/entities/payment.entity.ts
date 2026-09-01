import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { PaymentMethod, PaymentStatus } from "../../../common/enums";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "booking_id", nullable: true })
  @Index()
  bookingId: string;

  @Column({ name: "payer_id", nullable: true })
  payerId: string;

  @ManyToOne("User", { nullable: true, eager: false })
  @JoinColumn({ name: "payer_id" })
  payer: any;

  @ManyToOne("Booking", { nullable: true, eager: false })
  @JoinColumn({ name: "booking_id" })
  booking: any;

  @Column({ type: "enum", enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.CREATED })
  @Index()
  status: PaymentStatus;

  @Column({ name: "amount_expected", type: "decimal", precision: 12, scale: 2 })
  amountExpected: number;

  @Column({ name: "phone_number", nullable: true })
  phoneNumber: string;

  @Column({
    name: "amount_received",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountReceived: number;

  @Column({ default: "XAF" })
  currency: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ name: "stripe_payment_id", nullable: true })
  stripePaymentId: string;

  @Column({ name: "stripe_client_secret", nullable: true, select: false })
  stripeClientSecret: string;

  @Column({ name: "paypal_order_id", nullable: true })
  paypalOrderId: string;

  @Column({ name: "confirmed_by", nullable: true })
  confirmedBy: string;

  @Column({ name: "confirmed_at", nullable: true })
  confirmedAt: Date;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @Column({ name: "receipt_url", nullable: true })
  receiptUrl: string;

  @Column({
    name: "refunded_amount",
    type: "decimal",
    precision: 12,
    scale: 2,
    nullable: true,
  })
  refundedAmount: number;

  @Column({ name: "refunded_at", nullable: true })
  refundedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
