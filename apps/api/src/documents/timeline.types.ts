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
  | "file_deleted"
  | "rendered"
  | "shared"
  | "share_viewed"
  | "share_downloaded"
  | "share_disabled"
  | "email_sent"
  | "email_failed"
  | "signature_requested"
  | "signature_status_changed";

export interface DocumentTimelineEvent {
  id: string;
  type: DocumentTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}
