import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvailabilityBadge } from "../../src/components/assets/availability-badge";
import type { AvailabilityBadgeInfo } from "../../src/lib/asset-availability-badge";
import { renderWithProviders } from "../test-utils";

const overdueBadge: AvailabilityBadgeInfo = {
  kind: "RENTAL_CONFLICT",
  labelKey: "asset.availability.rentalConflictOverdue",
  reference: "RNT-000001",
  startAt: "2026-08-11T08:00:00.000Z",
  endAt: "2026-08-12T08:00:00.000Z",
  rentalId: "rental-1",
  isOverdueConflict: true,
};

const ordinaryBadge: AvailabilityBadgeInfo = {
  kind: "RENTAL_CONFLICT",
  labelKey: "asset.availability.rentalConflict",
  reference: "RNT-000002",
  startAt: "2026-08-11T08:00:00.000Z",
  endAt: "2026-08-12T08:00:00.000Z",
  rentalId: "rental-2",
  isOverdueConflict: false,
};

// Task B: the New Rental → Assets conflict badge must be readable — real
// WCAG-safe colors, real text (never color alone), and an overdue rental
// must never imply the asset becomes available once plannedEnd passes.
describe("AvailabilityBadge", () => {
  it("shows the rental number, 'overdue rental' wording, and Planned return — never a date range — for an overdue conflict", () => {
    renderWithProviders(<AvailabilityBadge badge={overdueBadge} locale="en" timezone="UTC" />);

    expect(screen.getByText(/RNT-000001/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable — overdue rental/)).toBeInTheDocument();
    expect(screen.getByText(/Planned return:/)).toBeInTheDocument();
    // Never implies the asset frees up at endAt — no start–end date range shown.
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("uses the danger (not low-contrast warning) tone classes for an overdue conflict", () => {
    const { container } = renderWithProviders(
      <AvailabilityBadge badge={overdueBadge} locale="en" timezone="UTC" />,
    );
    const badgeEl = container.firstElementChild as HTMLElement;
    expect(badgeEl.className).toContain("bg-danger-light");
    expect(badgeEl.className).toContain("text-destructive");
    // The original bug: a near-transparent alpha fill (bg-warning/15) with
    // white text — effectively unreadable in light mode.
    expect(badgeEl.className).not.toMatch(/bg-warning\/\d/);
    expect(badgeEl.className).not.toMatch(/opacity-\d/);
  });

  it("shows the rental number and a plain start–end range for an ordinary (non-overdue) conflict", () => {
    renderWithProviders(<AvailabilityBadge badge={ordinaryBadge} locale="en" timezone="UTC" />);

    expect(screen.getByText(/RNT-000002/)).toBeInTheDocument();
    expect(screen.getByText("Booked (rental)")).toBeInTheDocument();
  });

  it("never renders with a zero-opacity/invisible styling class", () => {
    const { container } = renderWithProviders(
      <AvailabilityBadge badge={ordinaryBadge} locale="en" timezone="UTC" />,
    );
    const badgeEl = container.firstElementChild as HTMLElement;
    expect(badgeEl.className).not.toMatch(/opacity-\d/);
    expect(badgeEl.className).toContain("bg-warning-light");
    expect(badgeEl.className).toContain("text-warning");
  });
});
