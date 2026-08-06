import type { TimelineEvent } from "@rentos/shared";

export type AssetTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "location_changed"
  | "image_uploaded"
  | "document_uploaded";

/** A single normalized, chronologically-orderable event for an asset's timeline. */
export type AssetTimelineEvent = TimelineEvent<AssetTimelineEventType>;
