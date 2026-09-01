import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";
import dayjs = require("dayjs");

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationOptions {
  page?: number;
  perPage?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export function paginate<T>(
  items: T[],
  total: number,
  options: PaginationOptions,
): PaginatedResult<T> {
  const page = Math.max(1, options.page || 1);
  const perPage = Math.min(100, Math.max(1, options.perPage || 20));
  return {
    data: items,
    meta: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
}

export function getPaginationOptions(query: any): {
  skip: number;
  take: number;
  page: number;
  perPage: number;
} {
  const page = Math.max(1, parseInt(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.perPage) || 20));
  return {
    skip: (page - 1) * perPage,
    take: perPage,
    page,
    perPage,
  };
}

// ─── Slug ─────────────────────────────────────────────────────────────────────

export function generateSlug(text: string, suffix?: string): string {
  const base = slugify(text, {
    lower: true,
    strict: true,
    locale: "fr",
  });
  const id = suffix || uuidv4().slice(0, 8);
  return `${base}-${id}`;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function countNights(startDate: string, endDate: string): number {
  return dayjs(endDate).diff(dayjs(startDate), "day");
}

export function countDays(startDate: string, endDate: string): number {
  return dayjs(endDate).diff(dayjs(startDate), "day");
}

export function datesOverlap(
  start1: string | Date,
  end1: string | Date,
  start2: string | Date,
  end2: string | Date,
): boolean {
  const s1 = dayjs(start1);
  const e1 = dayjs(end1);
  const s2 = dayjs(start2);
  const e2 = dayjs(end2);
  return s1.isBefore(e2) && e1.isAfter(s2);
}

export function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  while (current.isBefore(end)) {
    dates.push(current.format("YYYY-MM-DD"));
    current = current.add(1, "day");
  }
  return dates;
}

// ─── Prix ─────────────────────────────────────────────────────────────────────

export interface PriceCalculation {
  basePrice: number;
  nights: number;
  cleaningFee: number;
  platformFee: number;
  discountAmount: number;
  depositAmount: number;
  total: number;
  ownerPayout: number;
}

export function calculateBookingPrice(params: {
  pricePerNight: number;
  nights: number;
  cleaningFee?: number;
  commissionRate?: number;
  discountPct?: number;
  depositAmount?: number;
}): PriceCalculation {
  const {
    pricePerNight,
    nights,
    cleaningFee = 0,
    commissionRate = 10,
    discountPct = 0,
    depositAmount = 0,
  } = params;

  const basePrice = Math.round(pricePerNight * nights);
  const discountAmount = Math.round(basePrice * (discountPct / 100));
  const subtotal = basePrice - discountAmount + cleaningFee;
  const platformFee = Math.round(subtotal * (commissionRate / 100));
  const total = subtotal + platformFee;
  const ownerPayout = total - platformFee;

  return {
    basePrice,
    nights,
    cleaningFee,
    platformFee,
    discountAmount,
    depositAmount,
    total,
    ownerPayout,
  };
}

export function calculateCarRentalPrice(params: {
  pricePerDay: number;
  days: number;
  commissionRate?: number;
  discountPct?: number;
  depositAmount?: number;
}): PriceCalculation {
  const {
    pricePerDay,
    days,
    commissionRate = 10,
    discountPct = 0,
    depositAmount = 0,
  } = params;

  const basePrice = Math.round(pricePerDay * days);
  const discountAmount = Math.round(basePrice * (discountPct / 100));
  const subtotal = basePrice - discountAmount;
  const platformFee = Math.round(subtotal * (commissionRate / 100));
  const total = subtotal + platformFee;
  const ownerPayout = total - platformFee;

  return {
    basePrice,
    nights: days,
    cleaningFee: 0,
    platformFee,
    discountAmount,
    depositAmount,
    total,
    ownerPayout,
  };
}

// ─── Parrainage ───────────────────────────────────────────────────────────────

export function generateReferralCode(name: string): string {
  const prefix = name
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z]/g, "X");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}${random}`;
}

// ─── Points de fidélité ───────────────────────────────────────────────────────

export function calculateLoyaltyPoints(amount: number): number {
  // 1 point par 1000 XAF
  return Math.floor(amount / 1000);
}

// ─── Masquage données sensibles ───────────────────────────────────────────────

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  return phone.slice(0, 4) + "****" + phone.slice(-2);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "***@" + domain;
}
