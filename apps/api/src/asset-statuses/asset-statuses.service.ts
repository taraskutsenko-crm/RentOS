import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AssetStatusDefinition, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAssetStatusDto } from "./dto/create-asset-status.dto";
import type { UpdateAssetStatusDto } from "./dto/update-asset-status.dto";
import { SYSTEM_STATUS_DEFINITIONS } from "./system-statuses";

@Injectable()
export class AssetStatusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Idempotently creates any of the eight system statuses missing for this
   * tenant. Called both when a tenant is created (AuthService.register, in
   * the same transaction) and at API startup for every existing tenant
   * (AssetStatusesModule.onModuleInit) — the latter covers tenants created
   * before this module existed, satisfying "seeded on tenant creation or
   * when the Assets module is first initialized" for both cases.
   */
  async seedSystemStatuses(
    tenantId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await client.assetStatusDefinition.createMany({
      data: SYSTEM_STATUS_DEFINITIONS.map((status) => ({
        tenantId,
        name: status.name,
        code: status.code,
        colorToken: status.colorToken,
        isAvailableForRental: status.isAvailableForRental,
        sortOrder: status.sortOrder,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  findMany(tenantId: string): Promise<AssetStatusDefinition[]> {
    return this.prisma.assetStatusDefinition.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findOne(tenantId: string, id: string): Promise<AssetStatusDefinition> {
    const status = await this.prisma.assetStatusDefinition.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!status) {
      throw new NotFoundException("Asset status not found");
    }
    return status;
  }

  findByCode(tenantId: string, code: string): Promise<AssetStatusDefinition | null> {
    return this.prisma.assetStatusDefinition.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
  }

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateAssetStatusDto,
  ): Promise<AssetStatusDefinition> {
    const existing = await this.findByCode(tenantId, dto.code);
    if (existing) {
      throw new ConflictException(`A status with code "${dto.code}" already exists`);
    }

    const status = await this.prisma.assetStatusDefinition.create({
      data: { ...dto, tenantId, isSystem: false },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_status.created",
      entityType: "AssetStatusDefinition",
      entityId: status.id,
      metadata: { code: status.code },
    });

    return status;
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateAssetStatusDto,
  ): Promise<AssetStatusDefinition> {
    const current = await this.findOne(tenantId, id);

    if (current.isSystem && dto.code && dto.code !== current.code) {
      throw new ForbiddenException("System status codes cannot be renamed");
    }

    if (dto.code && dto.code !== current.code) {
      const existing = await this.findByCode(tenantId, dto.code);
      if (existing) {
        throw new ConflictException(`A status with code "${dto.code}" already exists`);
      }
    }

    const status = await this.prisma.assetStatusDefinition.update({
      where: { id: current.id },
      data: dto,
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_status.updated",
      entityType: "AssetStatusDefinition",
      entityId: status.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return status;
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const current = await this.findOne(tenantId, id);

    if (current.isSystem) {
      throw new ForbiddenException("System statuses cannot be deleted");
    }

    const inUse = await this.prisma.asset.count({
      where: { tenantId, currentStatusId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new ConflictException("This status is currently used by one or more assets");
    }

    await this.prisma.assetStatusDefinition.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "asset_status.deleted",
      entityType: "AssetStatusDefinition",
      entityId: id,
    });
  }
}
