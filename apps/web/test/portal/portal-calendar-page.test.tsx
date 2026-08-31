import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PortalCalendarPage from "../../src/app/portal/(shell)/calendar/page";
import { renderWithProviders } from "../test-utils";

const usePortalRentalsMock = vi.fn();
vi.mock("../../src/hooks/use-portal-rentals", () => ({
  usePortalRentals: (...args: unknown[]) => usePortalRentalsMock(...args),
}));

const usePortalMeMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalMe: () => usePortalMeMock(),
}));

function rentalGrid(): HTMLElement[] {
  // Second `.grid.grid-cols-7` is the day-cell grid; the first is the weekday header row.
  const grids = document.querySelectorAll(".grid.grid-cols-7");
  return Array.from(grids[1]?.children ?? []) as HTMLElement[];
}

describe("PortalCalendarPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    usePortalMeMock.mockReturnValue({
      data: {
        customer: { firstName: "Jane" },
        tenant: { id: "t1", name: "Closure Pass Rentals", timezone: "America/New_York" },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a rental that starts on the last day of the tenant-local month on that day's cell", async () => {
    usePortalRentalsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "r1",
            rentalNumber: "RNT-000004",
            status: "ACTIVE",
            // 2026-08-31T22:50:00Z is 2026-08-31 18:50 America/New_York —
            // starts on the last calendar day of the tenant-local month.
            plannedStart: "2026-08-31T22:50:00.000Z",
            plannedEnd: "2026-09-02T22:50:00.000Z",
            totalMinor: 2000,
            currency: "USD",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalCalendarPage />);

    expect(await screen.findByText("August 2026")).toBeInTheDocument();

    const cells = rentalGrid();
    const dayLabels = cells.map((cell) => cell.querySelector("p")?.textContent);
    const aug31Index = dayLabels.lastIndexOf("31"); // last "31" cell is the in-month one, not the July padding cell
    const sep1Index = dayLabels.findIndex((label, index) => label === "1" && index > aug31Index);

    expect(within(cells[aug31Index]!).getByText("RNT-000004")).toBeInTheDocument();
    expect(within(cells[sep1Index]!).getByText("RNT-000004")).toBeInTheDocument();
  });

  it("renders the tenant-local weekday grid for a Europe/Warsaw tenant and navigates months", async () => {
    usePortalMeMock.mockReturnValue({
      data: {
        customer: { firstName: "Anna" },
        tenant: { id: "t2", name: "Warsaw Co", timezone: "Europe/Warsaw" },
      },
    });
    usePortalRentalsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 100 },
      isLoading: false,
      isError: false,
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<PortalCalendarPage />);

    expect(await screen.findByText("August 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "→" }));
    expect(await screen.findByText("September 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "←" }));
    await user.click(screen.getByRole("button", { name: "←" }));
    expect(await screen.findByText("July 2026")).toBeInTheDocument();
  });
});
