export type DocumentTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "sent"
  | "viewed"
  | "signed"
  | "downloaded"
  | "archived"
  | "version_created"
  | "file_uploaded"
  | "file_deleted";

export interface DocumentTimelineEvent {
  id: string;
  type: DocumentTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
