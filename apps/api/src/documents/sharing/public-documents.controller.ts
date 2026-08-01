import { Body, Controller, Param, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import { PublicShareAccessDto } from "../dto/public-share-access.dto";
import { DocumentPdfService } from "../rendering/document-pdf.service";
import { DocumentRendererService } from "../rendering/document-renderer.service";
import { DocumentSharingService } from "./document-sharing.service";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

/**
 * Unauthenticated, token-based public document access ("Part 4: Public
 * Sharing") — deliberately outside /tenants/:tenantId/..., mirrors
 * PublicQuotesController's shape exactly (see its own doc comment): no
 * session, no tenant membership, only a high-entropy token. Both routes
 * are POST (not GET, unlike Quotes) because a share link may be
 * password-protected — the password has to travel in a body, never a
 * query string, so there is no unprotected GET variant here at all.
 */
@Public()
@Controller("public/documents")
export class PublicDocumentsController {
  constructor(
    private readonly sharingService: DocumentSharingService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly pdfService: DocumentPdfService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":token/view")
  async view(
    @Param("token") token: string,
    @Body() dto: PublicShareAccessDto,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = requestMeta(req);
    const resolved = await this.sharingService.resolveToken(token, dto.password);
    await this.sharingService.recordView(resolved, ipAddress, userAgent);
    const { html } = await this.documentRenderer.renderHtml(
      resolved.shareLink.tenantId,
      resolved.document,
      resolved.version,
    );
    return {
      documentNumber: resolved.document.documentNumber,
      documentType: resolved.document.documentType,
      title: resolved.document.title,
      status: resolved.document.status,
      html,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":token/pdf")
  async downloadPdf(
    @Param("token") token: string,
    @Body() dto: PublicShareAccessDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { ipAddress, userAgent } = requestMeta(req);
    const resolved = await this.sharingService.resolveToken(token, dto.password);
    await this.sharingService.recordDownload(resolved, ipAddress, userAgent);
    const { buffer, file } = await this.pdfService.getOrGenerate(
      resolved.shareLink.tenantId,
      resolved.document,
      resolved.version,
    );
    res.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    res.type("application/pdf").send(buffer);
  }
}
