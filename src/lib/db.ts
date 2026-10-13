import { PrismaClient } from "@prisma/client";

// En desarrollo Next recarga los módulos en cada cambio; se reutiliza la
// misma instancia para no abrir conexiones nuevas cada vez.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
