import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("properties")
export class Property {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "owner_id" })
  @Index()
  ownerId: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  titleEn: string;

  @Column({ type: "text" })
  description: string;

  @Column({ default: "APARTMENT" })
  type: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  neighborhood: string;

  @Column({ default: "CM" })
  country: string;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lng: number;

  @Column({ default: 1 })
  bedrooms: number;

  @Column({ default: 1 })
  beds: number;

  @Column({ default: 1 })
  bathrooms: number;

  @Column({ name: "max_guests", default: 2 })
  maxGuests: number;

  @Column({ name: "price_per_night", type: "decimal", precision: 12, scale: 2 })
  pricePerNight: number;

  @Column({
    name: "cleaning_fee",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  cleaningFee: number;

  @Column({
    name: "security_deposit",
    type: "decimal",
    precision: 12,
    scale: 2,
    default: 0,
  })
  securityDeposit: number;

  @Column({ default: "XAF" })
  currency: string;

  @Column({ name: "checkin_time", default: "14:00" })
  checkinTime: string;

  @Column({ name: "checkout_time", default: "11:00" })
  checkoutTime: string;

  @Column({ name: "min_stay_nights", default: 1 })
  minStayNights: number;

  @Column({ name: "instant_booking", default: false })
  instantBooking: boolean;

  @Column({ default: "DRAFT" })
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
  images: { url: string; category: string; order: number }[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
