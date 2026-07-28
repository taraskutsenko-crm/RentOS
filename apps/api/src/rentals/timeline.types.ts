export type RentalTimelineEventType = "created" | "updated" | "status_changed" | "items_returned";

export interface RentalTimelineEvent {
  id: string;
  type: RentalTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
