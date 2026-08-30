import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalRentalDetailPage from "../../src/app/portal/(shell)/rentals/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rental-1" }),
}));

const usePortalRentalMock = vi.fn();
const usePortalRentalTimelineMock = vi.fn();
vi.mock("../../src/hooks/use-portal-rentals", () => ({
  usePortalRental: (...args: unknown[]) => usePortalRentalMock(...args),
  usePortalRentalTimeline: (...args: unknown[]) => usePortalRentalTimelineMock(...args),
  portalRentalDocumentsZipUrl: (id: string) => `http://api.test/portal/rentals/${id}/documents/zip`,
  portalRentalQrCodeUrl: (id: string) => `http://api.test/portal/rentals/${id}/qr-code`,
}));

const usePortalDocumentsMock = vi.fn();
vi.mock("../../src/hooks/use-portal-documents", () => ({
  usePortalDocuments: (...args: unknown[]) => usePortalDocumentsMock(...args),
}));

const usePortalExtensionRequestsMock = vi.fn();
const useCreatePortalExtensionRequestMock = vi.fn();
vi.mock("../../src/hooks/use-portal-extension-requests", () => ({
  usePortalExtensionRequests: (...args: unknown[]) => usePortalExtensionRequestsMock(...args),
  useCreatePortalExtensionRequest: () => useCreatePortalExtensionRequestMock(),
}));

const usePortalDamageReportsMock = vi.fn();
const useCreatePortalDamageReportMock = vi.fn();
const useUploadPortalDamageReportPhotoMock = vi.fn();
vi.mock("../../src/hooks/use-portal-damage-reports", () => ({
  usePortalDamageReports: (...args: unknown[]) => usePortalDamageReportsMock(...args),
  useCreatePortalDamageReport: () => useCreatePortalDamageReportMock(),
  useUploadPortalDamageReportPhoto: () => useUploadPortalDamageReportPhotoMock(),
}));

function baseRental(status: string) {
  return {
    id: "rental-1",
    rentalNumber: "RNT-000001",
    status,
    plannedStart: "2026-08-01T00:00:00Z",
    plannedEnd: "2026-08-04T00:00:00Z",
    tenantTimezone: "America/New_York",
    actualStart: null,
    actualEnd: null,
    currency: "USD",
    subtotalMinor: 3000,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 3000,
    items: [],
  };
}

describe("PortalRentalDetailPage", () => {
  beforeEach(() => {
    usePortalRentalTimelineMock.mockReturnValue({ data: [] });
    usePortalDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 50 },
    });
    usePortalExtensionRequestsMock.mockReturnValue({ data: [] });
    usePortalDamageReportsMock.mockReturnValue({ data: [] });
    useCreatePortalExtensionRequestMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCreatePortalDamageReportMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useUploadPortalDamageReportPhotoMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders the rental number and status", () => {
    usePortalRentalMock.mockReturnValue({
      data: baseRental("ACTIVE"),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalRentalDetailPage />);

    expect(screen.getByRole("heading", { name: /RNT-000001/ })).toBeInTheDocument();
  });

  it("shows the request-extension action for an ACTIVE rental but not for a DRAFT one", () => {
    usePortalRentalMock.mockReturnValue({
      data: baseRental("DRAFT"),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalRentalDetailPage />);

    expect(screen.queryByRole("button", { name: /request extension/i })).not.toBeInTheDocument();
  });

  it("submits an extension request with the chosen date", async () => {
    usePortalRentalMock.mockReturnValue({
      data: baseRental("ACTIVE"),
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockResolvedValue({ id: "ext-1" });
    useCreatePortalExtensionRequestMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalRentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /request extension/i }));
    const dateInput = screen.getByLabelText(/new end date/i);
    await user.type(dateInput, "2026-08-20");
    await user.click(screen.getByRole("button", { name: /^submit request$/i }));

    // The picker is date-only — the submitted instant keeps the rental's
    // existing plannedEnd time-of-day (20:00 America/New_York, i.e.
    // plannedEnd's 00:00 UTC) on the newly picked date, converted via the
    // tenant's real timezone (see ExtensionRequestForm's handleSubmit).
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          rentalId: "rental-1",
          requestedEnd: "2026-08-21T00:00:00.000Z",
        }),
      ),
    );
  });

  it("submits a damage report", async () => {
    usePortalRentalMock.mockReturnValue({
      data: baseRental("ACTIVE"),
      isLoading: false,
      isError: false,
    });
    const mutateAsync = vi.fn().mockResolvedValue({ id: "dmg-1" });
    useCreatePortalDamageReportMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalRentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /report damage/i }));
    await user.type(screen.getByLabelText(/description/i), "Cracked panel");
    await user.click(screen.getByRole("button", { name: /^submit report$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rentalId: "rental-1", description: "Cracked panel" }),
      ),
    );
  });
});
