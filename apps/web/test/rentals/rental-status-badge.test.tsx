import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RentalStatusBadge } from "../../src/components/rentals/rental-status-badge";
import type { RentalStatus } from "../../src/types/rental";
import { renderWithProviders } from "../test-utils";

describe("RentalStatusBadge", () => {
  it.each<[RentalStatus, string]>([
    ["DRAFT", "Draft"],
    ["QUOTE", "Quote"],
    ["RESERVED", "Reserved"],
    ["ACTIVE", "Active"],
    ["RETURNED", "Returned"],
    ["COMPLETED", "Completed"],
    ["CANCELLED", "Cancelled"],
  ])("renders the translated label for %s", (status, label) => {
    renderWithProviders(<RentalStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("gives ACTIVE a visually distinct tone from a neutral status like DRAFT", () => {
    const { unmount } = renderWithProviders(<RentalStatusBadge status="ACTIVE" />);
    const activeClass = screen.getByText("Active").className;
    unmount();

    renderWithProviders(<RentalStatusBadge status="DRAFT" />);
    const draftClass = screen.getByText("Draft").className;

    expect(activeClass).not.toBe(draftClass);
  });
});
