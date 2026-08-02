import type { RentOSDocument, DocumentListItem, DocumentSignatureRequest } from "./document";
import type { Rental, RentalListItem } from "./rental";

export interface PortalCustomer {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  vatNumber: string | null;
  address: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  portalInvitedAt: string | null;
  portalActivatedAt: string | null;
  portalLastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalTenant {
  id: string;
  name: string;
}

export interface PortalSession {
  customer: PortalCustomer;
  tenant: PortalTenant;
}

// ---------------------------------------------------------------------
// Rentals (Omit<Rental, "internalNotes"> — see PortalRentalsService)
// ---------------------------------------------------------------------

export type PortalRental = Omit<Rental, "internalNotes">;
export type PortalRentalListItem = Omit<RentalListItem, "internalNotes">;

export interface PaginatedPortalRentals {
  items: PortalRentalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type PortalRentalTimelineEventType =
  "created" | "updated" | "status_changed" | "items_returned";

export interface PortalRentalTimelineEvent {
  id: string;
  type: PortalRentalTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Documents (reuses the staff-side Document shape verbatim)
// ---------------------------------------------------------------------

export type PortalDocument = RentOSDocument;
export type PortalDocumentListItem = DocumentListItem;

export interface PaginatedPortalDocuments {
  items: PortalDocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PortalDocumentPreview {
  html: string;
}

export type PortalSignatureRequest = DocumentSignatureRequest;

// ---------------------------------------------------------------------
// Extension requests
// ---------------------------------------------------------------------

export type RentalExtensionRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RentalExtensionRequest {
  id: string;
  tenantId: string;
  rentalId: string;
  customerId: string;
  currentEnd: string;
  requestedEnd: string;
  message: string | null;
  status: RentalExtensionRequestStatus;
  responseMessage: string | null;
  respondedAt: string | null;
  respondedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRentalExtensionRequest extends RentalExtensionRequest {
  customer: { id: string; firstName: string; lastName: string; company: string | null };
}

// ---------------------------------------------------------------------
// Damage reports
// ---------------------------------------------------------------------

export type RentalDamageReportStatus =
  "SUBMITTED" | "REVIEWED" | "RESOLVED" | "CONVERTED_TO_DOCUMENT";

export interface RentalDamageReportPhoto {
  id: string;
  tenantId: string;
  damageReportId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RentalDamageReport {
  id: string;
  tenantId: string;
  rentalId: string;
  customerId: string;
  assetId: string | null;
  description: string;
  status: RentalDamageReportStatus;
  convertedDocumentId: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  photos: RentalDamageReportPhoto[];
}

export interface StaffRentalDamageReport extends RentalDamageReport {
  customer: { id: string; firstName: string; lastName: string; company: string | null };
}

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------

export type CustomerPortalMessageSender = "CUSTOMER" | "STAFF";

export interface CustomerPortalMessage {
  id: string;
  tenantId: string;
  customerId: string;
  rentalId: string | null;
  senderType: CustomerPortalMessageSender;
  senderUserId: string | null;
  body: string;
  readByCustomerAt: string | null;
  readByStaffAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

export type CustomerNotificationType =
  | "MESSAGE"
  | "DOCUMENT_SHARED"
  | "SIGNATURE_REQUESTED"
  | "EXTENSION_RESPONSE"
  | "RENTAL_UPDATE"
  | "DAMAGE_REPORT_UPDATE";

export interface CustomerNotification {
  id: string;
  tenantId: string;
  customerId: string;
  type: CustomerNotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------
// Assets (Omit financial/internal fields — see PortalAssetsService)
// ---------------------------------------------------------------------

export interface PortalAsset {
  id: string;
  tenantId: string;
  categoryId: string;
  currentStatusId: string;
  name: string;
  sku: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  currentLocationText: string | null;
  conditionNotes: string | null;
  isRentable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string };
  currentStatus: { id: string; name: string; colorToken: string | null };
  images: { id: string; isPrimary: boolean; altText: string | null }[];
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export interface PortalDashboardSummary {
  currentRentalsCount: number;
  upcomingRentalsCount: number;
  recentRentals: PortalRentalListItem[];
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  pendingSignatureRequestsCount: number;
  pendingExtensionRequestsCount: number;
}

// ---------------------------------------------------------------------
// Staff-side portal access status (invitations)
// ---------------------------------------------------------------------

export interface PortalAccessStatus {
  invited: boolean;
  activated: boolean;
  invitedAt: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  invitationExpired: boolean | null;
}

export interface PortalInvitationResult {
  invited: boolean;
  email: string;
  expiresAt: string;
  emailSent: boolean;
  inviteLink: string;
}
