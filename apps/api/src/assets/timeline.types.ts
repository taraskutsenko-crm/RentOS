export type AssetTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "location_changed"
  | "image_uploaded"
  | "document_uploaded";

/** A single normalized, chronologically-orderable event for an asset's timeline. */
export interface AssetTimelineEvent {
  id: string;
  type: AssetTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
