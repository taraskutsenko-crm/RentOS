import type { ApiEnv } from "@rentos/shared";
import type { ConfigService } from "@nestjs/config";
import type { CookieOptions } from "express";

/**
 * Mirrors auth/cookie.util.ts's naming/scoping exactly, with distinct names
 * so a customer-portal session can never collide with a staff session in
 * the same browser (e.g. a staff member previewing their own tenant's
 * portal in another tab). No tenant-hint cookie exists here — unlike a
 * staff User who may belong to several tenants, a Customer row is
 * inherently single-tenant, so there is nothing to hint at.
 */
export const PORTAL_ACCESS_TOKEN_COOKIE = "rentos_portal_access_token";
export const PORTAL_REFRESH_TOKEN_COOKIE = "rentos_portal_refresh_token";

type ApiConfigService = ConfigService<ApiEnv, true>;

function baseCookieOptions(configService: ApiConfigService): CookieOptions {
  const nodeEnv = configService.get("NODE_ENV", { infer: true });
  const domain = configService.get("COOKIE_DOMAIN", { infer: true });
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    domain: domain || undefined,
  };
}

export function portalAccessTokenCookieOptions(configService: ApiConfigService): CookieOptions {
  const ttlSeconds = configService.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true });
  return {
    ...baseCookieOptions(configService),
    path: "/",
    maxAge: ttlSeconds * 1000,
  };
}

/** Path-scoped to /portal/auth, same rationale as the staff refresh token cookie. */
export function portalRefreshTokenCookieOptions(configService: ApiConfigService): CookieOptions {
  const ttlDays = configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
  return {
    ...baseCookieOptions(configService),
    path: "/portal/auth",
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}
