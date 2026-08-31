import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSignature,
  FileText,
  FileUp,
  FileX,
  History,
  Image as ImageIcon,
  Lock,
  Mail,
  MailWarning,
  MapPin,
  Pencil,
  PenTool,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { AssetTimelineEventType } from "../types/asset";
import type { CustomerTimelineEventType } from "../types/customer";
import type { DocumentTimelineEventType } from "../types/document";
import type { QuoteTimelineEventType } from "../types/quote";
import type { RentalTimelineEventType } from "../types/rental";

/**
 * How one timeline event type renders: icon + i18n label key + optional
 * semantic tone. Every entity's Timeline is driven entirely by one of these
 * registries — the shared <Timeline> component never branches on entity
 * type (see docs/UI_REDESIGN_PLAN.md Chapter 6, design decision 4).
 */
export interface TimelineEventConfig {
  icon: LucideIcon;
  labelKey: string;
  tone?: "success" | "warning" | "danger";
}

export const ASSET_TIMELINE_REGISTRY: Record<AssetTimelineEventType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "asset.timeline.created" },
  updated: { icon: Pencil, labelKey: "asset.timeline.updated" },
  status_changed: { icon: RefreshCw, labelKey: "asset.timeline.status_changed" },
  location_changed: { icon: MapPin, labelKey: "asset.timeline.location_changed" },
  image_uploaded: { icon: ImageIcon, labelKey: "asset.timeline.image_uploaded" },
  document_uploaded: { icon: FileUp, labelKey: "asset.timeline.document_uploaded" },
};

export const RENTAL_TIMELINE_REGISTRY: Record<RentalTimelineEventType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "rental.timeline.created" },
  updated: { icon: Pencil, labelKey: "rental.timeline.updated" },
  status_changed: { icon: RefreshCw, labelKey: "rental.timeline.status_changed" },
  items_returned: { icon: Undo2, labelKey: "rental.timeline.items_returned", tone: "success" },
};

export const QUOTE_TIMELINE_REGISTRY: Record<QuoteTimelineEventType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "quote.timeline.created" },
  updated: { icon: Pencil, labelKey: "quote.timeline.updated" },
  status_changed: { icon: RefreshCw, labelKey: "quote.timeline.status_changed" },
  sent: { icon: Send, labelKey: "quote.timeline.sent" },
  viewed: { icon: Eye, labelKey: "quote.timeline.viewed" },
  accepted: { icon: CheckCircle2, labelKey: "quote.timeline.accepted", tone: "success" },
  rejected: { icon: XCircle, labelKey: "quote.timeline.rejected", tone: "danger" },
  duplicated: { icon: Copy, labelKey: "quote.timeline.duplicated" },
  converted: { icon: ArrowRightLeft, labelKey: "quote.timeline.converted", tone: "success" },
  pdf_generated: { icon: FileText, labelKey: "quote.timeline.pdf_generated" },
};

export const DOCUMENT_TIMELINE_REGISTRY: Record<DocumentTimelineEventType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "document.timeline.created" },
  updated: { icon: Pencil, labelKey: "document.timeline.updated" },
  status_changed: { icon: RefreshCw, labelKey: "document.timeline.status_changed" },
  sent: { icon: Send, labelKey: "document.timeline.sent" },
  viewed: { icon: Eye, labelKey: "document.timeline.viewed" },
  signed: { icon: PenTool, labelKey: "document.timeline.signed", tone: "success" },
  downloaded: { icon: Download, labelKey: "document.timeline.downloaded" },
  archived: { icon: Archive, labelKey: "document.timeline.archived" },
  version_created: { icon: History, labelKey: "document.timeline.version_created" },
  file_uploaded: { icon: FileUp, labelKey: "document.timeline.file_uploaded" },
  file_deleted: { icon: FileX, labelKey: "document.timeline.file_deleted", tone: "danger" },
  rendered: { icon: FileText, labelKey: "document.timeline.rendered" },
  shared: { icon: Share2, labelKey: "document.timeline.shared" },
  share_viewed: { icon: Eye, labelKey: "document.timeline.share_viewed" },
  share_downloaded: { icon: Download, labelKey: "document.timeline.share_downloaded" },
  share_disabled: { icon: Lock, labelKey: "document.timeline.share_disabled" },
  email_sent: { icon: Mail, labelKey: "document.timeline.email_sent" },
  email_failed: { icon: MailWarning, labelKey: "document.timeline.email_failed", tone: "danger" },
  signature_requested: { icon: FileSignature, labelKey: "document.timeline.signature_requested" },
  signature_status_changed: {
    icon: FileSignature,
    labelKey: "document.timeline.signature_status_changed",
  },
  signature_captured: { icon: FileSignature, labelKey: "document.timeline.signature_captured" },
};

export const CUSTOMER_TIMELINE_REGISTRY: Record<CustomerTimelineEventType, TimelineEventConfig> = {
  created: { icon: Sparkles, labelKey: "customer.timeline.created" },
  updated: { icon: Pencil, labelKey: "customer.timeline.updated" },
  deleted: { icon: Trash2, labelKey: "customer.timeline.deleted", tone: "danger" },
};
