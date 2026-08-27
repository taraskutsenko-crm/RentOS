import type { Asset } from "./asset";
import type { Customer } from "./customer";
import type { TimelineEvent } from "./timeline";

export type DocumentType =
  | "QUOTE"
  | "CONTRACT"
  | "HANDOVER_PROTOCOL"
  | "RETURN_PROTOCOL"
  | "DAMAGE_REPORT"
  | "CONTRACT_AMENDMENT"
  | "DEPOSIT_RECEIPT"
  | "CUSTOM";

export type DocumentStatus =
  | "DRAFT"
  | "READY"
  | "SENT"
  | "VIEWED"
  | "PARTIALLY_SIGNED"
  | "SIGNED"
  | "REJECTED"
  | "VOIDED"
  | "ARCHIVED";

export type DocumentFileFormat =
  "PDF" | "HTML" | "JSON_SNAPSHOT" | "DOCX" | "XML" | "ATTACHMENT" | "PHOTO";

export type DocumentAttachmentCategory =
  "HANDOVER_CONDITION" | "RETURN_CONDITION" | "DAMAGE" | "OTHER";

export interface DocumentFile {
  id: string;
  documentVersionId: string;
  format: DocumentFileFormat;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentAttachmentCategory | null;
  caption: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  parentVersionId: string | null;
  businessDataSnapshot: Record<string, unknown>;
  templateId: string | null;
  isFinal: boolean;
  finalizedAt: string | null;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
  files: DocumentFile[];
}

export interface DocumentItem {
  id: string;
  documentId: string;
  assetId: string | null;
  rentalItemId: string | null;
  description: string | null;
  dataJson: Record<string, unknown> | null;
  sortOrder: number;
  asset: Asset | null;
}

export interface RentOSDocument {
  id: string;
  tenantId: string;
  documentType: DocumentType;
  customTypeName: string | null;
  documentNumber: string;
  status: DocumentStatus;
  title: string | null;
  customerId: string | null;
  rentalId: string | null;
  quoteId: string | null;
  assetId: string | null;
  employeeUserId: string | null;
  currentVersionNumber: number;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  customer: Customer | null;
  rental: { id: string; rentalNumber: string } | null;
  quote: { id: string; quoteNumber: string } | null;
  asset: Asset | null;
  items: DocumentItem[];
  versions: DocumentVersion[];
}

export interface DocumentListItem extends Omit<
  RentOSDocument,
  "items" | "versions" | "rental" | "quote" | "asset"
> {
  itemCount: number;
}

export interface PaginatedDocuments {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

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

export type DocumentTimelineEvent = TimelineEvent<DocumentTimelineEventType>;

export interface DocumentPreview {
  documentNumber: string;
  documentType: DocumentType;
  title: string | null;
  status: DocumentStatus;
  html: string;
  templateId: string | null;
  templateSource: "explicit" | "tenant_active" | "built_in_default";
}

// ---------------------------------------------------------------------
// Templates (Part 2)
// ---------------------------------------------------------------------

export type DocumentTemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface DocumentTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  htmlContent: string;
  css: string | null;
  variablesSchema: Record<string, unknown> | null;
  createdByUserId: string;
  createdAt: string;
}

export interface DocumentTemplate {
  id: string;
  tenantId: string;
  documentType: DocumentType;
  name: string;
  description: string | null;
  status: DocumentTemplateStatus;
  currentVersionNumber: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  versions: DocumentTemplateVersion[];
}

export interface DocumentTemplateListItem extends Omit<DocumentTemplate, "versions"> {
  versionCount: number;
}

export interface PaginatedDocumentTemplates {
  items: DocumentTemplateListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------
// Sharing (Part 4)
// ---------------------------------------------------------------------

export interface DocumentShareLink {
  id: string;
  tenantId: string;
  documentVersionId: string;
  passwordHash: string | null;
  expiresAt: string;
  viewCount: number;
  downloadCount: number;
  lastAccessedAt: string | null;
  lastAccessedIp: string | null;
  disabledAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface CreatedDocumentShareLink {
  shareLink: DocumentShareLink;
  token: string;
}

export interface PublicDocumentView {
  documentNumber: string;
  documentType: DocumentType;
  title: string | null;
  status: DocumentStatus;
  html: string;
}

// ---------------------------------------------------------------------
// Email (Part 5)
// ---------------------------------------------------------------------

export type DocumentEmailRecipientType = "CUSTOMER" | "EMPLOYEE" | "CUSTOM";
export type DocumentEmailStatus = "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";

export interface DocumentEmailDelivery {
  id: string;
  documentId: string;
  documentVersionId: string;
  recipientType: DocumentEmailRecipientType;
  recipientEmail: string;
  subject: string;
  message: string | null;
  status: DocumentEmailStatus;
  errorMessage: string | null;
  sentByUserId: string;
  createdAt: string;
  sentAt: string | null;
}

// ---------------------------------------------------------------------
// E-signature (Part 6)
// ---------------------------------------------------------------------

export type DocumentSignatureProviderType =
  "LOCAL_MOCK" | "DOCUSIGN" | "ADOBE_SIGN" | "AUTENTI" | "EIDAS";
export type DocumentSignatureStatus =
  "REQUESTED" | "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface DocumentSignatureRequest {
  id: string;
  documentId: string;
  documentVersionId: string;
  provider: DocumentSignatureProviderType;
  status: DocumentSignatureStatus;
  signerName: string | null;
  signerEmail: string | null;
  externalReference: string | null;
  requestedByUserId: string;
  requestedAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
}
