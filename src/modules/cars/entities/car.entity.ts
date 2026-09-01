import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("cars")
export class Car {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "owner_id" })
  @Index()
  ownerId: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  brand: string;

  @Column()
  model: string;

  @Column()
  year: number;

  @Column({ default: "SEDAN" })
  category: string;

  @Column({ default: "MANUAL" })
  transmission: string;

  @Column({ name: "fuel_type", default: "PETROL" })
  fuelType: string;

  @Column({ default: 5 })
  seats: number;

  @Column({ default: 4 })
  doors: number;

  @Column({ nullable: true })
  color: string;

  @Column({ name: "mileage_km", default: 0 })
  mileageKm: number;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ name: "price_per_day", type: "decimal", precision: 12, scale: 2 })
  pricePerDay: number;

  @Column({ default: "XAF" })
  currency: string;

  @Column({ name: "deposit_required", default: true })
  depositRequired: boolean;

  @Column({
    name: "deposit_amount",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  depositAmount: number;

  @Column({ name: "license_required", default: true })
  licenseRequired: boolean;

  @Column({ name: "min_driver_age", default: 21 })
  minDriverAge: number;

  @Column({ name: "tracking_enabled", default: false })
  trackingEnabled: boolean;

  @Column()
  city: string;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lng: number;

  @Column({ default: "AVAILABLE" })
  @Index()
  status: string;

  @Column({
    name: "avg_rating",
    type: "decimal",
    precision: 3,
    scale: 2,
    default: 0,
  })
  avgRating: number;

  @Column({ name: "review_count", default: 0 })
  reviewCount: number;

  @Column({ name: "is_featured", default: false })
  isFeatured: boolean;

  @Column({ name: "cover_image_url", nullable: true })
  coverImageUrl: string;

  @Column({ type: "jsonb", default: [] })
  images: string[];

  @Column({ type: "jsonb", nullable: true })
  features: string[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
