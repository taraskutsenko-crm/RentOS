import { describe, expect, it } from "vitest";

import { getQuoteNextAction } from "../../src/lib/quote-next-action";
import type { QuoteStatus } from "../../src/types/quote";

describe("getQuoteNextAction", () => {
  const statusesWithNoAction: QuoteStatus[] = [
    "DRAFT",
    "SENT",
    "VIEWED",
    "REJECTED",
    "EXPIRED",
    "CONVERTED",
    "CANCELLED",
  ];

  it.each(statusesWithNoAction)("returns NONE for status %s", (status) => {
    expect(getQuoteNextAction({ status, convertedRental: null })).toEqual({ kind: "NONE" });
  });

  it("returns CONVERT_QUOTE for an ACCEPTED quote not yet converted", () => {
    expect(getQuoteNextAction({ status: "ACCEPTED", convertedRental: null })).toEqual({
      kind: "CONVERT_QUOTE",
    });
  });

  it("returns NONE for an ACCEPTED quote that already has a converted rental", () => {
    const convertedRental = { id: "rental-1", rentalNumber: "R-000001" };
    expect(getQuoteNextAction({ status: "ACCEPTED", convertedRental })).toEqual({
      kind: "NONE",
    });
  });
});
