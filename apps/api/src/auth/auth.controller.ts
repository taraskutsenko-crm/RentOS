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
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { ApiEnv } from "@rentos/shared";
import type { Request, Response } from "express";

import type { PublicUser } from "../users/user.mapper";
import { AuthService } from "./auth.service";
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
  TENANT_COOKIE,
  tenantCookieOptions,
} from "./cookie.util";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, requestMeta(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.tenant.id);
    return { user: result.user, tenant: result.tenant };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, requestMeta(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!presented) {
      throw new UnauthorizedException("No refresh token provided");
    }

    const result = await this.authService.refresh(presented, requestMeta(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.tenantId ?? undefined);
    return { ok: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.logout(presented, user.id);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: PublicUser): { user: PublicUser } {
    return { user };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    tenantId?: string,
  ): void {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions(this.configService));
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshTokenCookieOptions(this.configService));
    if (tenantId) {
      res.cookie(TENANT_COOKIE, tenantId, tenantCookieOptions(this.configService));
    }
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/auth" });
    res.clearCookie(TENANT_COOKIE, { path: "/" });
  }
}
