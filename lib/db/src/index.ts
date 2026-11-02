import { PrismaClient } from "@prisma/client";
export type { BookingStatus, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  salonPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.salonPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.salonPrisma = prisma;
}
