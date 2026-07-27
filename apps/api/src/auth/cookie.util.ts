import type { ApiEnv } from "@rentos/shared";
import type { ConfigService } from "@nestjs/config";
import type { CookieOptions } from "express";

export const ACCESS_TOKEN_COOKIE = "rentos_access_token";
export const REFRESH_TOKEN_COOKIE = "rentos_refresh_token";
export const TENANT_COOKIE = "rentos_tenant_id";

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

/** Sent on every request — readable by the API on any route. */
export function accessTokenCookieOptions(configService: ApiConfigService): CookieOptions {
  const ttlSeconds = configService.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true });
  return {
    ...baseCookieOptions(configService),
    path: "/",
    maxAge: ttlSeconds * 1000,
  };
}

/**
 * Path-scoped to /auth so the refresh token is never sent on ordinary API
 * requests — only to the endpoints that need it (refresh, logout).
 */
export function refreshTokenCookieOptions(configService: ApiConfigService): CookieOptions {
  const ttlDays = configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
  return {
    ...baseCookieOptions(configService),
    path: "/auth",
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * The active-tenant hint. Never trusted on its own — every tenant-scoped
 * request re-verifies active membership server-side (see TenantGuard).
 */
export function tenantCookieOptions(configService: ApiConfigService): CookieOptions {
  return {
    ...baseCookieOptions(configService),
    path: "/",
  };
}
