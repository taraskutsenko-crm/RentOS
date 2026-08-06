import type { TimelineEvent } from "@rentos/shared";

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

export type QuoteTimelineEvent = TimelineEvent<QuoteTimelineEventType>;
