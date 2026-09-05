import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import PlatformAdminPartnerDetailPage from "../../src/app/platform-admin/affiliates/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "partner-1" }),
}));

const usePlatformAdminPartnerMock = vi.fn();
const useUpdatePartnerStatusMock = vi.fn();
const useCreateCampaignMock = vi.fn();
const usePlatformAdminPromoCodesMock = vi.fn();
const useCreatePromoCodeMock = vi.fn();
const useRetryPromoCodeProvisioningMock = vi.fn();
const useAttributionMock = vi.fn();
const usePartnerPayableMock = vi.fn();
const usePartnerPayoutsMock = vi.fn();
const useRecordPayoutMock = vi.fn();

vi.mock("../../src/hooks/use-platform-admin", () => ({
  usePlatformAdminPartner: () => usePlatformAdminPartnerMock(),
  useUpdatePartnerStatus: () => useUpdatePartnerStatusMock(),
  useCreateCampaign: () => useCreateCampaignMock(),
  usePlatformAdminPromoCodes: () => usePlatformAdminPromoCodesMock(),
  useCreatePromoCode: () => useCreatePromoCodeMock(),
  useRetryPromoCodeProvisioning: () => useRetryPromoCodeProvisioningMock(),
  useAttribution: () => useAttributionMock(),
  usePartnerPayable: () => usePartnerPayableMock(),
  usePartnerPayouts: () => usePartnerPayoutsMock(),
  useRecordPayout: () => useRecordPayoutMock(),
}));

const PARTNER_DETAIL = {
  partner: {
    id: "partner-1",
    displayName: "RentalPro",
    legalName: null,
    email: "partner@rentalpro.example.com",
    contactInfo: null,
    status: "ACTIVE",
    internalNotes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  campaigns: [
    {
      id: "campaign-1",
      name: "YouTube September 2026",
      slug: "rentalpro",
      status: "ACTIVE",
      partnerId: "partner-1",
      commissionRateBp: 2500,
      commissionDurationMonths: 12,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  analytics: {
    registrations: 183,
    trialsStarted: 183,
    paidConversions: 61,
    activeSubscribers: 55,
    cancellations: 6,
    byCurrency: {},
  },
  balances: { USD: 44000 },
};

describe("PlatformAdminPartnerDetailPage", () => {
  beforeEach(() => {
    usePlatformAdminPartnerMock.mockReturnValue({ data: PARTNER_DETAIL, isLoading: false });
    useUpdatePartnerStatusMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCreateCampaignMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    usePlatformAdminPromoCodesMock.mockReturnValue({ data: [], isLoading: false });
    useCreatePromoCodeMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRetryPromoCodeProvisioningMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useAttributionMock.mockReturnValue({ data: undefined, isFetched: false });
    usePartnerPayableMock.mockReturnValue({
      data: { earnedMinor: 124000, adjustmentsMinor: 0, paidMinor: 80000, payableMinor: 44000 },
      isLoading: false,
    });
    usePartnerPayoutsMock.mockReturnValue({ data: [], isLoading: false });
    useRecordPayoutMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows the partner's name, real funnel metrics, and campaign", () => {
    renderWithProviders(<PlatformAdminPartnerDetailPage />);

    expect(screen.getByText("RentalPro")).toBeInTheDocument();
    // Registrations and trialsStarted are both 183 by design (every
    // registration starts a trial — see SubscriptionsService.startTrial),
    // so the real value legitimately appears twice.
    expect(screen.getAllByText("183")).toHaveLength(2);
    expect(screen.getByText("61")).toBeInTheDocument(); // paid conversions
    expect(screen.getByText("YouTube September 2026")).toBeInTheDocument();
    expect(screen.getByText("rentalpro")).toBeInTheDocument();
  });

  it("shows the real per-currency payable summary (Earned 1240.00, Paid 800.00, Payable 440.00)", () => {
    renderWithProviders(<PlatformAdminPartnerDetailPage />);

    expect(screen.getByText("$1,240.00")).toBeInTheDocument();
    expect(screen.getByText("$800.00")).toBeInTheDocument();
    expect(screen.getByText("$440.00")).toBeInTheDocument();
  });

  it("records a manual payout via the dialog, with the never-real-transfer disclaimer shown", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: "payout-1" });
    useRecordPayoutMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PlatformAdminPartnerDetailPage />);
    await user.click(screen.getByRole("button", { name: "Record payout" }));

    // Shown both as the card's always-visible disclaimer and again inside
    // the dialog itself — belt and suspenders around "never claim Havelio
    // transferred real money."
    expect(
      screen.getAllByText(
        "Recording a payout only logs that the admin already sent this amount externally — Havelio never transfers money automatically.",
      ).length,
    ).toBeGreaterThan(0);

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Amount"), "440");
    await user.click(within(dialog).getByRole("button", { name: "Record payout" }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 44000, currency: "USD", method: "BANK_TRANSFER" }),
    );
  });
});
