import type { DocumentStatus, DocumentType } from "./document";
import type { TimelineEvent } from "./timeline";

export interface AssetPlatformDocument {
  id: string;
  documentType: DocumentType;
  customTypeName: string | null;
  documentNumber: string;
  status: DocumentStatus;
  title: string | null;
  createdAt: string;
}

export type AssetFieldType =
  | "TEXT"
  | "TEXTAREA"
  | "INTEGER"
  | "DECIMAL"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "SELECT"
  | "MULTISELECT"
  | "URL"
  | "EMAIL"
  | "PHONE";

export type AssetDocumentType =
  | "PURCHASE_DOCUMENT"
  | "MANUAL"
  | "CERTIFICATE"
  | "INSURANCE"
  | "REGISTRATION"
  | "INSPECTION"
  | "OTHER";

export interface AssetCategory {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  code: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AssetCategoryTreeNode extends AssetCategory {
  children: AssetCategoryTreeNode[];
}

export interface AssetStatusDefinition {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  colorToken: string | null;
  icon: string | null;
  isSystem: boolean;
  isActive: boolean;
  isAvailableForRental: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AssetFieldOption {
  value: string;
  label: string;
}

export interface AssetValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface AssetCustomFieldDefinition {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  key: string;
  description: string | null;
  fieldType: AssetFieldType;
  isRequired: boolean;
  isActive: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  sortOrder: number;
  validationRules: AssetValidationRules | null;
  options: AssetFieldOption[] | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AssetImage {
  id: string;
  tenantId: string;
  assetId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isPrimary: boolean;
  altText: string | null;
  uploadedByUserId: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface AssetDocument {
  id: string;
  tenantId: string;
  assetId: string;
  documentType: AssetDocumentType;
  title: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  uploadedByUserId: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface Asset {
  id: string;
  tenantId: string;
  categoryId: string;
  currentStatusId: string;
  name: string;
  internalNumber: string;
  sku: string | null;
  serialNumber: string | null;
  barcode: string | null;
  qrCodeValue: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  purchaseDate: string | null;
  purchasePriceMinor: number | null;
  purchaseCurrency: string | null;
  replacementValueMinor: number | null;
  replacementCurrency: string | null;
  currentLocationText: string | null;
  conditionNotes: string | null;
  isRentable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  category: AssetCategory;
  currentStatus: AssetStatusDefinition;
  customFields: Record<string, unknown>;
}

/**
 * Why an asset is not available right now — computed by the backend from
 * the canonical availability engine (see AssetsService.findMany /
 * asset-current-availability.util.ts), never re-derived on the frontend.
 */
export type AssetUnavailableReason =
  | "NOT_RENTABLE"
  | "RENTED"
  | "MAINTENANCE"
  | "REPAIR"
  | "INSPECTION"
  | "RELOCATION"
  | "MANUAL_BLOCK"
  | "LOST"
  | "RETIRED";

export interface AssetListItem extends Asset {
  primaryImage: AssetImage | null;
  /**
   * "Is this asset actually available right now" — server-computed from the
   * same canonical rental/block overlap engine every other availability
   * decision uses, evaluated at the moment of the list request. Distinct
   * from `isRentable` (the owner's own enable/disable configuration, which
   * this already factors in) and from `currentStatus` (a coarser,
   * best-effort persisted label — see Asset.currentStatusId's own doc
   * comment). Never reconstruct this on the frontend.
   */
  isAvailableNow: boolean;
  /** Set only when `isAvailableNow` is false. */
  unavailableReason: AssetUnavailableReason | null;
}

export interface AssetDetail extends Asset {
  images: AssetImage[];
  documents: AssetDocument[];
  platformDocuments: AssetPlatformDocument[];
}

export interface PaginatedAssets {
  items: AssetListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type AssetTimelineEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "location_changed"
  | "image_uploaded"
  | "document_uploaded";

export type AssetTimelineEvent = TimelineEvent<AssetTimelineEventType>;

export interface AssetSummary {
  totalRentals: number;
  revenueGeneratedMinor: number;
  currency: string | null;
  currentStatus: { id: string; code: string; name: string };
  currentLocation: string | null;
}
