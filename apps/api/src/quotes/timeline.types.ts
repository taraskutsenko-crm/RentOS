export type QuoteTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "duplicated"
  | "converted"
  | "pdf_generated";

export interface QuoteTimelineEvent {
  id: string;
  type: QuoteTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
