import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_TOKEN_COOKIE = "rentos_access_token";

/**
 * Lightweight, cookie-presence-only redirect for UX (avoids flashing
 * protected content before a client-side check lands). This is NOT the
 * security boundary — every API request independently re-verifies the
 * token and tenant membership server-side (see apps/api JwtAuthGuard /
 * TenantGuard). Never trust this proxy alone.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(ACCESS_TOKEN_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
