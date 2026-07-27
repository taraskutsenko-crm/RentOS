import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { normalizeEmail } from "./email.util";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Must be called within a transaction that also creates the tenant + OWNER membership. */
  create(
    tx: Prisma.TransactionClient,
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
      preferredLanguage: string;
    },
  ): Promise<User> {
    return tx.user.create({
      data: { ...data, email: normalizeEmail(data.email) },
    });
  }
}
