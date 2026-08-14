import type { QuoteStatus } from "../types/quote";

export type QuoteNextActionKind = "CONVERT_QUOTE" | "NONE";

export interface QuoteNextAction {
  kind: QuoteNextActionKind;
}

/**
 * Pure derivation of the single most useful next step for a quote,
 * surfaced as the Quote Workspace's PageHeader primary action — mirrors
 * getQuoteValidityIntelligence's pattern. An ACCEPTED quote not yet
 * converted is the only real next-step capability today (convert to
 * Rental, already built in Chapter 8); every other status has no further
 * quote-level action to surface.
 */
export function getQuoteNextAction(quote: {
  status: QuoteStatus;
  convertedRental: { id: string; rentalNumber: string } | null;
}): QuoteNextAction {
  if (quote.status === "ACCEPTED" && !quote.convertedRental) {
    return { kind: "CONVERT_QUOTE" };
  }
  return { kind: "NONE" };
}
