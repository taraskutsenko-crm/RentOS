import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import * as QRCode from "qrcode";

import { AssetFilesService } from "../../asset-files/asset-files.service";
import { AssetsService } from "../../assets/assets.service";
import { PrismaService } from "../../prisma/prisma.service";
import { toPortalAssetView, type PortalAssetView } from "./portal-asset.types";

/**
 * Read-only equipment info + photos + a QR code deep-link, scoped to
 * assets the customer actually has (or has had) on a rental — never a
 * tenant's full asset catalog. Ownership is checked via RentalItem, the
 * same join AvailabilityService already relies on as the source of truth
 * for "which assets does this rental involve."
 */
@Injectable()
export class PortalAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
    private readonly assetFilesService: AssetFilesService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  async findOne(tenantId: string, customerId: string, assetId: string): Promise<PortalAssetView> {
    await this.assertOwnership(tenantId, customerId, assetId);
    const asset = await this.assetsService.findOne(tenantId, assetId);
    return toPortalAssetView(asset);
  }

  async readImage(
    tenantId: string,
    customerId: string,
    assetId: string,
    imageId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    await this.assertOwnership(tenantId, customerId, assetId);
    return this.assetFilesService.readImage(tenantId, assetId, imageId);
  }

  /** A scannable PNG linking to the rental's portal page — "scan to view your rental." */
  async rentalQrCode(tenantId: string, customerId: string, rentalId: string): Promise<Buffer> {
    const rental = await this.prisma.rental.findFirst({
      where: { id: rentalId, tenantId, customerId, deletedAt: null },
    });
    if (!rental) {
      throw new NotFoundException("Rental not found");
    }
    const webOrigin = this.configService.get("WEB_ORIGIN", { infer: true });
    const url = `${webOrigin}/portal/rentals/${rentalId}`;
    return QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 320 });
  }

  private async assertOwnership(
    tenantId: string,
    customerId: string,
    assetId: string,
  ): Promise<void> {
    const claim = await this.prisma.rentalItem.findFirst({
      where: { tenantId, assetId, rental: { tenantId, customerId, deletedAt: null } },
    });
    if (!claim) {
      throw new NotFoundException("Asset not found");
    }
  }
}
