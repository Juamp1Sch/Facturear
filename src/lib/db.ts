import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

if (process.env.NODE_ENV === "development" && process.env.DATABASE_URL) {
  const sanitized = process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@");
  console.info("[prisma] DATABASE_URL =", sanitized);
}
