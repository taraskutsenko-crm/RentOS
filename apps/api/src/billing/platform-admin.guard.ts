import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

/**
 * Havelio PLATFORM administration (Stage 17) — gates every cross-tenant
 * platform-admin surface (all subscriptions, affiliate partners/campaigns/
 * commissions, global revenue). Checks `User.isPlatformAdmin` — a distinct,
 * explicit column re-read from the database on every request (via
 * JwtAuthGuard, which always populates `request.user` fresh — see
 * jwt-auth.guard.ts), never inferred from a tenant `MembershipRole` (OWNER/
 * ADMIN of a tenant is NOT a platform admin) and never an email allowlist.
 * Apply this ALONGSIDE JwtAuthGuard's normal authentication (already global
 * — see AuthModule), never in place of it.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException("Platform administration access required");
    }
    return true;
  }
}
