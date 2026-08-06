import type { TimelineEvent } from "@rentos/shared";

export type CustomerTimelineEventType = "created" | "updated" | "deleted";

export type CustomerTimelineEvent = TimelineEvent<CustomerTimelineEventType>;
