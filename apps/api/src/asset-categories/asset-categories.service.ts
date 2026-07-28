import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AssetCategory, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAssetCategoryDto } from "./dto/create-asset-category.dto";
import type { QueryAssetCategoriesDto } from "./dto/query-asset-categories.dto";
import type { UpdateAssetCategoryDto } from "./dto/update-asset-category.dto";

export interface AssetCategoryTreeNode extends AssetCategory {
  children: AssetCategoryTreeNode[];
}

@Injectable()
export class AssetCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateAssetCategoryDto,
  ): Promise<AssetCategory> {
    const parentId = dto.parentId ?? null;

    if (parentId) {
      await this.assertParentBelongsToTenant(tenantId, parentId);
    }

    await this.assertNameUnique(tenantId, parentId, dto.name);

    const category = await this.prisma.assetCategory.create({
      data: { ...dto, parentId, tenantId },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_category.created",
      entityType: "AssetCategory",
      entityId: category.id,
    });

    return category;
  }

  async findMany(
    tenantId: string,
    query: QueryAssetCategoriesDto,
  ): Promise<PaginatedResult<AssetCategory>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AssetCategoryWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.assetCategory.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assetCategory.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async tree(tenantId: string): Promise<AssetCategoryTreeNode[]> {
    const categories = await this.prisma.assetCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const nodesById = new Map<string, AssetCategoryTreeNode>(
      categories.map((category) => [category.id, { ...category, children: [] }]),
    );
    const roots: AssetCategoryTreeNode[] = [];

    for (const category of categories) {
      const node = nodesById.get(category.id)!;
      if (category.parentId && nodesById.has(category.parentId)) {
        nodesById.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findOne(tenantId: string, id: string): Promise<AssetCategory> {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException("Asset category not found");
    }
    return category;
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateAssetCategoryDto,
  ): Promise<AssetCategory> {
    const current = await this.findOne(tenantId, id);

    const nextParentId = dto.parentId === undefined ? current.parentId : dto.parentId;

    if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException("A category cannot be its own parent");
      }
      if (dto.parentId) {
        await this.assertParentBelongsToTenant(tenantId, dto.parentId);
        await this.assertNoCycle(tenantId, id, dto.parentId);
      }
    }

    const nextName = dto.name ?? current.name;
    if (dto.name !== undefined || dto.parentId !== undefined) {
      await this.assertNameUnique(tenantId, nextParentId, nextName, id);
    }

    const category = await this.prisma.assetCategory.update({
      where: { id: current.id },
      data: dto,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_category.updated",
      entityType: "AssetCategory",
      entityId: category.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return category;
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    await this.findOne(tenantId, id);

    const [activeAssets, activeChildren] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId, categoryId: id, deletedAt: null } }),
      this.prisma.assetCategory.count({ where: { tenantId, parentId: id, deletedAt: null } }),
    ]);

    if (activeAssets > 0) {
      throw new ConflictException("This category is referenced by one or more active assets");
    }
    if (activeChildren > 0) {
      throw new ConflictException("This category has active subcategories");
    }

    await this.prisma.assetCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_category.deleted",
      entityType: "AssetCategory",
      entityId: id,
    });
  }

  private async assertParentBelongsToTenant(tenantId: string, parentId: string): Promise<void> {
    const parent = await this.prisma.assetCategory.findFirst({
      where: { id: parentId, tenantId, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundException("Parent category not found");
    }
  }

  /** Walks up from candidateParentId; rejects if `id` appears in that chain. */
  private async assertNoCycle(
    tenantId: string,
    id: string,
    candidateParentId: string,
  ): Promise<void> {
    let cursor: string | null = candidateParentId;
    const visited = new Set<string>();

    while (cursor) {
      if (cursor === id) {
        throw new ConflictException("This change would create a circular category relationship");
      }
      if (visited.has(cursor)) {
        break; // pre-existing cycle guard, shouldn't happen but avoids infinite loop
      }
      visited.add(cursor);

      const parent: { parentId: string | null } | null = await this.prisma.assetCategory.findFirst({
        where: { id: cursor, tenantId },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  private async assertNameUnique(
    tenantId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.assetCategory.findFirst({
      where: {
        tenantId,
        parentId,
        name: { equals: name, mode: "insensitive" },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(`A category named "${name}" already exists at this level`);
    }
  }
}
