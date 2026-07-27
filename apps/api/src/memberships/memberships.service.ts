import { Injectable } from "@nestjs/common";
import type { MembershipRole, Prisma, TenantMembership } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Must be called within a transaction alongside the User/Tenant creation. */
  create(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; userId: string; role: MembershipRole },
  ): Promise<TenantMembership> {
    return tx.tenantMembership.create({
      data: { ...input, status: "ACTIVE" },
    });
  }

  /** The only place that decides "does this user have access to this tenant". */
  findActiveMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId, status: "ACTIVE" },
    });
  }
}
