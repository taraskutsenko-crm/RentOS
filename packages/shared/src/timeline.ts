/**
 * The one generic timeline-event envelope every backend module with
 * lifecycle history uses — see docs/PRODUCT_BIBLE.md §12 (Timeline
 * First) and docs/UI_REDESIGN_PLAN.md Chapter 6. Assets, Rentals,
 * Quotes, Documents, and Customers each declare their own narrow
 * `type` union and alias this generic instead of re-declaring the
 * same four envelope fields independently.
 */
export interface TimelineEvent<TType extends string> {
  id: string;
  type: TType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
