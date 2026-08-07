import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuoteStatusBadge } from "../../src/components/quotes/quote-status-badge";
import type { QuoteStatus } from "../../src/types/quote";
import { renderWithProviders } from "../test-utils";

describe("QuoteStatusBadge", () => {
  it.each<[QuoteStatus, string]>([
    ["DRAFT", "Draft"],
    ["SENT", "Sent"],
    ["VIEWED", "Viewed"],
    ["ACCEPTED", "Accepted"],
    ["REJECTED", "Rejected"],
    ["EXPIRED", "Expired"],
    ["CONVERTED", "Converted"],
    ["CANCELLED", "Cancelled"],
  ])("renders the translated label for %s", (status, label) => {
    renderWithProviders(<QuoteStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("gives ACCEPTED a visually distinct tone from a neutral status like DRAFT", () => {
    const { unmount } = renderWithProviders(<QuoteStatusBadge status="ACCEPTED" />);
    const acceptedClass = screen.getByText("Accepted").className;
    unmount();

    renderWithProviders(<QuoteStatusBadge status="DRAFT" />);
    const draftClass = screen.getByText("Draft").className;

    expect(acceptedClass).not.toBe(draftClass);
  });

  it("gives REJECTED a visually distinct tone from ACCEPTED", () => {
    const { unmount } = renderWithProviders(<QuoteStatusBadge status="REJECTED" />);
    const rejectedClass = screen.getByText("Rejected").className;
    unmount();

    renderWithProviders(<QuoteStatusBadge status="ACCEPTED" />);
    const acceptedClass = screen.getByText("Accepted").className;

    expect(rejectedClass).not.toBe(acceptedClass);
  });
});
