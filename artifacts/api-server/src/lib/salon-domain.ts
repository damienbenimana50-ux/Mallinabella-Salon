import type { Prisma } from "@workspace/db";

export type BookingWithDetails = Prisma.BookingGetPayload<{
  include: { service: true; stylist: true };
}>;

export function toService(service: {
  id: number;
  name: string;
  category: string;
  description: string;
  durationMinutes: number;
  price: Prisma.Decimal;
  active: boolean;
}) {
  return {
    ...service,
    price: Number(service.price),
  };
}

export function toBooking(booking: BookingWithDetails) {
  return {
    id: booking.id,
    serviceId: booking.serviceId,
    serviceName: booking.service.name,
    stylistId: booking.stylistId,
    stylistName: booking.stylist.name,
    clientName: booking.clientName,
    email: booking.email,
    phone: booking.phone,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    status: booking.status,
    notes: booking.notes,
    marketingOptIn: booking.marketingOptIn,
    accountRequested: booking.accountRequested,
    createdAt: booking.createdAt.toISOString(),
  };
}

export function toCampaign(campaign: {
  id: string;
  subject: string;
  body: string;
  status: string;
  recipientCount: number;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...campaign,
    sentAt: campaign.sentAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
  };
}

export function toKigaliDateString(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function kigaliDayBounds(value: string | Date): { start: Date; end: Date } {
  const date = value instanceof Date ? toKigaliDateString(value) : value;
  const start = new Date(`${date}T00:00:00+02:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function getVerifiedClerkEmail(addresses: {
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }>;
  primaryEmailAddressId: string | null;
}): string | null {
  const primary = addresses.emailAddresses.find(
    (address) => address.id === addresses.primaryEmailAddressId,
  );
  if (!primary || primary.verification?.status !== "verified") {
    return null;
  }
  return primary.emailAddress.trim().toLowerCase();
}
