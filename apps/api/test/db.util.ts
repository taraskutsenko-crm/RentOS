import type { PrismaClient } from "@prisma/client";

/** Deletes all rows in dependency order. Test database only. */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.tenantMembership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
}
