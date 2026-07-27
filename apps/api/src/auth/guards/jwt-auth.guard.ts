import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { toPublicUser } from "../../users/user.mapper";
import { UsersService } from "../../users/users.service";
import { ACCESS_TOKEN_COOKIE } from "../cookie.util";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { TokenService } from "../token.service";

/**
 * Registered globally (see AuthModule). Every route requires a valid access
 * token unless explicitly marked @Public(). Also re-checks the user's
 * active/deleted status on every request, not just at login.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    let userId: string;
    try {
      userId = this.tokenService.verifyAccessToken(token).sub;
    } catch {
      throw new UnauthorizedException("Invalid or expired session");
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException("Account is no longer active");
    }

    request.user = toPublicUser(user);
    return true;
  }
}
