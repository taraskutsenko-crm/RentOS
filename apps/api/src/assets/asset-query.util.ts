import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { QueryAssetsDto } from "./dto/query-assets.dto";

/** Parses and loosely validates the JSON-encoded customFields query filter. */
export function parseCustomFieldsFilter(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException("customFields filter must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestException("customFields filter must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function buildAssetWhere(
  tenantId: string,
  query: QueryAssetsDto,
  customFieldFilterClauses: Prisma.AssetWhereInput[],
): Prisma.AssetWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.statusId ? { currentStatusId: query.statusId } : {}),
    ...(query.isRentable !== undefined ? { isRentable: query.isRentable } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.manufacturer
      ? { manufacturer: { contains: query.manufacturer, mode: "insensitive" } }
      : {}),
    ...(query.model ? { model: { contains: query.model, mode: "insensitive" } } : {}),
    ...(query.internalNumber
      ? { internalNumber: { contains: query.internalNumber, mode: "insensitive" } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { internalNumber: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
            { serialNumber: { contains: query.search, mode: "insensitive" } },
            { barcode: { contains: query.search, mode: "insensitive" } },
            { manufacturer: { contains: query.search, mode: "insensitive" } },
            { model: { contains: query.search, mode: "insensitive" } },
            {
              customFieldValues: {
                some: {
                  fieldDefinition: { isSearchable: true, deletedAt: null },
                  valueJson: { path: [], string_contains: query.search },
                },
              },
            },
          ],
        }
      : {}),
    ...(customFieldFilterClauses.length > 0 ? { AND: customFieldFilterClauses } : {}),
  };
}
