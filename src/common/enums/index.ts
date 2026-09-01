export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  OWNER = 'OWNER',
  CONCIERGE = 'CONCIERGE',
  ADMIN = 'ADMIN',
}

export enum LoyaltyTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  CONFIRMED = 'CONFIRMED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  REFUNDED = 'REFUNDED',
}

export enum ResourceType {
  PROPERTY = 'PROPERTY',
  CAR = 'CAR',
}

export enum PaymentMethod {
  ORANGE_MONEY = 'ORANGE_MONEY',
  MTN_MOMO = 'MTN_MOMO',
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum DepositStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  HELD = 'HELD',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RELEASED = 'RELEASED',
  DEDUCTED = 'DEDUCTED',
  DISPUTED = 'DISPUTED',
}

export enum PropertyStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PUBLISHED = 'PUBLISHED',
  UNAVAILABLE = 'UNAVAILABLE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum CarStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  AVAILABLE = 'AVAILABLE',
  RENTED = 'RENTED',
  MAINTENANCE = 'MAINTENANCE',
  SUSPENDED = 'SUSPENDED',
}

export enum CarCategory {
  ECONOMY = 'ECONOMY',
  SEDAN = 'SEDAN',
  SUV = 'SUV',
  LUXURY = 'LUXURY',
  VAN = 'VAN',
  ELECTRIC = 'ELECTRIC',
  PICKUP = 'PICKUP',
}

export enum FuelType {
  PETROL = 'PETROL',
  DIESEL = 'DIESEL',
  ELECTRIC = 'ELECTRIC',
  HYBRID = 'HYBRID',
}

export enum Transmission {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
}

export enum TaskType {
  CHECKIN = 'CHECKIN',
  CHECKOUT = 'CHECKOUT',
  CLEANING = 'CLEANING',
  INSPECTION = 'INSPECTION',
  MAINTENANCE = 'MAINTENANCE',
  OTHER = 'OTHER',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  ISSUE_REPORTED = 'ISSUE_REPORTED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum InspectionType {
  PRE_RENTAL = 'PRE_RENTAL',
  POST_RENTAL = 'POST_RENTAL',
}

export enum VehicleCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  DAMAGED = 'DAMAGED',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum DocType {
  CNI = 'CNI',
  PASSPORT = 'PASSPORT',
  RESIDENCE_PERMIT = 'RESIDENCE_PERMIT',
}

export enum BadgeType {
  VERIFIED = 'VERIFIED',
  SUPERHOST = 'SUPERHOST',
  TOP_RATED = 'TOP_RATED',
  RESPONSIVE = 'RESPONSIVE',
}

export enum CancellationPolicy {
  FLEXIBLE = 'FLEXIBLE',
  MODERATE = 'MODERATE',
  STRICT = 'STRICT',
}

export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
  MAINTENANCE = 'MAINTENANCE',
}

export enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum Language {
  FR = 'fr',
  EN = 'en',
}

export enum Currency {
  XAF = 'XAF',
  EUR = 'EUR',
  USD = 'USD',
  CAD = 'CAD',
}
