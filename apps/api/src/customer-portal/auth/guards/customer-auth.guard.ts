import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { PrismaService } from "../../../prisma/prisma.service";
import { toPublicCustomer } from "../../common/public-customer.mapper";
import { CustomerTokenService } from "../customer-token.service";
import { PORTAL_ACCESS_TOKEN_COOKIE } from "../portal-cookie.util";

/**
 * The customer-portal equivalent of JwtAuthGuard — deliberately NOT
 * registered as a global APP_GUARD (see auth/auth.module.ts's comment on
 * why JwtAuthGuard is). Every /portal/** controller is instead marked
 * @Public() (to exempt it from the staff JwtAuthGuard entirely) and
 * separately decorated with @UseGuards(CustomerAuthGuard), the same
 * "@Public() + a controller-local guard" shape PublicQuotesController/
 * PublicDocumentsController already use for token-based access — except
 * here the credential is a portal session cookie, not a one-off token.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly customerTokenService: CustomerTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[PORTAL_ACCESS_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedException("Portal authentication required");
    }

    let customerId: string;
    let tenantId: string;
    try {
      const payload = this.customerTokenService.verifyAccessToken(token);
      customerId = payload.sub;
      tenantId = payload.tenantId;
    } catch {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer || customer.status !== "ACTIVE" || !customer.portalActivatedAt) {
      throw new UnauthorizedException("Portal account is no longer active");
    }

    request.portalCustomer = toPublicCustomer(customer);
    return true;
  }
}
