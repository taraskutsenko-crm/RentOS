import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DocumentShareLink } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { PasswordService } from "../../auth/password.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DocumentsService } from "../documents.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";
import type { CreateShareLinkDto } from "../dto/create-share-link.dto";
import { generateDocumentShareToken, hashDocumentShareToken } from "./document-share-token.util";

const DEFAULT_EXPIRY_DAYS = 30;

export interface CreatedShareLink {
  shareLink: DocumentShareLink;
  /** The opaque, plain-text token — only ever returned here, never persisted (see document-share-token.util.ts). */
  token: string;
}

export interface ResolvedShareLink {
  shareLink: DocumentShareLink;
  document: DocumentDetailView;
  version: DocumentVersionWithFiles;
}

/**
 * Public, unauthenticated document links — "Part 4: Public Sharing" (see
 * docs/adr/0011-document-rendering-and-sharing.md). Mirrors Quotes'
 * publicTokenHash convention (an opaque random token, only its SHA-256
 * hash ever persisted) but as its own table, not a column on Document,
 * since a document accumulates a *history* of links (old ones disabled,
 * never overwritten) and each one needs its own view/download counters —
 * see DocumentShareLink's schema doc comment.
 */
@Injectable()
export class DocumentSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Creates a new share link for a document's *current* version, and
   * disables any previously-active link for the same document — "at most
   * one active link per document" (see DocumentShareLink's schema doc
   * comment). "Regenerate" is just calling this again.
   */
  async create(
    tenantId: string,
    documentId: string,
    actorUserId: string,
    dto: CreateShareLinkDto,
  ): Promise<CreatedShareLink> {
    const document = await this.documentsService.findOneRaw(tenantId, documentId);
    const version = document.versions.find(
      (v) => v.versionNumber === document.currentVersionNumber,
    )!;

    const { token, tokenHash } = generateDocumentShareToken();
    const expiresAt = new Date(
      Date.now() + (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000,
    );
    const passwordHash = dto.password ? await this.passwordService.hash(dto.password) : null;

    const shareLink = await this.prisma.$transaction(async (tx) => {
      await tx.documentShareLink.updateMany({
        where: { tenantId, documentVersion: { documentId }, disabledAt: null },
        data: { disabledAt: new Date() },
      });

      const created = await tx.documentShareLink.create({
        data: {
          tenantId,
          documentVersionId: version.id,
          tokenHash,
          passwordHash,
          expiresAt,
          createdByUserId: actorUserId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "document.shared",
          entityType: "Document",
          entityId: documentId,
          metadata: {
            shareLinkId: created.id,
            expiresAt: expiresAt.toISOString(),
            hasPassword: !!passwordHash,
          },
        },
        tx,
      );

      return created;
    });

    return { shareLink, token };
  }

  async findMany(tenantId: string, documentId: string): Promise<DocumentShareLink[]> {
    return this.prisma.documentShareLink.findMany({
      where: { tenantId, documentVersion: { documentId } },
      orderBy: { createdAt: "desc" },
    });
  }

  async disable(
    tenantId: string,
    documentId: string,
    shareLinkId: string,
    actorUserId: string,
  ): Promise<void> {
    const result = await this.prisma.documentShareLink.updateMany({
      where: { id: shareLinkId, tenantId, documentVersion: { documentId }, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Active share link not found");
    }
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "document.share_disabled",
      entityType: "Document",
      entityId: documentId,
      metadata: { shareLinkId },
    });
  }

  // ---------------------------------------------------------------------
  // Public (token-authenticated, unauthenticated) access
  // ---------------------------------------------------------------------

  /**
   * Resolves a token to its document — throws 404 for an unknown, expired,
   * or disabled link (never distinguishing which, so an attacker can't use
   * the error to probe for valid-but-expired tokens), and 403 if a
   * password is required but wasn't supplied or didn't match.
   */
  async resolveToken(token: string, password: string | undefined): Promise<ResolvedShareLink> {
    const tokenHash = hashDocumentShareToken(token);
    const shareLink = await this.prisma.documentShareLink.findFirst({
      where: { tokenHash, disabledAt: null, expiresAt: { gt: new Date() } },
    });
    if (!shareLink) {
      throw new NotFoundException("This link is invalid or has expired");
    }

    if (shareLink.passwordHash) {
      const matches = password
        ? await this.passwordService.verify(shareLink.passwordHash, password)
        : false;
      if (!matches) {
        throw new ForbiddenException("A valid password is required to open this link");
      }
    }

    const version = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: shareLink.documentVersionId },
      select: { documentId: true, tenantId: true },
    });
    const document = await this.documentsService.findOneRaw(version.tenantId, version.documentId);
    const resolvedVersion = document.versions.find((v) => v.id === shareLink.documentVersionId)!;

    return { shareLink, document, version: resolvedVersion };
  }

  async recordView(
    resolved: ResolvedShareLink,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const { tenantId } = resolved.shareLink;
    await this.prisma.documentShareLink.update({
      where: { id: resolved.shareLink.id },
      data: {
        viewCount: { increment: 1 },
        lastAccessedAt: new Date(),
        lastAccessedIp: ipAddress,
      },
    });
    await this.auditService.log({
      tenantId,
      userId: null,
      action: "document.share_viewed",
      entityType: "Document",
      entityId: resolved.document.id,
      metadata: { shareLinkId: resolved.shareLink.id, ipAddress, userAgent },
      ipAddress,
      userAgent,
    });
    await this.documentsService.recordPublicView(tenantId, resolved.document.id);
  }

  async recordDownload(
    resolved: ResolvedShareLink,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const { tenantId } = resolved.shareLink;
    await this.prisma.documentShareLink.update({
      where: { id: resolved.shareLink.id },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
        lastAccessedIp: ipAddress,
      },
    });
    await this.auditService.log({
      tenantId,
      userId: null,
      action: "document.share_downloaded",
      entityType: "Document",
      entityId: resolved.document.id,
      metadata: { shareLinkId: resolved.shareLink.id, ipAddress, userAgent },
      ipAddress,
      userAgent,
    });
  }
}
