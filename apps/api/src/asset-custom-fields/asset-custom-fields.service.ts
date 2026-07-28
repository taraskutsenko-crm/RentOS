import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AssetCustomFieldDefinition, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAssetCustomFieldDto } from "./dto/create-asset-custom-field.dto";
import type { QueryAssetCustomFieldsDto } from "./dto/query-asset-custom-fields.dto";
import type { UpdateAssetCustomFieldDto } from "./dto/update-asset-custom-field.dto";
import { assertOptionsShape, assertValidationRulesShape } from "./field-definition-rules";

@Injectable()
export class AssetCustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateAssetCustomFieldDto,
  ): Promise<AssetCustomFieldDefinition> {
    const categoryId = dto.categoryId ?? null;

    if (categoryId) {
      await this.assertCategoryBelongsToTenant(tenantId, categoryId);
    }

    assertValidationRulesShape(dto.fieldType, dto.validationRules);
    assertOptionsShape(dto.fieldType, dto.options);
    await this.assertKeyUnique(tenantId, categoryId, dto.key);

    const definition = await this.prisma.assetCustomFieldDefinition.create({
      data: {
        ...dto,
        categoryId,
        tenantId,
        validationRules: dto.validationRules as never,
        options: dto.options as never,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_custom_field.created",
      entityType: "AssetCustomFieldDefinition",
      entityId: definition.id,
      metadata: { key: definition.key, fieldType: definition.fieldType },
    });

    return definition;
  }

  async findMany(
    tenantId: string,
    query: QueryAssetCustomFieldsDto,
  ): Promise<PaginatedResult<AssetCustomFieldDefinition>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AssetCustomFieldDefinitionWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.fieldType ? { fieldType: query.fieldType } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.assetCustomFieldDefinition.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assetCustomFieldDefinition.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Every field that applies to an asset in this category: global (categoryId = null) + category-specific. */
  async forCategory(tenantId: string, categoryId: string): Promise<AssetCustomFieldDefinition[]> {
    await this.assertCategoryBelongsToTenant(tenantId, categoryId);

    return this.prisma.assetCustomFieldDefinition.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [{ categoryId }, { categoryId: null }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async findOne(tenantId: string, id: string): Promise<AssetCustomFieldDefinition> {
    const definition = await this.prisma.assetCustomFieldDefinition.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!definition) {
      throw new NotFoundException("Custom field definition not found");
    }
    return definition;
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateAssetCustomFieldDto,
  ): Promise<AssetCustomFieldDefinition> {
    const current = await this.findOne(tenantId, id);
    const nextFieldType = dto.fieldType ?? current.fieldType;
    const nextCategoryId = dto.categoryId === undefined ? current.categoryId : dto.categoryId;
    const nextKey = dto.key ?? current.key;

    if (dto.fieldType && dto.fieldType !== current.fieldType) {
      const valueCount = await this.prisma.assetCustomFieldValue.count({
        where: { fieldDefinitionId: id },
      });
      if (valueCount > 0) {
        throw new ConflictException(
          `Cannot change field type: ${valueCount} existing asset value(s) reference this field. Remove them first.`,
        );
      }
    }

    if (dto.validationRules !== undefined) {
      assertValidationRulesShape(nextFieldType, dto.validationRules);
    }
    if (dto.options !== undefined) {
      assertOptionsShape(nextFieldType, dto.options);
    }

    if (nextCategoryId) {
      await this.assertCategoryBelongsToTenant(tenantId, nextCategoryId);
    }

    if (dto.key !== undefined || dto.categoryId !== undefined) {
      await this.assertKeyUnique(tenantId, nextCategoryId, nextKey, id);
    }

    const definition = await this.prisma.assetCustomFieldDefinition.update({
      where: { id: current.id },
      data: dto as unknown as Prisma.AssetCustomFieldDefinitionUncheckedUpdateInput,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_custom_field.updated",
      entityType: "AssetCustomFieldDefinition",
      entityId: definition.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return definition;
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    await this.findOne(tenantId, id);

    await this.prisma.assetCustomFieldDefinition.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_custom_field.deleted",
      entityType: "AssetCustomFieldDefinition",
      entityId: id,
    });
  }

  private async assertCategoryBelongsToTenant(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException("Category not found");
    }
  }

  private async assertKeyUnique(
    tenantId: string,
    categoryId: string | null,
    key: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.assetCustomFieldDefinition.findFirst({
      where: {
        tenantId,
        categoryId,
        key,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(`A field with key "${key}" already exists in this scope`);
    }
  }
}
