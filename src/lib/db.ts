import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Singleton em dev e prod — evita múltiplos clients (RAM) no processo Node do Railway. */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"]
  });

globalForPrisma.prisma = prisma;
