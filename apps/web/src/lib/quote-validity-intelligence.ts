import type { QuoteStatus } from "../types/quote";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type QuoteValidityIntelligenceKind =
  | "expires_today"
  | "expires_tomorrow"
  | "expires_in_days"
  | "expired"
  | "accepted"
  | "rejected"
  | "converted"
  | "cancelled";

export interface QuoteValidityIntelligence {
  kind: QuoteValidityIntelligenceKind;
  days: number;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / MS_PER_DAY);
}

/**
 * Pure, deterministic derivation of a quote's validity label from its
 * status and `validUntil` date — never a persisted value, computed fresh
 * on every render. Centralized here per docs/UI_REDESIGN_PLAN.md Chapter 8
 * (mirroring Chapter 7's getRentalTimeIntelligence) so no component
 * duplicates this date math. `validUntil` is an ISO string
 * (Quote.validUntil); `nowMs` must be captured once by the caller (e.g. a
 * lazy useState initializer) since Date.now() cannot be called during
 * render.
 */
export function getQuoteValidityIntelligence(
  status: QuoteStatus,
  validUntil: string,
  nowMs: number,
): QuoteValidityIntelligence {
  if (status === "ACCEPTED") return { kind: "accepted", days: 0 };
  if (status === "REJECTED") return { kind: "rejected", days: 0 };
  if (status === "CONVERTED") return { kind: "converted", days: 0 };
  if (status === "CANCELLED") return { kind: "cancelled", days: 0 };
  if (status === "EXPIRED") return { kind: "expired", days: 0 };

  // DRAFT / SENT / VIEWED — still awaiting a decision.
  const daysUntilExpiry = daysBetween(nowMs, new Date(validUntil).getTime());
  if (daysUntilExpiry > 1) return { kind: "expires_in_days", days: daysUntilExpiry };
  if (daysUntilExpiry === 1) return { kind: "expires_tomorrow", days: 1 };
  if (daysUntilExpiry === 0) return { kind: "expires_today", days: 0 };
  // validUntil has already passed but the backend hasn't lazily flipped
  // the status yet (only happens on next read/action) — show the honest
  // label matching reality rather than a stale status word.
  return { kind: "expired", days: Math.abs(daysUntilExpiry) };
}
