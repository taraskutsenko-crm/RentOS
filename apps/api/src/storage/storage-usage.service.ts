import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

export interface StorageUsageBreakdown {
  count: number;
  bytes: number;
}

export interface StorageUsageView {
  assetImages: StorageUsageBreakdown;
  assetDocuments: StorageUsageBreakdown;
  documentFiles: StorageUsageBreakdown;
  quoteDocuments: StorageUsageBreakdown;
  total: StorageUsageBreakdown;
}

/**
 * Reads only persisted metadata (sizeBytes on each of the four independent
 * attachment/rendering shapes — see DECISIONS.md's "no single canonical
 * Attachment model" note) — never lists or scans the actual object-storage
 * bucket. A tenant's storage footprint can be computed cheaply on every
 * request precisely because every upload already writes its size into
 * Postgres at write time (AssetFilesService/DocumentFilesService/
 * QuotePdfService) — this service adds no new write path, only a read
 * aggregation over data that already exists. Foundation for a future
 * billing/quota feature (not built here — see the production-infrastructure
 * pass's explicit scope boundary).
 */
@Injectable()
export class StorageUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(tenantId: string): Promise<StorageUsageView> {
    const [assetImages, assetDocuments, documentFiles, quoteDocuments] = await Promise.all([
      this.prisma.assetImage.aggregate({
        where: { tenantId, deletedAt: null },
        _count: true,
        _sum: { sizeBytes: true },
      }),
      this.prisma.assetDocument.aggregate({
        where: { tenantId, deletedAt: null },
        _count: true,
        _sum: { sizeBytes: true },
      }),
      this.prisma.documentFile.aggregate({
        where: { tenantId, deletedAt: null },
        _count: true,
        _sum: { sizeBytes: true },
      }),
      this.prisma.quoteDocument.aggregate({
        where: { tenantId, deletedAt: null },
        _count: true,
        _sum: { sizeBytes: true },
      }),
    ]);

    const breakdown = (result: { _count: number; _sum: { sizeBytes: number | null } }) => ({
      count: result._count,
      bytes: result._sum.sizeBytes ?? 0,
    });

    const assetImagesView = breakdown(assetImages);
    const assetDocumentsView = breakdown(assetDocuments);
    const documentFilesView = breakdown(documentFiles);
    const quoteDocumentsView = breakdown(quoteDocuments);

    return {
      assetImages: assetImagesView,
      assetDocuments: assetDocumentsView,
      documentFiles: documentFilesView,
      quoteDocuments: quoteDocumentsView,
      total: {
        count:
          assetImagesView.count +
          assetDocumentsView.count +
          documentFilesView.count +
          quoteDocumentsView.count,
        bytes:
          assetImagesView.bytes +
          assetDocumentsView.bytes +
          documentFilesView.bytes +
          quoteDocumentsView.bytes,
      },
    };
  }
}
