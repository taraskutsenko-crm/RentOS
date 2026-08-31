import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { ApiEnv } from "@rentos/shared";
import type { Request, Response } from "express";

import { Public } from "../../auth/decorators/public.decorator";
import type { PublicCustomer } from "../common/public-customer.mapper";
import { ActivatePortalInvitationDto } from "../dto/activate-portal-invitation.dto";
import { PortalLoginDto } from "../dto/portal-login.dto";
import { CurrentCustomer } from "./decorators/current-customer.decorator";
import { CustomerAuthGuard } from "./guards/customer-auth.guard";
import {
  PORTAL_ACCESS_TOKEN_COOKIE,
  portalAccessTokenCookieOptions,
  PORTAL_REFRESH_TOKEN_COOKIE,
  portalRefreshTokenCookieOptions,
} from "./portal-cookie.util";
import { PortalAuthService, type PortalSessionResult } from "./portal-auth.service";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

@Public()
@Controller("portal/auth")
export class PortalAuthController {
  constructor(
    private readonly portalAuthService: PortalAuthService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: PortalLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.portalAuthService.login(
      dto.tenantSlug,
      dto.email,
      dto.password,
      requestMeta(req),
    );
    this.setSessionCookies(res, result);
    return {
      customer: result.customer,
      tenant: { id: result.tenant.id, name: result.tenant.name, timezone: result.tenant.timezone },
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("activate-invitation")
  async activateInvitation(
    @Body() dto: ActivatePortalInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.portalAuthService.activateInvitation(
      dto.token,
      dto.password,
      requestMeta(req),
    );
    this.setSessionCookies(res, result);
    return {
      customer: result.customer,
      tenant: { id: result.tenant.id, name: result.tenant.name, timezone: result.tenant.timezone },
    };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[PORTAL_REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!presented) {
      throw new UnauthorizedException("No session to refresh");
    }
    const result = await this.portalAuthService.refresh(presented, requestMeta(req));
    res.cookie(
      PORTAL_ACCESS_TOKEN_COOKIE,
      result.accessToken,
      portalAccessTokenCookieOptions(this.configService),
    );
    res.cookie(
      PORTAL_REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      portalRefreshTokenCookieOptions(this.configService),
    );
    return { ok: true };
  }

  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @CurrentCustomer() customer: PublicCustomer,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[PORTAL_REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.portalAuthService.logout(presented, customer.id);
    res.clearCookie(PORTAL_ACCESS_TOKEN_COOKIE, { path: "/" });
    res.clearCookie(PORTAL_REFRESH_TOKEN_COOKIE, { path: "/portal/auth" });
    return { ok: true };
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me")
  async me(@CurrentCustomer() customer: PublicCustomer) {
    const session = await this.portalAuthService.getSession(customer);
    return {
      customer: session.customer,
      tenant: {
        id: session.tenant.id,
        name: session.tenant.name,
        timezone: session.tenant.timezone,
      },
    };
  }

  private setSessionCookies(res: Response, result: PortalSessionResult): void {
    res.cookie(
      PORTAL_ACCESS_TOKEN_COOKIE,
      result.accessToken,
      portalAccessTokenCookieOptions(this.configService),
    );
    res.cookie(
      PORTAL_REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      portalRefreshTokenCookieOptions(this.configService),
    );
  }
}
