import { Injectable } from "@nestjs/common";
import type { Prisma, Tenant } from "@prisma/client";

import { slugify, withRandomSuffix } from "../common/slug.util";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateTenantInput {
  name: string;
  countryCode: string;
  defaultLanguage: string;
  defaultCurrency: string;
  timezone: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

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
