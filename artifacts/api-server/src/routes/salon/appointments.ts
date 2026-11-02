import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  CreateBookingBody,
  CreateBookingResponse,
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
  GetMyBookingsResponse,
  ListBookingsQueryParams,
  ListBookingsResponse,
  UpdateBookingBody,
  UpdateBookingParams,
  UpdateBookingResponse,
} from "@workspace/api-zod";
import { prisma, type BookingStatus } from "@workspace/db";
import { requireSalonAdmin } from "../../middlewares/requireSalonAdmin";
import {
  getVerifiedClerkEmail,
  kigaliDayBounds,
  toBooking,
  toKigaliDateString,
} from "../../lib/salon-domain";
import { bookingConfirmationEmail, dispatchMockEmail } from "../../lib/salon-email";

const router: IRouter = Router();
const OPEN_HOUR = 9;
const CLOSE_HOUR = 19;
const SLOT_MINUTES = 30;
const TIME_ZONE = "Africa/Kigali";

function localClock(value: Date): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return {
    weekday,
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

function isSalonOpenAt(startAt: Date, durationMinutes: number): boolean {
  const local = localClock(startAt);
  const minuteOfDay = local.hour * 60 + local.minute;
  const endMinute = minuteOfDay + durationMinutes;
  return (
    local.weekday >= 2 &&
    local.weekday <= 6 &&
    minuteOfDay >= OPEN_HOUR * 60 &&
    local.minute % SLOT_MINUTES === 0 &&
    endMinute <= CLOSE_HOUR * 60
  );
}

async function withBookingDetails(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: { service: true, stylist: true },
  });
}

router.get("/availability", async (req, res): Promise<void> => {
  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const service = await prisma.service.findFirst({
    where: { id: parsed.data.serviceId, active: true },
  });
  if (!service) {
    res.json(GetAvailabilityResponse.parse([]));
    return;
  }

  const date = toKigaliDateString(parsed.data.date);
  const { start: dayStart, end: dayEnd } = kigaliDayBounds(date);
  const stylists = await prisma.stylist.findMany({
    where: {
      active: true,
      ...(parsed.data.stylistId ? { id: parsed.data.stylistId } : {}),
    },
    orderBy: { name: "asc" },
  });
  const bookings = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
    },
    select: { stylistId: true, startAt: true, endAt: true },
  });
  const weekday = new Date(`${date}T12:00:00+02:00`).getUTCDay();
  const slots: Array<{
    startAt: string;
    endAt: string;
    stylistId: string;
    stylistName: string;
  }> = [];

  if (weekday >= 2 && weekday <= 6) {
    for (const stylist of stylists) {
      for (
        let minuteOfDay = OPEN_HOUR * 60;
        minuteOfDay + service.durationMinutes <= CLOSE_HOUR * 60;
        minuteOfDay += SLOT_MINUTES
      ) {
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        const startAt = new Date(
          `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+02:00`,
        );
        const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
        if (startAt <= new Date()) continue;
        const occupied = bookings.some(
          (booking) =>
            booking.stylistId === stylist.id &&
            booking.startAt < endAt &&
            booking.endAt > startAt,
        );
        if (!occupied) {
          slots.push({
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            stylistId: stylist.id,
            stylistName: stylist.name,
          });
        }
      }
    }
  }
  res.json(GetAvailabilityResponse.parse(slots));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, active: true },
  });
  if (!service) {
    res.status(404).json({ error: "Service not found or no longer bookable" });
    return;
  }
  const stylist = await prisma.stylist.findFirst({
    where: { id: data.stylistId, active: true },
  });
  if (!stylist) {
    res.status(404).json({ error: "Stylist not found or unavailable" });
    return;
  }

  const startAt = new Date(data.startAt);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  if (
    Number.isNaN(startAt.getTime()) ||
    startAt <= new Date() ||
    !isSalonOpenAt(startAt, service.durationMinutes)
  ) {
    res.status(400).json({ error: "Choose an available future salon opening." });
    return;
  }

  let clerkUserId: string | null = null;
  const authUserId = getAuth(req).userId;
  if (authUserId) {
    const clerkUser = await clerkClient.users.getUser(authUserId);
    if (getVerifiedClerkEmail(clerkUser) === data.email.trim().toLowerCase()) {
      clerkUserId = authUserId;
    }
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Serialize checks for this stylist; interval overlap checks alone can race.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mallinabella:${stylist.id}`}))`;
    const collision = await tx.booking.findFirst({
      where: {
        stylistId: stylist.id,
        status: "confirmed",
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (collision) return null;

    const email = data.email.trim().toLowerCase();
    const existingClient = await tx.user.findUnique({ where: { email } });
    const client = existingClient
      ? await tx.user.update({
          where: { id: existingClient.id },
          data: {
            name: data.clientName.trim(),
            phone: data.phone.trim(),
            marketingOptIn: data.marketingOptIn ?? false,
            accountRequested:
              existingClient.accountRequested || (data.accountRequested ?? false),
            ...(clerkUserId && !existingClient.clerkUserId ? { clerkUserId } : {}),
          },
        })
      : await tx.user.create({
          data: {
            name: data.clientName.trim(),
            email,
            phone: data.phone.trim(),
            marketingOptIn: data.marketingOptIn ?? false,
            accountRequested: data.accountRequested ?? false,
            ...(clerkUserId ? { clerkUserId } : {}),
          },
        });

    return tx.booking.create({
      data: {
        userId: client.id,
        serviceId: service.id,
        stylistId: stylist.id,
        clientName: data.clientName.trim(),
        email,
        phone: data.phone.trim(),
        startAt,
        endAt,
        notes: data.notes?.trim() || null,
        marketingOptIn: data.marketingOptIn ?? false,
        accountRequested: data.accountRequested ?? false,
      },
      select: { id: true },
    });
  });

  if (!booking) {
    res.status(409).json({ error: "That appointment time was just booked. Choose another opening." });
    return;
  }
  const fullBooking = await withBookingDetails(booking.id);
  if (!fullBooking) {
    res.status(500).json({ error: "Booking was created but could not be loaded." });
    return;
  }
  dispatchMockEmail(
    req.log,
    bookingConfirmationEmail({
      to: fullBooking.email,
      clientName: fullBooking.clientName,
      serviceName: fullBooking.service.name,
      stylistName: fullBooking.stylist.name,
      startAt: fullBooking.startAt,
    }),
  );
  req.log.info({ bookingId: booking.id }, "Salon appointment confirmed");
  res.status(201).json(CreateBookingResponse.parse(toBooking(fullBooking)));
});

router.get("/bookings", requireSalonAdmin, async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const where: {
    startAt?: { gte?: Date; lt?: Date };
    status?: BookingStatus;
  } = {};
  if (parsed.data.from) {
    where.startAt = {
      ...where.startAt,
      gte: kigaliDayBounds(parsed.data.from).start,
    };
  }
  if (parsed.data.to) {
    where.startAt = {
      ...where.startAt,
      lt: kigaliDayBounds(parsed.data.to).end,
    };
  }
  if (parsed.data.status) where.status = parsed.data.status as BookingStatus;

  const bookings = await prisma.booking.findMany({
    where,
    include: { service: true, stylist: true },
    orderBy: { startAt: "asc" },
  });
  res.json(ListBookingsResponse.parse(bookings.map(toBooking)));
});

router.patch("/bookings/:bookingId", requireSalonAdmin, async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  const body = UpdateBookingBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existing = await prisma.booking.findUnique({
    where: { id: params.data.bookingId },
    select: { id: true, status: true, userId: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.update({
      where: { id: existing.id },
      data: body.data,
      select: { id: true },
    });
    if (body.data.status === "completed" && existing.status !== "completed" && existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { totalVisits: { increment: 1 } },
      });
    }
    return tx.booking.findUnique({
      where: { id: booking.id },
      include: { service: true, stylist: true },
    });
  });
  if (!updated) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  req.log.info({ bookingId: updated.id }, "Salon appointment updated");
  res.json(UpdateBookingResponse.parse(toBooking(updated)));
});

router.get("/account/bookings", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view your appointments." });
    return;
  }
  const clerkUser = await clerkClient.users.getUser(userId);
  const email = getVerifiedClerkEmail(clerkUser);
  if (!email) {
    res.status(403).json({ error: "A verified email address is required." });
    return;
  }
  const client = await prisma.user.findUnique({ where: { email } });
  if (!client) {
    res.json(GetMyBookingsResponse.parse([]));
    return;
  }
  if (!client.clerkUserId) {
    await prisma.user.update({
      where: { id: client.id },
      data: { clerkUserId: userId, accountRequested: true },
    });
  }
  const bookings = await prisma.booking.findMany({
    where: { email, userId: client.id },
    include: { service: true, stylist: true },
    orderBy: { startAt: "desc" },
  });
  res.json(GetMyBookingsResponse.parse(bookings.map(toBooking)));
});

export default router;
