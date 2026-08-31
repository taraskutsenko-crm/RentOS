import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Global default: Customer's portal-auth secrets are never returned by
    // any query anywhere in the app unless a call site explicitly opts back
    // in (`omit: { portalPasswordHash: false, portalInvitationTokenHash:
    // false }`) — see customer-portal/auth/portal-auth.service.ts, the only
    // place that legitimately needs them (verifying a login/invitation).
    // Every staff-facing Customer query (CustomersService, and every
    // `include: { customer: true }` across Rentals/Quotes/Documents) is
    // protected by construction, not by remembering to add `select`/`omit`
    // to each one individually.
    //
    // Same convention for Tenant.logoStorageKey (Havelio Company Branding,
    // docs/PRODUCT_BIBLE.md) — an internal StorageService key, never a
    // client-facing value, and `Tenant` rows are returned raw from many
    // call sites (auth/register/login, GET /tenants/:id, tenant select,
    // portal /auth/me, ...). Only CompanyLogoService and the document/
    // email rendering code paths that actually need to read the logo
    // bytes explicitly opt back in with `omit: { tenant: { logoStorageKey:
    // false } } }`.
    super({
      omit: {
        customer: {
          portalPasswordHash: true,
          portalInvitationTokenHash: true,
        },
        tenant: {
          logoStorageKey: true,
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
