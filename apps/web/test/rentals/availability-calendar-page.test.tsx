import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { tenantLocalToUtc } from "@rentos/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AvailabilityCalendarPage from "../../src/app/app/rentals/availability/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const useTenantTimezoneMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useTenantTimezone: () => useTenantTimezoneMock(),
}));

const useAssetsMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

const useAvailabilityMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useAvailability: (...args: unknown[]) => useAvailabilityMock(...args),
}));

const ASSET = { id: "asset-1", name: "Generator", internalNumber: "GEN-01" };

/**
 * Tenant-local calendar month/day grid correctness (see docs/DECISIONS.md
 * D-116) — the calendar must browse and query in the tenant's own
 * timezone, never UTC and never the viewer's own browser timezone, and the
 * canonical availability engine's real-instant business logic must never
 * be duplicated or altered here — only the presentation/query-window layer
 * is under test.
 */
describe("AvailabilityCalendarPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useAssetsMock.mockReturnValue({ data: { items: [ASSET], total: 1, page: 1, pageSize: 20 } });
    useAvailabilityMock.mockReturnValue({ data: { results: [] } });
    // A fixed "now" so the initial browsed month is deterministic across
    // every test regardless of when the suite actually runs.
    // `shouldAdvanceTime` keeps the fake clock ticking in step with real
    // wall-clock time so React Testing Library's own internal `waitFor`
    // polling (setTimeout-based) still resolves normally.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function selectAsset(): Promise<void> {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("checkbox"));
  }

  // A. Europe/Warsaw tenant — August month grid uses Warsaw dates.
  it("queries the availability window as the tenant-local (Europe/Warsaw) calendar month, not UTC", async () => {
    useTenantTimezoneMock.mockReturnValue("Europe/Warsaw");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    await waitFor(() => expect(useAvailabilityMock).toHaveBeenCalled());
    const lastCall = useAvailabilityMock.mock.calls.at(-1)!;
    const params = lastCall[1] as { plannedStart: string; plannedEnd: string };
    expect(params.plannedStart).toBe(
      tenantLocalToUtc("2026-08-01T00:00", "Europe/Warsaw").toISOString(),
    );
    expect(params.plannedEnd).toBe(
      tenantLocalToUtc("2026-09-01T00:00", "Europe/Warsaw").toISOString(),
    );
  });

  // B. America/New_York tenant — grid still uses New York dates regardless
  // of the environment's own timezone (the test process is never assumed
  // to run in any particular TZ — tenantLocalToUtc never consults it).
  it("queries the availability window as the tenant-local (America/New_York) calendar month", async () => {
    useTenantTimezoneMock.mockReturnValue("America/New_York");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    await waitFor(() => expect(useAvailabilityMock).toHaveBeenCalled());
    const lastCall = useAvailabilityMock.mock.calls.at(-1)!;
    const params = lastCall[1] as { plannedStart: string; plannedEnd: string };
    expect(params.plannedStart).toBe(
      tenantLocalToUtc("2026-08-01T00:00", "America/New_York").toISOString(),
    );
    expect(params.plannedEnd).toBe(
      tenantLocalToUtc("2026-09-01T00:00", "America/New_York").toISOString(),
    );
    // Genuinely a different real instant than the Warsaw window above —
    // proves the month boundary isn't silently collapsing to UTC.
    expect(params.plannedStart).not.toBe(
      tenantLocalToUtc("2026-08-01T00:00", "Europe/Warsaw").toISOString(),
    );
  });

  // C. America/Los_Angeles tenant — month start/end doesn't shift due to UTC.
  it("does not let UTC month boundaries shift the America/Los_Angeles tenant's visible month", async () => {
    useTenantTimezoneMock.mockReturnValue("America/Los_Angeles");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    await waitFor(() => expect(useAvailabilityMock).toHaveBeenCalled());
    const params = useAvailabilityMock.mock.calls.at(-1)![1] as {
      plannedStart: string;
      plannedEnd: string;
    };
    // Aug 1 00:00 PDT (UTC-7) = Aug 1 07:00 UTC — not Jul 31 anything, and
    // not a UTC-midnight-anchored value.
    expect(params.plannedStart).toBe("2026-08-01T07:00:00.000Z");
    expect(params.plannedEnd).toBe("2026-09-01T07:00:00.000Z");
  });

  // D. Asia/Dubai tenant — correct month boundaries.
  it("computes correct month boundaries for an Asia/Dubai tenant", async () => {
    useTenantTimezoneMock.mockReturnValue("Asia/Dubai");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    await waitFor(() => expect(useAvailabilityMock).toHaveBeenCalled());
    const params = useAvailabilityMock.mock.calls.at(-1)![1] as {
      plannedStart: string;
      plannedEnd: string;
    };
    // Aug 1 00:00 +04:00 = Jul 31 20:00 UTC.
    expect(params.plannedStart).toBe("2026-07-31T20:00:00.000Z");
    expect(params.plannedEnd).toBe("2026-08-31T20:00:00.000Z");
  });

  // E. DST month — calendar cells remain correct through a spring-forward
  // transition (Europe/Warsaw, last Sunday of March).
  it("renders every calendar day correctly for a month containing a DST transition", async () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    useTenantTimezoneMock.mockReturnValue("Europe/Warsaw");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    // March 2026 has 31 days — every cell must still render (no day
    // dropped or duplicated by the DST transition on 29 March).
    await waitFor(() => {
      const cells = screen.getAllByText(/^\d{1,2}$/);
      expect(cells).toHaveLength(31);
    });
  });

  // F. Previous/next month navigation does not drift timezone.
  it("navigates to the previous and next tenant-local month without timezone drift", async () => {
    useTenantTimezoneMock.mockReturnValue("Europe/Warsaw");
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();
    await waitFor(() => expect(useAvailabilityMock).toHaveBeenCalled());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      const params = useAvailabilityMock.mock.calls.at(-1)![1] as {
        plannedStart: string;
        plannedEnd: string;
      };
      expect(params.plannedStart).toBe(
        tenantLocalToUtc("2026-09-01T00:00", "Europe/Warsaw").toISOString(),
      );
      expect(params.plannedEnd).toBe(
        tenantLocalToUtc("2026-10-01T00:00", "Europe/Warsaw").toISOString(),
      );
    });

    await user.click(screen.getByRole("button", { name: /previous/i }));
    await user.click(screen.getByRole("button", { name: /previous/i }));

    await waitFor(() => {
      const params = useAvailabilityMock.mock.calls.at(-1)![1] as {
        plannedStart: string;
        plannedEnd: string;
      };
      expect(params.plannedStart).toBe(
        tenantLocalToUtc("2026-07-01T00:00", "Europe/Warsaw").toISOString(),
      );
      expect(params.plannedEnd).toBe(
        tenantLocalToUtc("2026-08-01T00:00", "Europe/Warsaw").toISOString(),
      );
    });
  });

  // H. Existing availability results are shown unchanged — a real conflict
  // still lands on the correct tenant-local day cell.
  it("still shows an existing conflict on its correct tenant-local day cell", async () => {
    useTenantTimezoneMock.mockReturnValue("Europe/Warsaw");
    useAvailabilityMock.mockReturnValue({
      data: {
        results: [
          {
            assetId: "asset-1",
            isAvailable: false,
            permanentReason: null,
            conflicts: [
              {
                rentalId: "rental-1",
                rentalNumber: "RNT-000001",
                // 10 Aug 09:00 Warsaw -> 12 Aug 09:00 Warsaw, as real instants.
                plannedStart: tenantLocalToUtc("2026-08-10T09:00", "Europe/Warsaw").toISOString(),
                plannedEnd: tenantLocalToUtc("2026-08-12T09:00", "Europe/Warsaw").toISOString(),
                isOverdue: false,
                overdueSince: null,
              },
            ],
            blocks: [],
          },
        ],
      },
    });
    renderWithProviders(<AvailabilityCalendarPage />);
    await selectAsset();

    await waitFor(() => {
      const cell = screen.getByText("11").closest("[title]");
      expect(cell).toHaveAttribute("title", expect.stringContaining("RNT-000001"));
    });
  });
});
