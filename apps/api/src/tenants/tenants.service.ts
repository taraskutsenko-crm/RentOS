import { Injectable } from "@nestjs/common";
import type { Prisma, Tenant } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { slugify, withRandomSuffix } from "../common/slug.util";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";

export interface CreateTenantInput {
  name: string;
  countryCode: string;
  defaultLanguage: string;
  defaultCurrency: string;
  timezone: string;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Must be called within a transaction, using the same `tx` for the uniqueness check and insert. */
  async create(tx: Prisma.TransactionClient, input: CreateTenantInput): Promise<Tenant> {
    const slug = await this.generateUniqueSlug(tx, input.name);
    return tx.tenant.create({
      data: { ...input, slug },
    });
  }

  findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  /** Returns tenants where the given user has an ACTIVE membership. */
  listForUser(userId: string): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        memberships: { some: { userId, status: "ACTIVE" } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Powers the Company Profile settings page. Empty strings on the optional
   * identity fields are stored as null.
   *
   * `email` is handled one notch more carefully than the others: it's the
   * one field on this DTO a client is allowed to omit entirely (see
   * UpdateTenantDto's doc comment) — an older/other client that doesn't yet
   * know about the company-email field must be able to keep saving the rest
   * of the profile without silently wiping out an already-configured
   * Reply-To address. So an *omitted* `email` (`undefined`) leaves the
   * existing value untouched, while an *explicitly empty* value (`""` or
   * `null` — both are ways a real client says "clear this") sets it to
   * null, same as the other optional identity fields.
   */
  async update(tenantId: string, actorUserId: string, dto: UpdateTenantDto): Promise<Tenant> {
    const previous = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.name,
        registrationNumber: dto.registrationNumber || null,
        taxNumber: dto.taxNumber || null,
        address: dto.address || null,
        phone: dto.phone || null,
        email: dto.email === undefined ? previous.email : dto.email || null,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "tenant.company_profile.updated",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        from: {
          name: previous.name,
          registrationNumber: previous.registrationNumber,
          taxNumber: previous.taxNumber,
          address: previous.address,
          phone: previous.phone,
          email: previous.email,
        },
        to: {
          name: tenant.name,
          registrationNumber: tenant.registrationNumber,
          taxNumber: tenant.taxNumber,
          address: tenant.address,
          phone: tenant.phone,
          email: tenant.email,
        },
      },
    });

    return tenant;
  }

  private async generateUniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = slugify(name) || "tenant";
    let candidate = base;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await tx.tenant.findUnique({ where: { slug: candidate } });
      if (!existing) {
        return candidate;
      }
      candidate = withRandomSuffix(base);
    }

    // Extremely unlikely fallback: force uniqueness with a longer random suffix.
    return withRandomSuffix(withRandomSuffix(base));
  }
}
