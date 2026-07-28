import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RentalDetailPage from "../../src/app/app/rentals/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "rental-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useRentalMock = vi.fn();
const useRentalTimelineMock = vi.fn();
const useDeleteRentalMock = vi.fn();
const useReserveRentalMock = vi.fn();
const useStartRentalMock = vi.fn();
const useReturnRentalMock = vi.fn();
const useCancelRentalMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRental: (...args: unknown[]) => useRentalMock(...args),
  useRentalTimeline: (...args: unknown[]) => useRentalTimelineMock(...args),
  useDeleteRental: () => useDeleteRentalMock(),
  useReserveRental: () => useReserveRentalMock(),
  useStartRental: () => useStartRentalMock(),
  useReturnRental: () => useReturnRentalMock(),
  useCancelRental: () => useCancelRentalMock(),
}));

function baseRental(status: string) {
  return {
    id: "rental-1",
    rentalNumber: "RNT-000001",
    status,
    plannedStart: "2026-08-01T00:00:00Z",
    plannedEnd: "2026-08-04T00:00:00Z",
    actualStart: null,
    actualEnd: null,
    currency: "USD",
    subtotalMinor: 3000,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 3000,
    notes: null,
    internalNotes: null,
    customer: { firstName: "Jane", lastName: "Doe" },
    items: [],
  };
}

describe("RentalDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useRentalTimelineMock.mockReturnValue({ data: [] });
    useDeleteRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useReserveRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useStartRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useReturnRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the rental header with number, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("heading", { name: "RNT-000001" })).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
  });

  // 8. Status change / workflow test: only shows the reserve action for a DRAFT rental
  it("shows the reserve action for a DRAFT rental when the user has rentals.reserve", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.reserve");
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("button", { name: /reserve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start rental/i })).not.toBeInTheDocument();
  });

  it("shows the start action for a RESERVED rental when the user has rentals.start", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.start");
    useRentalMock.mockReturnValue({ data: baseRental("RESERVED"), isLoading: false });
    const startMutateAsync = vi.fn().mockResolvedValue(undefined);
    useStartRentalMock.mockReturnValue({ mutateAsync: startMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<RentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /start rental/i }));

    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledWith({ id: "rental-1" }));
  });

  it("shows the return action for an ACTIVE rental", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.return");
    useRentalMock.mockReturnValue({ data: baseRental("ACTIVE"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("button", { name: /return all/i })).toBeInTheDocument();
  });

  // 9. Permission-based controls: no action buttons without any permission
  it("hides every lifecycle action when the user has no rental permissions", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("RESERVED"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.queryByRole("button", { name: /start rental/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel rental/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit rental/i })).not.toBeInTheDocument();
  });

  // 10. Error display
  it("shows the error message when a lifecycle action fails", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.reserve");
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });
    useReserveRentalMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Cannot reserve a rental with no items")),
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<RentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /reserve/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
