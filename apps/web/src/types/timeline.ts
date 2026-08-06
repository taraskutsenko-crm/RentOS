/**
 * The one generic timeline-event envelope every entity detail page renders
 * — see docs/PRODUCT_BIBLE.md §12 (Timeline First) and
 * docs/UI_REDESIGN_PLAN.md Chapter 6. This mirrors, but is deliberately
 * declared separately from, the backend's TimelineEvent<T> in
 * @rentos/shared — the frontend never imports backend types directly (see
 * docs/HANDOVER.md's type-layering convention).
 */
export interface TimelineEvent<TType extends string> {
  id: string;
  type: TType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
