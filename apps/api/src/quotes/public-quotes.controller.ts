import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { Public } from "../auth/decorators/public.decorator";
import { PublicAcceptQuoteDto } from "./dto/public-accept-quote.dto";
import { PublicRejectQuoteDto } from "./dto/public-reject-quote.dto";
import { QuotesService } from "./quotes.service";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

/**
 * Unauthenticated, token-based access for the customer-facing quote page.
 * Deliberately outside /tenants/:tenantId/... — there is no session and no
 * tenant membership here, only a high-entropy token that resolves directly
 * to the one Quote it was issued for (see QuotesService.loadByToken and
 * ADR 0007's public-token security section). Every route is marked
 * @Public() (exempting it from the global JwtAuthGuard) and throttled more
 * tightly than the platform default to limit token-guessing/scraping.
 */
@Public()
@Controller("public/quotes")
export class PublicQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(":token")
  findByToken(@Param("token") token: string, @Req() req: Request) {
    const { ipAddress, userAgent } = requestMeta(req);
    return this.quotesService.findByPublicToken(token, ipAddress, userAgent);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":token/accept")
  accept(@Param("token") token: string, @Body() dto: PublicAcceptQuoteDto, @Req() req: Request) {
    const { ipAddress, userAgent } = requestMeta(req);
    return this.quotesService.publicAccept(token, dto, ipAddress, userAgent);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":token/reject")
  reject(@Param("token") token: string, @Body() dto: PublicRejectQuoteDto, @Req() req: Request) {
    const { ipAddress, userAgent } = requestMeta(req);
    return this.quotesService.publicReject(token, dto, ipAddress, userAgent);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(":token/pdf")
  async getPdf(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const { buffer, fileName } = await this.quotesService.getPublicPdf(token);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type("application/pdf").send(buffer);
  }
}
