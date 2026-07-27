import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../src/auth/auth.service";
import { MembershipsService } from "../src/memberships/memberships.service";
import { cleanDatabase } from "./db.util";
import { validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

describe("Registration transaction rollback", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await cleanDatabase(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("rolls back the User and Tenant if membership creation fails mid-transaction", async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(MembershipsService).useValue({
        create: () => {
          throw new Error("Simulated failure during registration");
        },
        findActiveMembership: () => null,
      }),
    );

    const authService = app.get(AuthService);

    await expect(
      authService.register(validRegisterPayload, { ipAddress: null, userAgent: null }),
    ).rejects.toThrow("Simulated failure during registration");

    const users = await prisma.user.findMany({ where: { email: validRegisterPayload.email } });
    const tenants = await prisma.tenant.findMany({
      where: { name: validRegisterPayload.companyName },
    });
    const memberships = await prisma.tenantMembership.findMany();

    expect(users).toHaveLength(0);
    expect(tenants).toHaveLength(0);
    expect(memberships).toHaveLength(0);
  });
});
