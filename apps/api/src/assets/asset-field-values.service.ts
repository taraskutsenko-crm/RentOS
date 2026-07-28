import { BadRequestException, Injectable } from "@nestjs/common";
import type { AssetCustomFieldDefinition, Asset } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { validateFieldValue } from "../asset-custom-fields/field-value-validator";

export interface ResolvedCustomFieldValue {
  fieldDefinitionId: string;
  key: string;
  valueJson: unknown;
}

export type AssetWithCustomFields<T extends Asset = Asset> = T & {
  customFields: Record<string, unknown>;
};

/**
 * Shared logic between AssetsService.create/update for resolving,
 * validating, and persisting AssetCustomFieldValue rows keyed by the
 * asset's category (global + category-specific definitions).
 */
@Injectable()
export class AssetFieldValuesService {
  constructor(private readonly prisma: PrismaService) {}

  getApplicableDefinitions(
    tenantId: string,
    categoryId: string,
  ): Promise<AssetCustomFieldDefinition[]> {
    return this.prisma.assetCustomFieldDefinition.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [{ categoryId }, { categoryId: null }],
      },
    });
  }

  async getExistingValuesByKey(assetId: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.assetCustomFieldValue.findMany({
      where: { assetId },
      include: { fieldDefinition: true },
    });
    const byKey: Record<string, unknown> = {};
    for (const row of rows) {
      byKey[row.fieldDefinition.key] = row.valueJson;
    }
    return byKey;
  }

  /**
   * Validates `input` (keyed by definition.key) against the applicable
   * definitions, merges it over `existingByKey` to compute the effective
   * value set, and enforces that every required definition ends up with a
   * value. Returns the individually-validated rows to upsert (only for keys
   * present in `input` — unchanged existing values are left alone).
   */
  resolve(
    definitions: AssetCustomFieldDefinition[],
    input: Record<string, unknown> | undefined,
    existingByKey: Record<string, unknown>,
  ): ResolvedCustomFieldValue[] {
    const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const toUpsert: ResolvedCustomFieldValue[] = [];

    for (const [key, rawValue] of Object.entries(input ?? {})) {
      const definition = definitionsByKey.get(key);
      if (!definition) {
        throw new BadRequestException(`Unknown custom field: ${key}`);
      }
      const valueJson = validateFieldValue(definition, rawValue);
      toUpsert.push({ fieldDefinitionId: definition.id, key, valueJson });
    }

    const effectiveByKey: Record<string, unknown> = { ...existingByKey };
    for (const resolved of toUpsert) {
      effectiveByKey[resolved.key] = resolved.valueJson;
    }

    const missingRequired = definitions
      .filter((definition) => definition.isRequired)
      .filter((definition) => effectiveByKey[definition.key] === undefined)
      .map((definition) => definition.key);

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing required custom field(s): ${missingRequired.join(", ")}`,
      );
    }

    return toUpsert;
  }

  async persist(
    assetId: string,
    tenantId: string,
    resolved: ResolvedCustomFieldValue[],
  ): Promise<void> {
    for (const value of resolved) {
      await this.prisma.assetCustomFieldValue.upsert({
        where: {
          assetId_fieldDefinitionId: { assetId, fieldDefinitionId: value.fieldDefinitionId },
        },
        create: {
          assetId,
          tenantId,
          fieldDefinitionId: value.fieldDefinitionId,
          valueJson: value.valueJson as never,
        },
        update: { valueJson: value.valueJson as never },
      });
    }
  }

  attach<T extends Asset>(
    asset: T,
    valuesByKey: Record<string, unknown>,
  ): AssetWithCustomFields<T> {
    return { ...asset, customFields: valuesByKey };
  }
}
