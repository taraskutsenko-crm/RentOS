export interface SystemStatusDefinition {
  code: string;
  name: string;
  colorToken: string;
  isAvailableForRental: boolean;
  sortOrder: number;
}

/**
 * Seeded automatically for every tenant (see AssetStatusesService). Only
 * AVAILABLE is available-for-rental by default — every other system status
 * represents an asset that is not currently rentable. Tenants may add their
 * own custom statuses alongside these; system statuses cannot be renamed
 * (code) or deleted.
 */
export const SYSTEM_STATUS_DEFINITIONS: readonly SystemStatusDefinition[] = [
  {
    code: "AVAILABLE",
    name: "Available",
    colorToken: "green",
    isAvailableForRental: true,
    sortOrder: 0,
  },
  {
    code: "RESERVED",
    name: "Reserved",
    colorToken: "blue",
    isAvailableForRental: false,
    sortOrder: 1,
  },
  {
    code: "RENTED",
    name: "Rented",
    colorToken: "purple",
    isAvailableForRental: false,
    sortOrder: 2,
  },
  {
    code: "INSPECTION_REQUIRED",
    name: "Inspection required",
    colorToken: "amber",
    isAvailableForRental: false,
    sortOrder: 3,
  },
  {
    code: "MAINTENANCE",
    name: "Maintenance",
    colorToken: "orange",
    isAvailableForRental: false,
    sortOrder: 4,
  },
  { code: "REPAIR", name: "Repair", colorToken: "red", isAvailableForRental: false, sortOrder: 5 },
  { code: "LOST", name: "Lost", colorToken: "gray", isAvailableForRental: false, sortOrder: 6 },
  {
    code: "RETIRED",
    name: "Retired",
    colorToken: "slate",
    isAvailableForRental: false,
    sortOrder: 7,
  },
];
