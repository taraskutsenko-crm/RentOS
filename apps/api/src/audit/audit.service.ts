import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export interface AuditLogInput {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepts an optional transaction client so an audit entry can be written
   * atomically alongside the operation it records (e.g. registration).
   */
  log(
    input: AuditLogInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<unknown> {
    return client.auditLog.create({ data: input });
  }
}
