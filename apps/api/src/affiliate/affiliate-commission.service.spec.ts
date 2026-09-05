import { describe, expect, it, vi } from "vitest";

import { AffiliateCommissionService } from "./affiliate-commission.service";

function buildService(overrides: {
  attribution?: Record<string, unknown> | null;
  campaign?: Record<string, unknown> | null;
  earliestEntry?: Record<string, unknown> | null;
  findTenantIdForSubscription?: string | null;
} = {}) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    affiliateAttribution: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.attribution === undefined
          ? { partnerId: "partner-1", campaignId: "campaign-1" }
          : overrides.attribution,
      ),
    },
    affiliateCampaign: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.campaign === undefined
          ? { id: "campaign-1", partnerId: "partner-1", commissionRateBp: 2500, commissionDurationMonths: 12 }
          : overrides.campaign,
      ),
    },
    affiliateCommissionEntry: {
      findFirst: vi.fn().mockResolvedValue(overrides.earliestEntry ?? null),
      create: vi.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve(data);
      }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
  const subscriptionsService = {
    findTenantIdForSubscription: vi
      .fn()
      .mockResolvedValue(overrides.findTenantIdForSubscription === undefined ? "tenant-1" : overrides.findTenantIdForSubscription),
  };
  const auditService = { log: vi.fn() };
  const stripeProvider = { findInvoiceIdForCharge: vi.fn().mockResolvedValue(null) };
  const service = new AffiliateCommissionService(
    prisma as never,
    subscriptionsService as never,
    auditService as never,
    stripeProvider as never,
  );
  return { service, prisma, created, auditService };
}

function fakeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_1",
    currency: "usd",
    amount_paid: 5520,
    total_excluding_tax: 5520,
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    ...overrides,
  } as never;
}

describe("AffiliateCommissionService", () => {
  it("computes commission from REAL collected revenue, never the nominal plan price — 25% x $55.20 = $13.80", async () => {
    const { service, created, auditService } = buildService();
    await service.handleInvoicePaid(fakeInvoice());

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      eventType: "COMMISSION_EARNED",
      eligibleRevenueMinor: 5520,
      commissionRateBp: 2500,
      amountMinor: 1380,
      currency: "USD",
    });

    // Observational AuditLog metadata alongside the canonical ledger entry
    // — never a second financial effect.
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        action: "billing.affiliate_commission.earned",
        metadata: expect.objectContaining({ amountMinor: 1380 }),
      }),
    );
  });

  it("falls back to the invoice's own embedded tenantId when the local subscription row isn't upserted yet (real Stripe delivery-order race on a brand-new subscription's first invoice)", async () => {
    const { service, created } = buildService({ findTenantIdForSubscription: null });
    await service.handleInvoicePaid(
      fakeInvoice({
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_1", metadata: { tenantId: "tenant-1" } },
        },
      }),
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ tenantId: "tenant-1", eventType: "COMMISSION_EARNED" });
  });

  it("earns no commission when neither the local row nor the invoice's own metadata resolves a tenantId", async () => {
    const { service, created } = buildService({ findTenantIdForSubscription: null });
    await service.handleInvoicePaid(fakeInvoice());
    expect(created).toHaveLength(0);
  });

  it("earns no commission when there is no affiliate attribution for the tenant", async () => {
    const { service, created } = buildService({ attribution: null });
    await service.handleInvoicePaid(fakeInvoice());
    expect(created).toHaveLength(0);
  });

  it("earns no commission from a $0-collected invoice", async () => {
    const { service, created } = buildService();
    await service.handleInvoicePaid(fakeInvoice({ amount_paid: 0, total_excluding_tax: 0 }));
    expect(created).toHaveLength(0);
  });

  it("is idempotent: a duplicate invoice.paid for the same invoice never creates a second commission entry or a second audit event", async () => {
    const { service, prisma, created, auditService } = buildService();
    // Simulate the DB's own unique constraint (stripeInvoiceId, eventType)
    // rejecting the second insert.
    prisma.affiliateCommissionEntry.create
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve(data);
      })
      .mockImplementationOnce(() => {
        const error = new Error("Unique constraint failed") as Error & { code: string };
        error.code = "P2002";
        return Promise.reject(error);
      });

    await service.handleInvoicePaid(fakeInvoice());
    await service.handleInvoicePaid(fakeInvoice());

    expect(created).toHaveLength(1);
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it("skips commission once the eligibility window (commissionDurationMonths) has passed", async () => {
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const { service, created } = buildService({
      earliestEntry: { earnedAt: thirteenMonthsAgo },
    });
    await service.handleInvoicePaid(fakeInvoice());
    expect(created).toHaveLength(0);
  });

  it("reverses a commission on refund with an auditable negative entry, never editing the original", async () => {
    const original = {
      id: "entry-1",
      partnerId: "partner-1",
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      stripeInvoiceId: "in_1",
      currency: "USD",
      commissionRateBp: 2500,
      amountMinor: 1380,
    };
    const prisma = {
      affiliateCommissionEntry: {
        findFirst: vi.fn().mockResolvedValue(original),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const auditService = { log: vi.fn() };
    const stripeProvider = { findInvoiceIdForCharge: vi.fn().mockResolvedValue("in_1") };
    const service = new AffiliateCommissionService(
      prisma as never,
      {} as never,
      auditService as never,
      stripeProvider as never,
    );

    const charge = { id: "ch_1" } as never;
    await service.handleChargeRefunded(charge);

    expect(prisma.affiliateCommissionEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "COMMISSION_REVERSED",
          amountMinor: -1380,
          reversesEntryId: "entry-1",
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.affiliate_commission.reversed",
        metadata: expect.objectContaining({ amountMinor: -1380, reversesEntryId: "entry-1" }),
      }),
    );
  });

  it("resolves the refunded invoice via IStripeProvider, never a direct Charge.invoice field — the pinned Stripe API version (2026-08-26.dahlia) removed that field entirely, which previously made every refund reversal silently no-op (found via real Stripe Sandbox testing)", async () => {
    const prisma = {
      affiliateCommissionEntry: { findFirst: vi.fn(), create: vi.fn() },
    };
    const stripeProvider = { findInvoiceIdForCharge: vi.fn().mockResolvedValue(null) };
    const service = new AffiliateCommissionService(
      prisma as never,
      {} as never,
      { log: vi.fn() } as never,
      stripeProvider as never,
    );

    await service.handleChargeRefunded({ id: "ch_1" } as never);

    expect(stripeProvider.findInvoiceIdForCharge).toHaveBeenCalledWith({ id: "ch_1" });
    // No invoice resolved -> no lookup attempted, never a crash on a
    // Charge object that (correctly, in this API version) has no .invoice.
    expect(prisma.affiliateCommissionEntry.findFirst).not.toHaveBeenCalled();
  });
});
