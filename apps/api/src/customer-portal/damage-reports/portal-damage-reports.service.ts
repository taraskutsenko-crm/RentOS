import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, RentalDamageReport, RentalDamageReportPhoto } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { DocumentsService } from "../../documents/documents.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService, type UploadedFileLike } from "../../storage/storage.service";
import type { CreateDamageReportDto } from "../dto/create-damage-report.dto";
import type { ReviewDamageReportDto } from "../dto/review-damage-report.dto";
import { PortalNotificationsService } from "../notifications/portal-notifications.service";
import { PortalRentalsService } from "../rentals/portal-rentals.service";

const DAMAGE_REPORT_INCLUDE = { photos: true } satisfies Prisma.RentalDamageReportInclude;
export type DamageReportWithPhotos = Prisma.RentalDamageReportGetPayload<{
  include: typeof DAMAGE_REPORT_INCLUDE;
}>;

/**
 * Customer-submitted damage reports — deliberately its own lightweight
 * model rather than a Document row (see RentalDamageReport's schema doc
 * comment / docs/adr/0012-customer-portal.md for why). `convertToDocument`
 * is the one bridge back into the Document platform: it calls
 * DocumentsService.create() with the *staff* member as the author of
 * record, using the report's own description/photos as the starting
 * businessData — no document-creation logic is duplicated here.
 */
@Injectable()
export class PortalDamageReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly documentsService: DocumentsService,
    private readonly portalRentalsService: PortalRentalsService,
    private readonly notificationsService: PortalNotificationsService,
  ) {}

  async create(
    tenantId: string,
    customerId: string,
    rentalId: string,
    dto: CreateDamageReportDto,
  ): Promise<RentalDamageReport> {
    await this.portalRentalsService.findOne(tenantId, customerId, rentalId);

    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, tenantId } });
      if (!asset) {
        throw new BadRequestException("Asset does not belong to this tenant");
      }
    }

    const created = await this.prisma.rentalDamageReport.create({
      data: {
        tenantId,
        rentalId,
        customerId,
        assetId: dto.assetId ?? null,
        description: dto.description,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: null,
      action: "rental.damage_report_submitted",
      entityType: "Rental",
      entityId: rentalId,
      metadata: { customerId, damageReportId: created.id },
    });

    return created;
  }

  async uploadPhoto(
    tenantId: string,
    customerId: string,
    reportId: string,
    file: UploadedFileLike,
  ): Promise<RentalDamageReportPhoto> {
    const report = await this.findOneChecked(tenantId, customerId, reportId);
    this.storageService.validateImage(file);

    const storageKey = this.buildKey(tenantId, report.id, file.originalname);
    await this.storageService.store(storageKey, file);

    return this.prisma.rentalDamageReportPhoto.create({
      data: {
        tenantId,
        damageReportId: report.id,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async readPhoto(
    tenantId: string,
    customerId: string,
    reportId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    await this.findOneChecked(tenantId, customerId, reportId);
    return this.readPhotoUnchecked(tenantId, reportId, photoId);
  }

  async readPhotoForStaff(
    tenantId: string,
    reportId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    return this.readPhotoUnchecked(tenantId, reportId, photoId);
  }

  async findMany(
    tenantId: string,
    customerId: string,
    rentalId?: string,
  ): Promise<DamageReportWithPhotos[]> {
    return this.prisma.rentalDamageReport.findMany({
      where: { tenantId, customerId, ...(rentalId ? { rentalId } : {}) },
      include: DAMAGE_REPORT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(tenantId: string, customerId: string, id: string): Promise<DamageReportWithPhotos> {
    return this.findOneChecked(tenantId, customerId, id);
  }

  async findManyForStaff(tenantId: string, rentalId?: string): Promise<DamageReportWithPhotos[]> {
    return this.prisma.rentalDamageReport.findMany({
      where: { tenantId, ...(rentalId ? { rentalId } : {}) },
      include: { ...DAMAGE_REPORT_INCLUDE, customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async review(
    tenantId: string,
    reportId: string,
    actorUserId: string,
    dto: ReviewDamageReportDto,
  ): Promise<RentalDamageReport> {
    const report = await this.findByIdForStaff(tenantId, reportId);

    const updated = await this.prisma.rentalDamageReport.update({
      where: { id: report.id },
      data: { status: dto.status, reviewedAt: new Date(), reviewedByUserId: actorUserId },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "rental.damage_report_reviewed",
      entityType: "Rental",
      entityId: report.rentalId,
      metadata: { damageReportId: report.id, status: dto.status },
    });

    await this.notificationsService.create({
      tenantId,
      customerId: report.customerId,
      type: "DAMAGE_REPORT_UPDATE",
      title: "Damage report update",
      body: `Your damage report has been marked ${dto.status.toLowerCase()}.`,
      link: `/portal/rentals/${report.rentalId}`,
    });

    return updated;
  }

  /** Formalizes a submitted report into a real DAMAGE_REPORT Document, authored by the reviewing staff member. */
  async convertToDocument(
    tenantId: string,
    reportId: string,
    actorUserId: string,
  ): Promise<RentalDamageReport> {
    const report = await this.findByIdForStaff(tenantId, reportId, DAMAGE_REPORT_INCLUDE);
    if (report.status === "CONVERTED_TO_DOCUMENT") {
      throw new ConflictException("This report has already been converted to a document");
    }

    const document = await this.documentsService.create(tenantId, actorUserId, {
      documentType: "DAMAGE_REPORT",
      title: `Damage report — ${new Date(report.createdAt).toLocaleDateString()}`,
      customerId: report.customerId,
      rentalId: report.rentalId,
      ...(report.assetId ? { assetId: report.assetId } : {}),
      businessData: {
        description: report.description,
        photoCount: (report as DamageReportWithPhotos).photos?.length ?? 0,
        submittedAt: report.createdAt,
      },
    });

    const updated = await this.prisma.rentalDamageReport.update({
      where: { id: report.id },
      data: { status: "CONVERTED_TO_DOCUMENT", convertedDocumentId: document.id },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "rental.damage_report_converted",
      entityType: "Rental",
      entityId: report.rentalId,
      metadata: { damageReportId: report.id, documentId: document.id },
    });

    return updated;
  }

  private async findOneChecked(
    tenantId: string,
    customerId: string,
    id: string,
  ): Promise<DamageReportWithPhotos> {
    const report = await this.prisma.rentalDamageReport.findFirst({
      where: { id, tenantId, customerId },
      include: DAMAGE_REPORT_INCLUDE,
    });
    if (!report) {
      throw new NotFoundException("Damage report not found");
    }
    return report;
  }

  private async findByIdForStaff(
    tenantId: string,
    id: string,
    include?: Prisma.RentalDamageReportInclude,
  ): Promise<RentalDamageReport & { photos?: RentalDamageReportPhoto[] }> {
    const report = await this.prisma.rentalDamageReport.findFirst({
      where: { id, tenantId },
      ...(include ? { include } : {}),
    });
    if (!report) {
      throw new NotFoundException("Damage report not found");
    }
    return report;
  }

  private async readPhotoUnchecked(
    tenantId: string,
    reportId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const photo = await this.prisma.rentalDamageReportPhoto.findFirst({
      where: { id: photoId, tenantId, damageReportId: reportId },
    });
    if (!photo) {
      throw new NotFoundException("Photo not found");
    }
    const buffer = await this.storageService.read(photo.storageKey);
    return { buffer, mimeType: photo.mimeType, fileName: photo.originalFileName };
  }

  private buildKey(tenantId: string, damageReportId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
    return `tenants/${tenantId}/damage-reports/${damageReportId}/photos/${randomUUID()}-${safeName}`;
  }
}
