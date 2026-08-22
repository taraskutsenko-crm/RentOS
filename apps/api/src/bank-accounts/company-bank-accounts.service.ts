import { Injectable, NotFoundException } from "@nestjs/common";
import type { CompanyBankAccount } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCompanyBankAccountDto } from "./dto/create-company-bank-account.dto";
import type { UpdateCompanyBankAccountDto } from "./dto/update-company-bank-account.dto";

/**
 * A tenant's structured bank accounts (see docs/DECISIONS.md — "not one
 * giant free-text field"). `isDefault` enforcement mirrors
 * AssetFilesService's isPrimary-image pattern exactly: at most one default
 * per tenant, enforced transactionally here, never at the DB level (having
 * no default yet is a valid state).
 */
@Injectable()
export class CompanyBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(tenantId: string, includeInactive: boolean): Promise<CompanyBankAccount[]> {
    return this.prisma.companyBankAccount.findMany({
      where: { tenantId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async findOne(tenantId: string, id: string): Promise<CompanyBankAccount> {
    const account = await this.prisma.companyBankAccount.findFirst({
      where: { tenantId, id, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException("Bank account not found");
    }
    return account;
  }

  /** The tenant's default active bank account, if any — used to prefill new Invoices. */
  async findDefault(tenantId: string): Promise<CompanyBankAccount | null> {
    return this.prisma.companyBankAccount.findFirst({
      where: { tenantId, deletedAt: null, isActive: true, isDefault: true },
    });
  }

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateCompanyBankAccountDto,
  ): Promise<CompanyBankAccount> {
    const existingCount = await this.prisma.companyBankAccount.count({
      where: { tenantId, deletedAt: null },
    });
    const isDefault = existingCount === 0 ? true : (dto.isDefault ?? false);

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const created = await tx.companyBankAccount.create({
        data: {
          tenantId,
          label: dto.label,
          bankName: dto.bankName ?? null,
          accountHolder: dto.accountHolder ?? null,
          accountNumber: dto.accountNumber ?? null,
          iban: dto.iban ?? null,
          swiftBic: dto.swiftBic ?? null,
          currency: dto.currency,
          bankAddress: dto.bankAddress ?? null,
          paymentReference: dto.paymentReference ?? null,
          isDefault,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "company_bank_account.created",
          entityType: "CompanyBankAccount",
          entityId: created.id,
          metadata: { label: created.label, currency: created.currency },
        },
        tx,
      );

      return created;
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateCompanyBankAccountDto,
  ): Promise<CompanyBankAccount> {
    await this.findOne(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.companyBankAccount.updateMany({
          where: { tenantId, isDefault: true, deletedAt: null, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.companyBankAccount.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
          ...(dto.accountHolder !== undefined ? { accountHolder: dto.accountHolder } : {}),
          ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber } : {}),
          ...(dto.iban !== undefined ? { iban: dto.iban } : {}),
          ...(dto.swiftBic !== undefined ? { swiftBic: dto.swiftBic } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.bankAddress !== undefined ? { bankAddress: dto.bankAddress } : {}),
          ...(dto.paymentReference !== undefined ? { paymentReference: dto.paymentReference } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "company_bank_account.updated",
          entityType: "CompanyBankAccount",
          entityId: updated.id,
          metadata: { label: updated.label },
        },
        tx,
      );

      return updated;
    });
  }

  /** Soft-deactivates — a bank account already snapshotted onto issued Invoices is never hard-deleted. */
  async deactivate(tenantId: string, id: string, actorUserId: string): Promise<CompanyBankAccount> {
    const current = await this.findOne(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyBankAccount.update({
        where: { id: current.id },
        data: { isActive: false, isDefault: false },
      });

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "company_bank_account.deactivated",
          entityType: "CompanyBankAccount",
          entityId: updated.id,
          metadata: { label: updated.label },
        },
        tx,
      );

      return updated;
    });
  }
}
