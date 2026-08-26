import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AvailabilityService } from "../rentals/availability.service";
import type { CancelAvailabilityBlockDto } from "./dto/cancel-availability-block.dto";
import type { CreateAvailabilityBlockDto } from "./dto/create-availability-block.dto";

/**
 * Authoring side of the availability engine: creating/listing/cancelling
 * AssetAvailabilityBlock rows. Reading "is this asset available" is always
 * AvailabilityService's job (this service never duplicates overlap math —
 * it delegates the actual conflict check to
 * AvailabilityService.findOverlappingBlocks). See ADR 0006 and
 * docs/DECISIONS.md for the "one canonical resolver" requirement.
 */
@Injectable()
export class AssetAvailabilityBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly auditService: AuditService,
  ) {}

  async findForAsset(tenantId: string, assetId: string) {
    await this.assertAssetExists(tenantId, assetId);
    return this.prisma.assetAvailabilityBlock.findMany({
      where: { tenantId, assetId },
      orderBy: { startAt: "desc" },
    });
  }

  async create(
    tenantId: string,
    assetId: string,
    actorUserId: string,
    dto: CreateAvailabilityBlockDto,
  ) {
    await this.assertAssetExists(tenantId, assetId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException("endAt must be after startAt");
    }

    const overlapping = await this.availabilityService.findOverlappingBlocks(
      tenantId,
      assetId,
      startAt,
      endAt,
    );
    if (overlapping.length > 0) {
      throw new ConflictException(
        "This asset already has an overlapping availability block for part of the selected period",
      );
    }

    if (dto.relatedRentalId) {
      const rental = await this.prisma.rental.findFirst({
        where: { id: dto.relatedRentalId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!rental) {
        throw new NotFoundException("Related rental not found");
      }
    }

    const block = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assetAvailabilityBlock.create({
        data: {
          tenantId,
          assetId,
          type: dto.type,
          startAt,
          endAt,
          notes: dto.notes ?? null,
          relatedRentalId: dto.relatedRentalId ?? null,
          createdByUserId: actorUserId,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset_availability_block.created",
          entityType: "AssetAvailabilityBlock",
          entityId: created.id,
          metadata: { assetId, type: dto.type, startAt: dto.startAt, endAt: dto.endAt },
        },
        tx,
      );
      return created;
    });

    return block;
  }

  async cancel(
    tenantId: string,
    assetId: string,
    blockId: string,
    actorUserId: string,
    dto: CancelAvailabilityBlockDto,
  ) {
    const existing = await this.prisma.assetAvailabilityBlock.findFirst({
      where: { id: blockId, tenantId, assetId },
    });
    if (!existing) {
      throw new NotFoundException("Availability block not found");
    }
    if (existing.cancelledAt) {
      throw new ConflictException("This availability block is already cancelled");
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.assetAvailabilityBlock.update({
        where: { id: blockId },
        data: {
          cancelledAt: new Date(),
          cancelledByUserId: actorUserId,
          cancelReason: dto.reason ?? null,
        },
      });
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "asset_availability_block.cancelled",
          entityType: "AssetAvailabilityBlock",
          entityId: blockId,
          metadata: { assetId, reason: dto.reason ?? null },
        },
        tx,
      );
      return cancelled;
    });
  }

  private async assertAssetExists(tenantId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException("Asset not found");
    }
  }
}
