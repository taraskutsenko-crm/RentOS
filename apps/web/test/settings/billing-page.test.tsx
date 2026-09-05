import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import BillingSettingsPage from "../../src/app/app/settings/billing/page";
import type * as UseBillingModule from "../../src/hooks/use-billing";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useBillingSubscriptionMock = vi.fn();
const usePlansMock = vi.fn();
const usePreviewPromoCodeMock = vi.fn();
vi.mock("../../src/hooks/use-billing", async () => {
  const actual = await vi.importActual<typeof UseBillingModule>("../../src/hooks/use-billing");
  return {
    ...actual,
    useBillingSubscription: (...args: unknown[]) => useBillingSubscriptionMock(...args),
    usePlans: (...args: unknown[]) => usePlansMock(...args),
    usePreviewPromoCode: (...args: unknown[]) => usePreviewPromoCodeMock(...args),
    useCreateCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateBillingPortalSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCancelSubscription: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useResumeSubscription: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useChangePlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

const PLANS = [
  {
    plan: "STARTER",
    name: "Starter",
    monthlyPriceMinor: 2900,
    annualPriceMinor: 27840,
    currency: "USD",
    limits: { maxUsers: 2, maxActiveAssets: 50, maxLocations: 1 },
    features: [],
    isMostPopular: false,
    isContactSalesOnly: false,
  },
  {
    plan: "BUSINESS",
    name: "Business",
    monthlyPriceMinor: 6900,
    annualPriceMinor: 66240,
    currency: "USD",
    limits: { maxUsers: 5, maxActiveAssets: 500, maxLocations: 1 },
    features: ["PAYMENTS_DEBT_MANAGEMENT"],
    isMostPopular: true,
    isContactSalesOnly: false,
  },
  {
    plan: "PROFESSIONAL",
    name: "Professional",
    monthlyPriceMinor: 14900,
    annualPriceMinor: 143040,
    currency: "USD",
    limits: { maxUsers: 15, maxActiveAssets: null, maxLocations: null },
    features: ["PAYMENTS_DEBT_MANAGEMENT"],
    isMostPopular: false,
    isContactSalesOnly: false,
  },
  {
    plan: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceMinor: null,
    annualPriceMinor: null,
    currency: "USD",
    limits: { maxUsers: null, maxActiveAssets: null, maxLocations: null },
    features: ["PAYMENTS_DEBT_MANAGEMENT"],
    isMostPopular: false,
    isContactSalesOnly: true,
  },
];

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    tenantId: "tenant-1",
    plan: "PROFESSIONAL",
    billingInterval: null,
    status: "TRIALING",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialStartedAt: new Date().toISOString(),
    trialEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    scheduledPlan: null,
    scheduledBillingInterval: null,
    isGrandfathered: false,
    ...overrides,
  };
}

describe("BillingSettingsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    usePlansMock.mockReturnValue({ data: { plans: PLANS, stripeConfigured: false } });
    usePreviewPromoCodeMock.mockReturnValue({ data: undefined });
  });

  it("shows the trial days-remaining indicator during TRIALING", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription(),
        access: "GRANTED",
        plan: PLANS[2],
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(screen.getByText("12 days left in your Havelio trial")).toBeInTheDocument();
  });

  it("shows the expired-trial message once status is EXPIRED", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription({ status: "EXPIRED", trialEndsAt: null }),
        access: "RESTRICTED",
        plan: null,
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(screen.getByText("Your Havelio trial has ended.")).toBeInTheDocument();
  });

  it("never claims 'unlimited' usage while RESTRICTED — shows the real count instead", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription({ status: "EXPIRED", trialEndsAt: null }),
        access: "RESTRICTED",
        plan: null,
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    // "Unlimited assets"/"Unlimited users" legitimately appear as plan-
    // feature descriptions on the Professional/Enterprise cards below — the
    // regression this guards against is specifically the usage row showing
    // "(unlimited)" while RESTRICTED, so assert the exact real-count text
    // instead of a blanket "no unlimited text anywhere" check.
    expect(screen.getByText("3 (no active plan)")).toBeInTheDocument();
    expect(screen.getByText("1 (no active plan)")).toBeInTheDocument();
  });

  it("shows a truthful 'Stripe billing is not configured' notice when Stripe is unconfigured", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription(),
        access: "GRANTED",
        plan: PLANS[2],
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(
      screen.getAllByText("Stripe billing is not configured in this environment.").length,
    ).toBeGreaterThan(0);
  });

  it("marks Business as Most Popular in the plan chooser", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription(),
        access: "GRANTED",
        plan: PLANS[2],
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(screen.getByText("Most popular")).toBeInTheDocument();
  });

  it("shows the asset usage count against the plan's limit", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription({ status: "ACTIVE", plan: "STARTER", billingInterval: "MONTHLY" }),
        access: "GRANTED",
        plan: PLANS[0],
        usage: { assets: 48, users: 2 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(screen.getByText("48/50")).toBeInTheDocument();
  });

  it("shows a truthful 'cancels on' banner when cancelAtPeriodEnd is set", () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription({
          status: "ACTIVE",
          plan: "BUSINESS",
          billingInterval: "MONTHLY",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-09-30T00:00:00.000Z",
        }),
        access: "GRANTED",
        plan: PLANS[1],
        usage: { assets: 10, users: 2 },
        stripeConfigured: false,
      },
      isLoading: false,
    });

    renderWithProviders(<BillingSettingsPage />);

    expect(screen.getByText(/Cancels on/)).toBeInTheDocument();
    expect(screen.getByText("Resume subscription")).toBeInTheDocument();
  });

  it("shows clear invalid feedback for an unknown promo code, never a silent blank", async () => {
    useBillingSubscriptionMock.mockReturnValue({
      data: {
        subscription: baseSubscription(),
        access: "GRANTED",
        plan: PLANS[2],
        usage: { assets: 3, users: 1 },
        stripeConfigured: false,
      },
      isLoading: false,
    });
    usePreviewPromoCodeMock.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("This promotion code doesn't exist."),
    });

    const user = userEvent.setup();
    renderWithProviders(<BillingSettingsPage />);
    await user.type(screen.getByLabelText("Promotion code"), "NOPE123");

    // A plain Error (not an ApiError from the backend) falls back to the
    // generic translated "invalid" message rather than leaking a raw
    // message — see apiErrorMessage's own doc comment.
    expect(await screen.findByText("This code isn't valid.")).toBeInTheDocument();
  });
});
