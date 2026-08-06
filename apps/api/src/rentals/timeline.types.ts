import type { TimelineEvent } from "@rentos/shared";

export type RentalTimelineEventType = "created" | "updated" | "status_changed" | "items_returned";

export type RentalTimelineEvent = TimelineEvent<RentalTimelineEventType>;
