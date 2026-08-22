import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  Asset,
  MonthlyBillingStrategy,
  PartialMonthPolicy,
  Prisma,
  QuoteItem,
  QuoteStatus,
} from "@prisma/client";
import type { ApiEnv } from "@rentos/shared";

import { AuditService } from "../audit/audit.service";
import type { PaginatedResult } from "../customers/customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { RentalBillingSettingsService } from "../rental-billing-settings/rental-billing-settings.service";
import type { EffectiveRentalBillingSettings } from "../rental-billing-settings/rental-billing-settings.types";
import { AvailabilityService } from "../rentals/availability.service";
import { generateRentalNumber } from "../rentals/rental-numbering.util";
import type { AcceptQuoteDto } from "./dto/accept-quote.dto";
import type { CreateQuoteDto } from "./dto/create-quote.dto";
import type { PublicAcceptQuoteDto } from "./dto/public-accept-quote.dto";
import type { PublicRejectQuoteDto } from "./dto/public-reject-quote.dto";
import type { QueryQuotesDto } from "./dto/query-quotes.dto";
import type { QuoteItemDto } from "./dto/quote-item.dto";
import type { SendQuoteDto } from "./dto/send-quote.dto";
import type { StatusActionDto } from "./dto/status-action.dto";
import type { UpdateQuoteDto } from "./dto/update-quote.dto";
import { EmailService } from "../email/email.service";
import { generateQuoteNumber } from "./quote-numbering.util";
import {
  computeQuoteTotals,
  type PricedQuoteItemInput,
  type QuoteItemPricingResult,
} from "./quote-pricing.util";
import { QuotePdfService } from "./quote-pdf.service";
import { generatePublicQuoteToken, hashPublicQuoteToken } from "./quote-public-token.util";
import {
  QUOTE_DETAIL_INCLUDE,
  type PublicQuoteView,
  type QuoteAvailabilityWarning,
  type QuoteDetailResponse,
  type QuoteDetailView,
  type QuoteListItemView,
} from "./quote.types";
import type { QuoteTimelineEvent, QuoteTimelineEventType } from "./timeline.types";

/**
 * A QuoteItemDto (client input) whose MONTHLY-only billing-strategy
 * snapshot fields have already been resolved — either freshly stamped from
 * the tenant's current RentalBillingSettings (new/replaced items) or
 * carried over unchanged from an already-persisted QuoteItem (unedited
 * items on a partial update, or a duplicated item). Never accepted
 * directly from a client — mirrors RentalItemSource in rentals.service.ts.
 * See docs/adr/0008-configurable-monthly-billing-strategies.md.
 */
type QuoteItemSource = Omit<QuoteItemDto, "partialMonthPolicy"> & {
  monthlyBillingStrategy?: MonthlyBillingStrategy | null;
  customMonthLengthDays?: number | null;
  partialMonthPolicy?: PartialMonthPolicy | null;
};

/** Items and dates are editable only while DRAFT — mirrors Rentals' EDITABLE_STATUSES intent. */
const DRAFT_ONLY: QuoteStatus[] = ["DRAFT"];
const DELETABLE_STATUSES: QuoteStatus[] = ["DRAFT", "CANCELLED"];
const TERMINAL_STATUSES: QuoteStatus[] = [
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
];

/**
 * DRAFT -> SENT -> VIEWED -> ACCEPTED -> CONVERTED, with REJECTED/EXPIRED
 * reachable from SENT/VIEWED and CANCELLED reachable from DRAFT/SENT. See
 * docs/adr/0007-quotes-and-commercial-offers.md.
 */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["CONVERTED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
  CANCELLED: [],
};

const AUDIT_ACTION_TO_TIMELINE_TYPE: Record<string, QuoteTimelineEventType> = {
  "quote.updated": "updated",
  "quote.sent": "sent",
  "quote.viewed": "viewed",
  "quote.accepted": "accepted",
  "quote.rejected": "rejected",
  "quote.duplicated": "duplicated",
  "quote.converted": "converted",
  "quote.pdf_generated": "pdf_generated",
};

export interface SendQuoteResult {
  quote: QuoteDetailResponse;
  emailSent: boolean;
  emailError?: string;
}

export interface ConvertQuoteResult {
  rental: Prisma.RentalGetPayload<{
    include: { customer: true; items: { include: { asset: true } } };
  }>;
  alreadyConverted: boolean;
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly availabilityService: AvailabilityService,
    private readonly emailService: EmailService,
    private readonly pdfService: QuotePdfService,
    private readonly configService: ConfigService<ApiEnv, true>,
    private readonly rentalBillingSettingsService: RentalBillingSettingsService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteDetailResponse> {
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const validUntil = new Date(dto.validUntil);
    const plannedStart = new Date(dto.plannedStart);
    const plannedEnd = new Date(dto.plannedEnd);
    this.assertDateOrder(plannedStart, plannedEnd);
    this.assertValidityOrder(issueDate, validUntil);

    await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);

    const currency = dto.currency ?? (await this.resolveTenant(tenantId)).defaultCurrency;
    const items = dto.items ?? [];
    await this.assertItemsValid(tenantId, items);

    const billingSettings = await this.resolveBillingSettingsIfNeeded(tenantId, items);
    const pricedItems = withMonthlyBillingSettings(items, billingSettings);

    const totals = computeQuoteTotals(
      pricedItems.map(toPricedItemInput),
      plannedStart,
      plannedEnd,
      dto.discountType ?? null,
      dto.discountValue ?? 0,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const quoteNumber = await generateQuoteNumber(tx, tenantId, issueDate);

      const quote = await tx.quote.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          quoteNumber,
          status: "DRAFT",
          issueDate,
          validUntil,
          plannedStart,
          plannedEnd,
          currency,
          subtotalMinor: totals.subtotalMinor,
          discountType: dto.discountType ?? null,
          discountValue: dto.discountValue ?? 0,
          discountTotalMinor: totals.discountTotalMinor,
          taxTotalMinor: totals.taxTotalMinor,
          depositTotalMinor: totals.depositTotalMinor,
          totalMinor: totals.totalMinor,
          customerNotes: dto.customerNotes ?? null,
          internalNotes: dto.internalNotes ?? null,
          termsAndConditions: dto.termsAndConditions ?? null,
          createdByUserId: actorUserId,
        },
      });

      for (let i = 0; i < pricedItems.length; i += 1) {
        await tx.quoteItem.create({
          data: toQuoteItemCreateData(tenantId, quote.id, pricedItems[i]!, totals.items[i]!),
        });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.created",
          entityType: "Quote",
          entityId: quote.id,
          metadata: { quoteNumber: quote.quoteNumber, itemCount: items.length },
        },
        tx,
      );

      return quote;
    });

    return this.findOne(tenantId, created.id);
  }

  async findMany(
    tenantId: string,
    query: QueryQuotesDto,
  ): Promise<PaginatedResult<QuoteListItemView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    let statusFilter: Prisma.QuoteWhereInput["status"] = query.status;
    let validUntilFilter: Prisma.QuoteWhereInput["validUntil"];
    if (query.converted !== undefined) {
      statusFilter = query.converted ? "CONVERTED" : { not: "CONVERTED" };
    }
    if (query.expired) {
      statusFilter = { in: ["SENT", "VIEWED"] };
      validUntilFilter = { lt: new Date() };
    }
    if (query.validUntilFrom || query.validUntilTo) {
      validUntilFilter = {
        ...(typeof validUntilFilter === "object" ? validUntilFilter : {}),
        ...(query.validUntilFrom ? { gte: new Date(query.validUntilFrom) } : {}),
        ...(query.validUntilTo ? { lte: new Date(query.validUntilTo) } : {}),
      };
    }

    const where: Prisma.QuoteWhereInput = {
      tenantId,
      deletedAt: null,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(validUntilFilter ? { validUntil: validUntilFilter } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.createdByUserId ? { createdByUserId: query.createdByUserId } : {}),
      ...(query.issueDateFrom || query.issueDateTo
        ? {
            issueDate: {
              ...(query.issueDateFrom ? { gte: new Date(query.issueDateFrom) } : {}),
              ...(query.issueDateTo ? { lte: new Date(query.issueDateTo) } : {}),
            },
          }
        : {}),
      ...(query.plannedStartFrom || query.plannedStartTo
        ? {
            plannedStart: {
              ...(query.plannedStartFrom ? { gte: new Date(query.plannedStartFrom) } : {}),
              ...(query.plannedStartTo ? { lte: new Date(query.plannedStartTo) } : {}),
            },
          }
        : {}),
      ...(query.totalMinorFrom !== undefined || query.totalMinorTo !== undefined
        ? {
            totalMinor: {
              ...(query.totalMinorFrom !== undefined ? { gte: query.totalMinorFrom } : {}),
              ...(query.totalMinorTo !== undefined ? { lte: query.totalMinorTo } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { quoteNumber: { contains: query.search, mode: "insensitive" } },
              { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
              { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
              { customer: { company: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: { customer: true, _count: { select: { items: true } } },
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortDirection ?? "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return {
      items: items.map(({ _count, publicTokenHash: _publicTokenHash, ...quote }) => ({
        ...quote,
        itemCount: _count.items,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tenantId: string, id: string): Promise<QuoteDetailResponse> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);
    const availabilityWarnings = await this.computeAvailabilityWarnings(
      tenantId,
      current.items,
      current.plannedStart,
      current.plannedEnd,
    );
    // publicTokenHash is an internal security artifact, not customer- or
    // even staff-facing data — never return it, even to an authenticated,
    // permissioned request (see ADR 0007's public-token security section).
    const { publicTokenHash: _publicTokenHash, ...safeQuote } = current;
    return { ...safeQuote, availabilityWarnings };
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: UpdateQuoteDto,
  ): Promise<QuoteDetailResponse> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    const commercialFieldsTouched =
      dto.customerId !== undefined ||
      dto.plannedStart !== undefined ||
      dto.plannedEnd !== undefined ||
      dto.currency !== undefined ||
      dto.discountType !== undefined ||
      dto.discountValue !== undefined ||
      dto.items !== undefined;
    if (commercialFieldsTouched && !DRAFT_ONLY.includes(current.status)) {
      throw new ConflictException(
        "Commercial fields (customer, dates, currency, discount, items) can only be edited while the quote is a draft — duplicate it instead",
      );
    }
    if (dto.validUntil !== undefined && TERMINAL_STATUSES.includes(current.status)) {
      throw new ConflictException(
        "validUntil cannot be changed once the quote is in a terminal status",
      );
    }

    const plannedStart = dto.plannedStart ? new Date(dto.plannedStart) : current.plannedStart;
    const plannedEnd = dto.plannedEnd ? new Date(dto.plannedEnd) : current.plannedEnd;
    this.assertDateOrder(plannedStart, plannedEnd);

    const validUntil = dto.validUntil ? new Date(dto.validUntil) : current.validUntil;
    this.assertValidityOrder(current.issueDate, validUntil);

    if (dto.customerId && dto.customerId !== current.customerId) {
      await this.assertCustomerBelongsToTenant(tenantId, dto.customerId);
    }

    const items = dto.items ?? current.items.map(fromExistingItem);
    if (dto.items !== undefined) {
      await this.assertItemsValid(tenantId, items);
    }

    // Only a full item replacement re-reads the tenant's *current* billing
    // settings — an edit that leaves items untouched (e.g. just notes or
    // discount) must keep each item's already-frozen strategy, never pick
    // up a tenant-wide settings change made after the quote was created
    // (see ADR 0008). `fromExistingItem` below already carries that frozen
    // snapshot forward for the untouched-items case.
    const billingSettings =
      dto.items !== undefined
        ? await this.resolveBillingSettingsIfNeeded(tenantId, dto.items)
        : null;
    const pricedItems: QuoteItemSource[] =
      dto.items !== undefined ? withMonthlyBillingSettings(dto.items, billingSettings) : items;

    const discountType = dto.discountType !== undefined ? dto.discountType : current.discountType;
    const discountValue =
      dto.discountValue !== undefined ? dto.discountValue : current.discountValue;

    const totals = computeQuoteTotals(
      pricedItems.map(toPricedItemInput),
      plannedStart,
      plannedEnd,
      discountType,
      discountValue,
    );

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          ...(dto.customerId ? { customerId: dto.customerId } : {}),
          ...(dto.plannedStart ? { plannedStart } : {}),
          ...(dto.plannedEnd ? { plannedEnd } : {}),
          ...(dto.validUntil ? { validUntil } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
          discountType: discountType ?? null,
          discountValue: discountValue ?? 0,
          subtotalMinor: totals.subtotalMinor,
          discountTotalMinor: totals.discountTotalMinor,
          taxTotalMinor: totals.taxTotalMinor,
          depositTotalMinor: totals.depositTotalMinor,
          totalMinor: totals.totalMinor,
          ...(dto.customerNotes !== undefined ? { customerNotes: dto.customerNotes } : {}),
          ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {}),
          ...(dto.termsAndConditions !== undefined
            ? { termsAndConditions: dto.termsAndConditions }
            : {}),
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Quote not found");
      }

      if (dto.items !== undefined) {
        await tx.quoteItem.deleteMany({ where: { quoteId: id, tenantId } });
        for (let i = 0; i < pricedItems.length; i += 1) {
          await tx.quoteItem.create({
            data: toQuoteItemCreateData(tenantId, id, pricedItems[i]!, totals.items[i]!),
          });
        }
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.updated",
          entityType: "Quote",
          entityId: id,
          metadata: { changedFields: Object.keys(dto) },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const current = await this.findOneRaw(tenantId, id);
    if (!DELETABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `Cannot delete a quote in ${current.status} status — cancel it first if it must be removed`,
      );
    }

    const result = await this.prisma.quote.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Quote not found");
    }

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "quote.deleted",
      entityType: "Quote",
      entityId: id,
    });
  }

  /**
   * Transitions DRAFT -> SENT on first send; a subsequent send while
   * SENT/VIEWED is a resend (no status change, fresh token, email
   * re-dispatched). The email is sent only after the status-change
   * transaction has committed (see EmailService's doc comment) — a failed
   * send is recorded via audit log and reported honestly in the response,
   * never silently swallowed.
   */
  async send(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: SendQuoteDto,
  ): Promise<SendQuoteResult> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    if (!["DRAFT", "SENT", "VIEWED"].includes(current.status)) {
      throw new ConflictException(`Cannot send a quote in ${current.status} status`);
    }
    if (current.items.length === 0) {
      throw new BadRequestException("Cannot send a quote with no items");
    }
    const recipientEmail = dto.recipientEmail ?? current.customer.email;
    if (!recipientEmail) {
      throw new BadRequestException(
        "Customer has no email on file — provide recipientEmail explicitly",
      );
    }

    const isFirstSend = current.status === "DRAFT";
    if (isFirstSend) {
      this.assertTransition(current.status, "SENT");
    }

    const { token, tokenHash } = generatePublicQuoteToken();

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          ...(isFirstSend ? { status: "SENT" } : {}),
          publicTokenHash: tokenHash,
          publicTokenExpiresAt: current.validUntil,
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException("Quote not found");
      }
      if (isFirstSend) {
        await this.writeStatusHistory(tx, tenantId, id, actorUserId, current.status, "SENT", null);
      }
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.sent",
          entityType: "Quote",
          entityId: id,
          metadata: { recipientEmail, resend: !isFirstSend },
        },
        tx,
      );
    });

    const updated = await this.findOneRaw(tenantId, id);
    const pdf = await this.pdfService.generateAndStore(tenantId, updated, actorUserId);
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "quote.pdf_generated",
      entityType: "Quote",
      entityId: id,
      metadata: { documentId: pdf.document.id, reason: "send" },
    });

    const tenant = await this.resolveTenant(tenantId);
    const publicUrl = `${this.configService.get("WEB_ORIGIN", { infer: true })}/quote/${token}`;
    const emailResult = await this.emailService.send({
      to: recipientEmail,
      subject: `Quote ${updated.quoteNumber} from ${tenant.name}`,
      html: buildSendEmailHtml(updated, tenant.name, publicUrl, dto.message),
      attachments: [
        {
          filename: pdf.document.originalFileName,
          content: pdf.buffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (!emailResult.success) {
      await this.auditService.log({
        tenantId,
        userId: actorUserId,
        action: "quote.send_email_failed",
        entityType: "Quote",
        entityId: id,
        metadata: { recipientEmail, error: emailResult.error },
      });
    }

    const quote = await this.findOne(tenantId, id);
    return {
      quote,
      emailSent: emailResult.success,
      ...(emailResult.error ? { emailError: emailResult.error } : {}),
    };
  }

  /** Staff-recorded acceptance (e.g. the customer approved verbally or by email). Idempotent. */
  async accept(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: AcceptQuoteDto,
  ): Promise<QuoteDetailResponse> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    if (current.status === "ACCEPTED") {
      return this.findOne(tenantId, id);
    }
    if (current.status !== "SENT" && current.status !== "VIEWED") {
      throw new ConflictException(`Cannot accept a quote in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id, tenantId, status: current.status },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedBy: dto.acceptedBy ?? null,
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException("Quote status changed concurrently — please retry");
      }
      await this.writeStatusHistory(
        tx,
        tenantId,
        id,
        actorUserId,
        current.status,
        "ACCEPTED",
        "Accepted by staff",
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.accepted",
          entityType: "Quote",
          entityId: id,
          metadata: { via: "staff", acceptedBy: dto.acceptedBy ?? null },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /** Staff-recorded rejection. Idempotent. */
  async reject(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<QuoteDetailResponse> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    if (current.status === "REJECTED") {
      return this.findOne(tenantId, id);
    }
    if (current.status !== "SENT" && current.status !== "VIEWED") {
      throw new ConflictException(`Cannot reject a quote in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id, tenantId, status: current.status },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: dto.reason ?? null,
          updatedByUserId: actorUserId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException("Quote status changed concurrently — please retry");
      }
      await this.writeStatusHistory(
        tx,
        tenantId,
        id,
        actorUserId,
        current.status,
        "REJECTED",
        dto.reason ?? "Rejected by staff",
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.rejected",
          entityType: "Quote",
          entityId: id,
          metadata: { via: "staff", reason: dto.reason ?? null },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /** Idempotent. Only DRAFT/SENT quotes may be cancelled. */
  async cancel(
    tenantId: string,
    id: string,
    actorUserId: string,
    dto: StatusActionDto,
  ): Promise<QuoteDetailResponse> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    if (current.status === "CANCELLED") {
      return this.findOne(tenantId, id);
    }
    if (current.status !== "DRAFT" && current.status !== "SENT") {
      throw new ConflictException(`Cannot cancel a quote in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id, tenantId, status: current.status },
        data: { status: "CANCELLED", updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new ConflictException("Quote status changed concurrently — please retry");
      }
      await this.writeStatusHistory(
        tx,
        tenantId,
        id,
        actorUserId,
        current.status,
        "CANCELLED",
        dto.reason ?? null,
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.status_changed",
          entityType: "Quote",
          entityId: id,
          metadata: { from: current.status, to: "CANCELLED" },
        },
        tx,
      );
    });

    return this.findOne(tenantId, id);
  }

  /**
   * Creates a fresh DRAFT copy: new number, cleared acceptance/rejection/
   * conversion metadata, items and commercial terms carried over verbatim,
   * totals recomputed under current rules. See ADR 0007 — this is the
   * chosen alternative to a full revision-chain system.
   */
  async duplicate(tenantId: string, id: string, actorUserId: string): Promise<QuoteDetailResponse> {
    const source = await this.findOneRaw(tenantId, id);

    const issueDate = new Date();
    const validityMs = Math.max(
      24 * 60 * 60 * 1000,
      source.validUntil.getTime() - source.issueDate.getTime(),
    );
    const validUntil = new Date(issueDate.getTime() + validityMs);

    const pricedItems = source.items.map(toPricedItemInputFromExisting);
    const totals = computeQuoteTotals(
      pricedItems,
      source.plannedStart,
      source.plannedEnd,
      source.discountType,
      source.discountValue,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const quoteNumber = await generateQuoteNumber(tx, tenantId, issueDate);

      const quote = await tx.quote.create({
        data: {
          tenantId,
          customerId: source.customerId,
          quoteNumber,
          status: "DRAFT",
          issueDate,
          validUntil,
          plannedStart: source.plannedStart,
          plannedEnd: source.plannedEnd,
          currency: source.currency,
          subtotalMinor: totals.subtotalMinor,
          discountType: source.discountType,
          discountValue: source.discountValue,
          discountTotalMinor: totals.discountTotalMinor,
          taxTotalMinor: totals.taxTotalMinor,
          depositTotalMinor: totals.depositTotalMinor,
          totalMinor: totals.totalMinor,
          customerNotes: source.customerNotes,
          internalNotes: source.internalNotes,
          termsAndConditions: source.termsAndConditions,
          duplicatedFromQuoteId: source.id,
          createdByUserId: actorUserId,
        },
      });

      for (let i = 0; i < source.items.length; i += 1) {
        const item = source.items[i]!;
        const pricing = totals.items[i]!;
        await tx.quoteItem.create({
          data: {
            tenantId,
            quoteId: quote.id,
            itemType: item.itemType,
            assetId: item.assetId,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            billingMode: item.billingMode,
            unitPriceMinor: item.unitPriceMinor,
            dailyPriceMinor: item.dailyPriceMinor,
            weeklyPriceMinor: item.weeklyPriceMinor,
            monthlyPriceMinor: item.monthlyPriceMinor,
            customPriceMinor: item.customPriceMinor,
            // Carried over verbatim, never re-resolved from the tenant's
            // current settings — duplication is a faithful copy in a fresh
            // DRAFT shell, not a re-quote (see ADR 0007's duplication
            // section and ADR 0008's note on this decision).
            monthlyBillingStrategy: item.monthlyBillingStrategy,
            customMonthLengthDays: item.customMonthLengthDays,
            partialMonthPolicy: item.partialMonthPolicy,
            discountType: item.discountType,
            discountValue: item.discountValue,
            discountTotalMinor: pricing.discountTotalMinor,
            taxRateBp: item.taxRateBp,
            taxTotalMinor: pricing.taxTotalMinor,
            depositMinor: item.depositMinor,
            lineSubtotalMinor: pricing.lineSubtotalMinor,
            lineTotalMinor: pricing.lineTotalMinor,
            sortOrder: item.sortOrder,
            notes: item.notes,
          },
        });
      }

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.duplicated",
          entityType: "Quote",
          entityId: quote.id,
          metadata: { sourceQuoteId: source.id, sourceQuoteNumber: source.quoteNumber },
        },
        tx,
      );

      return quote;
    });

    return this.findOne(tenantId, created.id);
  }

  async history(tenantId: string, id: string): Promise<QuoteTimelineEvent[]> {
    const quote = await this.findOneRaw(tenantId, id);

    const [logs, statusHistory] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          entityType: "Quote",
          entityId: id,
          action: { in: Object.keys(AUDIT_ACTION_TO_TIMELINE_TYPE) },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.quoteStatusHistory.findMany({
        where: { tenantId, quoteId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const events: QuoteTimelineEvent[] = [
      {
        id: `created-${quote.id}`,
        type: "created",
        occurredAt: quote.createdAt.toISOString(),
        actorUserId: quote.createdByUserId,
        data: { quoteNumber: quote.quoteNumber, customerId: quote.customerId },
      },
      ...logs.map((log) => ({
        id: log.id,
        type: AUDIT_ACTION_TO_TIMELINE_TYPE[log.action]!,
        occurredAt: log.createdAt.toISOString(),
        actorUserId: log.userId,
        data: (log.metadata as Record<string, unknown> | null) ?? {},
      })),
      ...statusHistory.map((entry) => ({
        id: entry.id,
        type: "status_changed" as const,
        occurredAt: entry.createdAt.toISOString(),
        actorUserId: entry.changedByUserId,
        data: { fromStatus: entry.fromStatus, toStatus: entry.toStatus, reason: entry.reason },
      })),
    ];

    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async getPdf(tenantId: string, id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const quote = await this.findOneRaw(tenantId, id);
    const existing = await this.pdfService.getLatestDocument(tenantId, id);
    if (existing) {
      return { buffer: existing.buffer, fileName: existing.document.originalFileName };
    }
    const generated = await this.pdfService.generateAndStore(tenantId, quote, null);
    return { buffer: generated.buffer, fileName: generated.document.originalFileName };
  }

  async regeneratePdf(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const quote = await this.findOneRaw(tenantId, id);
    const generated = await this.pdfService.generateAndStore(tenantId, quote, actorUserId);
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "quote.pdf_generated",
      entityType: "Quote",
      entityId: id,
      metadata: { documentId: generated.document.id, reason: "manual" },
    });
    return { buffer: generated.buffer, fileName: generated.document.originalFileName };
  }

  /**
   * Converts an ACCEPTED quote into a real Rental inside one transaction:
   * revalidates tenant/customer/asset ownership and availability, then
   * creates the Rental (RESERVED) with RentalItem rows for ASSET-type
   * QuoteItems only — non-asset lines stay on the immutable source Quote
   * (see ADR 0007). The Rental's totals are copied verbatim from the
   * Quote's own authoritative totals, not recomputed from just the asset
   * items, so they always match what the customer actually accepted.
   * Idempotent: calling this again on an already-CONVERTED quote returns
   * the same Rental rather than erroring or creating a duplicate.
   */
  async convertToRental(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<ConvertQuoteResult> {
    const raw = await this.findOneRaw(tenantId, id);
    const current = await this.applyExpiryIfDue(tenantId, raw);

    if (current.status === "CONVERTED") {
      const existingRental = await this.prisma.rental.findFirst({
        where: { sourceQuoteId: id, tenantId },
        include: { customer: true, items: { include: { asset: true } } },
      });
      if (!existingRental) {
        throw new ConflictException(
          "Quote is marked CONVERTED but its linked rental could not be found",
        );
      }
      return { rental: existingRental, alreadyConverted: true };
    }

    if (current.status !== "ACCEPTED") {
      throw new ConflictException(
        `Only an ACCEPTED quote can be converted to a rental (current status: ${current.status})`,
      );
    }

    const assetItems = current.items.filter((item) => item.itemType === "ASSET");
    if (assetItems.length === 0) {
      throw new BadRequestException("Cannot convert a quote with no asset items to a rental");
    }

    const assetIds = assetItems.map((item) => item.assetId!);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds }, tenantId, deletedAt: null },
    });
    this.assertAssetsStillRentable(assetIds, assets);

    await this.assertCustomerBelongsToTenant(tenantId, current.customerId);

    await this.availabilityService.assertAvailable(
      tenantId,
      assetIds,
      current.plannedStart,
      current.plannedEnd,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const rentalNumber = await generateRentalNumber(tx, tenantId);

      const rental = await tx.rental.create({
        data: {
          tenantId,
          customerId: current.customerId,
          rentalNumber,
          status: "RESERVED",
          plannedStart: current.plannedStart,
          plannedEnd: current.plannedEnd,
          currency: current.currency,
          subtotalMinor: current.subtotalMinor,
          discountMinor: current.discountTotalMinor,
          taxMinor: current.taxTotalMinor,
          totalMinor: current.totalMinor,
          notes: current.customerNotes,
          internalNotes: current.internalNotes,
          sourceQuoteId: current.id,
          createdByUserId: actorUserId,
        },
      });

      for (const item of assetItems) {
        await tx.rentalItem.create({
          data: {
            tenantId,
            rentalId: rental.id,
            assetId: item.assetId!,
            quantity: item.quantity,
            billingMode: assertAssetCompatibleBillingMode(item.billingMode),
            dailyPriceMinor: item.dailyPriceMinor,
            weeklyPriceMinor: item.weeklyPriceMinor,
            monthlyPriceMinor: item.monthlyPriceMinor,
            customPriceMinor: item.customPriceMinor,
            // Preserves the exact monthly-billing snapshot the customer's
            // quote was priced under — the Rental's own totals are still
            // copied verbatim from the Quote's totals above, never
            // recomputed from this item, but the item-level breakdown
            // must still be reproducible post-conversion (see ADR 0008,
            // D-072).
            monthlyBillingStrategy: item.monthlyBillingStrategy,
            customMonthLengthDays: item.customMonthLengthDays,
            partialMonthPolicy: item.partialMonthPolicy,
            depositMinor: item.depositMinor,
            discountMinor: item.discountTotalMinor,
            notes: item.notes,
          },
        });
      }

      await tx.rentalStatusHistory.create({
        data: {
          tenantId,
          rentalId: rental.id,
          fromStatus: null,
          toStatus: "RESERVED",
          changedByUserId: actorUserId,
          reason: `Converted from quote ${current.quoteNumber}`,
        },
      });

      const result = await tx.quote.updateMany({
        where: { id, tenantId, status: "ACCEPTED", deletedAt: null },
        data: { status: "CONVERTED", updatedByUserId: actorUserId },
      });
      if (result.count === 0) {
        throw new ConflictException(
          "Quote status changed concurrently — conversion aborted, no rental was created",
        );
      }
      await this.writeStatusHistory(tx, tenantId, id, actorUserId, "ACCEPTED", "CONVERTED", null);

      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "quote.converted",
          entityType: "Quote",
          entityId: id,
          metadata: { rentalId: rental.id, rentalNumber },
        },
        tx,
      );
      await this.auditService.log(
        {
          tenantId,
          userId: actorUserId,
          action: "rental.created",
          entityType: "Rental",
          entityId: rental.id,
          metadata: { rentalNumber, sourceQuoteId: id, itemCount: assetItems.length },
        },
        tx,
      );

      return rental;
    });

    const rentalDetail = await this.prisma.rental.findFirst({
      where: { id: created.id, tenantId },
      include: { customer: true, items: { include: { asset: true } } },
    });
    return { rental: rentalDetail!, alreadyConverted: false };
  }

  // ---------------------------------------------------------------------
  // Public (token-authenticated, unauthenticated) access
  // ---------------------------------------------------------------------

  async findByPublicToken(
    token: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<PublicQuoteView> {
    const quote = await this.loadByToken(token);
    const current = await this.applyExpiryIfDue(quote.tenantId, quote);

    if (current.status === "SENT") {
      await this.markViewed(current.tenantId, current.id, ipAddress, userAgent);
      const refreshed = await this.findOneRaw(current.tenantId, current.id);
      return this.buildPublicView(refreshed);
    }

    return this.buildPublicView(current);
  }

  /** Idempotent: accepting an already-ACCEPTED quote just returns its current state. */
  async publicAccept(
    token: string,
    dto: PublicAcceptQuoteDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<PublicQuoteView> {
    const quote = await this.loadByToken(token);
    const current = await this.applyExpiryIfDue(quote.tenantId, quote);

    if (current.status === "ACCEPTED") {
      return this.buildPublicView(current);
    }
    if (current.status !== "SENT" && current.status !== "VIEWED") {
      throw new ConflictException(`Cannot accept a quote in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: current.id, tenantId: current.tenantId, status: current.status },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedBy: dto.acceptedBy ?? null },
      });
      if (result.count === 0) {
        throw new ConflictException("Quote status changed concurrently — please retry");
      }
      await this.writeStatusHistory(
        tx,
        current.tenantId,
        current.id,
        null,
        current.status,
        "ACCEPTED",
        "Accepted via public link",
      );
      await this.auditService.log(
        {
          tenantId: current.tenantId,
          userId: null,
          action: "quote.accepted",
          entityType: "Quote",
          entityId: current.id,
          metadata: {
            via: "public_link",
            acceptedBy: dto.acceptedBy ?? null,
            ipAddress,
            userAgent,
          },
        },
        tx,
      );
    });

    const refreshed = await this.findOneRaw(current.tenantId, current.id);
    return this.buildPublicView(refreshed);
  }

  /** Idempotent: rejecting an already-REJECTED quote just returns its current state. */
  async publicReject(
    token: string,
    dto: PublicRejectQuoteDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<PublicQuoteView> {
    const quote = await this.loadByToken(token);
    const current = await this.applyExpiryIfDue(quote.tenantId, quote);

    if (current.status === "REJECTED") {
      return this.buildPublicView(current);
    }
    if (current.status !== "SENT" && current.status !== "VIEWED") {
      throw new ConflictException(`Cannot reject a quote in ${current.status} status`);
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: current.id, tenantId: current.tenantId, status: current.status },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: dto.reason ?? null },
      });
      if (result.count === 0) {
        throw new ConflictException("Quote status changed concurrently — please retry");
      }
      await this.writeStatusHistory(
        tx,
        current.tenantId,
        current.id,
        null,
        current.status,
        "REJECTED",
        dto.reason ?? "Rejected via public link",
      );
      await this.auditService.log(
        {
          tenantId: current.tenantId,
          userId: null,
          action: "quote.rejected",
          entityType: "Quote",
          entityId: current.id,
          metadata: { via: "public_link", reason: dto.reason ?? null, ipAddress, userAgent },
        },
        tx,
      );
    });

    const refreshed = await this.findOneRaw(current.tenantId, current.id);
    return this.buildPublicView(refreshed);
  }

  async getPublicPdf(token: string): Promise<{ buffer: Buffer; fileName: string }> {
    const quote = await this.loadByToken(token);
    const current = await this.applyExpiryIfDue(quote.tenantId, quote);

    const existing = await this.pdfService.getLatestDocument(current.tenantId, current.id);
    if (existing) {
      return { buffer: existing.buffer, fileName: existing.document.originalFileName };
    }
    const generated = await this.pdfService.generateAndStore(current.tenantId, current, null);
    return { buffer: generated.buffer, fileName: generated.document.originalFileName };
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private async findOneRaw(tenantId: string, id: string): Promise<QuoteDetailView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: QUOTE_DETAIL_INCLUDE,
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    return quote;
  }

  private async loadByToken(token: string): Promise<QuoteDetailView> {
    const tokenHash = hashPublicQuoteToken(token);
    const quote = await this.prisma.quote.findFirst({
      where: {
        publicTokenHash: tokenHash,
        publicTokenExpiresAt: { gt: new Date() },
        deletedAt: null,
        status: { not: "CANCELLED" },
      },
      include: QUOTE_DETAIL_INCLUDE,
    });
    if (!quote) {
      throw new NotFoundException("Quote not found or this link has expired");
    }
    return quote;
  }

  /**
   * Lazily transitions SENT/VIEWED -> EXPIRED once validUntil has passed —
   * there is no scheduled sweep job (out of scope, no BullMQ per the
   * platform roadmap), so expiry is evaluated whenever a quote is read or
   * acted on. The transition itself is still fully recorded in
   * QuoteStatusHistory, so historical status remains auditable even though
   * expiry wasn't "noticed" until the next access.
   */
  private async applyExpiryIfDue(
    tenantId: string,
    quote: QuoteDetailView,
  ): Promise<QuoteDetailView> {
    const isExpirable = quote.status === "SENT" || quote.status === "VIEWED";
    if (!isExpirable || quote.validUntil.getTime() >= Date.now()) {
      return quote;
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: quote.id, tenantId, status: quote.status },
        data: { status: "EXPIRED" },
      });
      if (result.count > 0) {
        await this.writeStatusHistory(
          tx,
          tenantId,
          quote.id,
          null,
          quote.status,
          "EXPIRED",
          "Validity period elapsed",
        );
        await this.auditService.log(
          {
            tenantId,
            userId: null,
            action: "quote.status_changed",
            entityType: "Quote",
            entityId: quote.id,
            metadata: { from: quote.status, to: "EXPIRED", reason: "validUntil elapsed" },
          },
          tx,
        );
      }
    });

    return this.findOneRaw(tenantId, quote.id);
  }

  private async markViewed(
    tenantId: string,
    quoteId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: quoteId, tenantId, status: "SENT" },
        data: { status: "VIEWED" },
      });
      if (result.count === 0) {
        return;
      }
      await this.writeStatusHistory(
        tx,
        tenantId,
        quoteId,
        null,
        "SENT",
        "VIEWED",
        "Viewed via public link",
      );
      await this.auditService.log(
        {
          tenantId,
          userId: null,
          action: "quote.viewed",
          entityType: "Quote",
          entityId: quoteId,
          metadata: { ipAddress, userAgent },
        },
        tx,
      );
    });
  }

  private async computeAvailabilityWarnings(
    tenantId: string,
    items: { itemType: string; assetId: string | null }[],
    plannedStart: Date,
    plannedEnd: Date,
  ): Promise<QuoteAvailabilityWarning[]> {
    const assetIds = items
      .filter((item) => item.itemType === "ASSET" && item.assetId)
      .map((item) => item.assetId!);
    if (assetIds.length === 0) {
      return [];
    }
    const results = await this.availabilityService.checkAvailability(
      tenantId,
      assetIds,
      plannedStart,
      plannedEnd,
    );
    return results
      .filter((result) => !result.isAvailable)
      .map((result) => ({ assetId: result.assetId, conflicts: result.conflicts }));
  }

  private buildPublicView(quote: QuoteDetailView): PublicQuoteView {
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      plannedStart: quote.plannedStart,
      plannedEnd: quote.plannedEnd,
      currency: quote.currency,
      subtotalMinor: quote.subtotalMinor,
      discountTotalMinor: quote.discountTotalMinor,
      taxTotalMinor: quote.taxTotalMinor,
      depositTotalMinor: quote.depositTotalMinor,
      totalMinor: quote.totalMinor,
      customerNotes: quote.customerNotes,
      termsAndConditions: quote.termsAndConditions,
      acceptedAt: quote.acceptedAt,
      acceptedBy: quote.acceptedBy,
      rejectedAt: quote.rejectedAt,
      rejectionReason: quote.rejectionReason,
      customer: {
        firstName: quote.customer.firstName,
        lastName: quote.customer.lastName,
        company: quote.customer.company,
      },
      items: quote.items
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          itemType: item.itemType,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          billingMode: item.billingMode,
          unitPriceMinor: item.unitPriceMinor,
          dailyPriceMinor: item.dailyPriceMinor,
          weeklyPriceMinor: item.weeklyPriceMinor,
          monthlyPriceMinor: item.monthlyPriceMinor,
          customPriceMinor: item.customPriceMinor,
          monthlyBillingStrategy: item.monthlyBillingStrategy,
          customMonthLengthDays: item.customMonthLengthDays,
          partialMonthPolicy: item.partialMonthPolicy,
          discountTotalMinor: item.discountTotalMinor,
          taxTotalMinor: item.taxTotalMinor,
          depositMinor: item.depositMinor,
          lineSubtotalMinor: item.lineSubtotalMinor,
          lineTotalMinor: item.lineTotalMinor,
          sortOrder: item.sortOrder,
        })),
      availabilityWarnings: [],
    };
  }

  private writeStatusHistory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    quoteId: string,
    changedByUserId: string | null,
    fromStatus: QuoteStatus,
    toStatus: QuoteStatus,
    reason: string | null | undefined,
  ) {
    return tx.quoteStatusHistory.create({
      data: { tenantId, quoteId, fromStatus, toStatus, changedByUserId, reason: reason ?? null },
    });
  }

  private assertTransition(from: QuoteStatus, to: QuoteStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`Cannot transition a quote from ${from} to ${to}`);
    }
  }

  private async assertCustomerBelongsToTenant(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private async assertItemsValid(
    tenantId: string,
    items: Pick<QuoteItemDto, "itemType" | "assetId" | "billingMode">[],
  ): Promise<void> {
    const assetIds = new Set<string>();
    for (const item of items) {
      if (item.itemType === "ASSET") {
        if (!item.assetId) {
          throw new BadRequestException("assetId is required when itemType is ASSET");
        }
        if (item.billingMode === "FLAT") {
          throw new BadRequestException("ASSET items cannot use FLAT billing mode");
        }
        if (assetIds.has(item.assetId)) {
          throw new BadRequestException(`Duplicate asset in quote items: ${item.assetId}`);
        }
        assetIds.add(item.assetId);
      } else if (item.assetId) {
        throw new BadRequestException(`assetId must not be set when itemType is ${item.itemType}`);
      }
    }

    if (assetIds.size === 0) {
      return;
    }
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...assetIds] }, tenantId, deletedAt: null },
    });
    this.assertAssetsStillRentable([...assetIds], assets);
  }

  private assertAssetsStillRentable(assetIds: string[], assets: Asset[]): void {
    const uniqueIds = [...new Set(assetIds)];
    const foundIds = new Set(assets.map((asset) => asset.id));
    const missing = uniqueIds.filter((assetId) => !foundIds.has(assetId));
    if (missing.length > 0) {
      throw new NotFoundException(`Asset(s) not found in this tenant: ${missing.join(", ")}`);
    }
    const notRentable = assets.filter((asset) => !asset.isActive || !asset.isRentable);
    if (notRentable.length > 0) {
      throw new BadRequestException(
        `Asset(s) not available for rental (inactive or not rentable): ${notRentable.map((asset) => asset.internalNumber).join(", ")}`,
      );
    }
  }

  private assertDateOrder(plannedStart: Date, plannedEnd: Date): void {
    if (plannedEnd <= plannedStart) {
      throw new BadRequestException("plannedEnd must be after plannedStart");
    }
  }

  private assertValidityOrder(issueDate: Date, validUntil: Date): void {
    if (validUntil < issueDate) {
      throw new BadRequestException("validUntil must not be before issueDate");
    }
  }

  private async resolveTenant(
    tenantId: string,
  ): Promise<{ name: string; defaultCurrency: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, defaultCurrency: true },
    });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant;
  }

  /**
   * Only queries RentalBillingSettings when at least one item actually
   * needs it — shared with Rentals (see rentals.service.ts's identically
   * named method) rather than a separate Quote-specific settings model.
   */
  private async resolveBillingSettingsIfNeeded(
    tenantId: string,
    items: { billingMode: QuoteItemDto["billingMode"] }[],
  ): Promise<EffectiveRentalBillingSettings | null> {
    if (!items.some((item) => item.billingMode === "MONTHLY")) {
      return null;
    }
    return this.rentalBillingSettingsService.getEffective(tenantId);
  }
}

function assertAssetCompatibleBillingMode(
  mode: QuoteItem["billingMode"],
): Exclude<QuoteItem["billingMode"], "FLAT"> {
  if (mode === "FLAT") {
    // assertItemsValid already forbids this for ASSET items at create/update
    // time; this only guards against data written before that rule existed.
    throw new BadRequestException("ASSET items cannot use FLAT billing mode");
  }
  return mode;
}

/**
 * Stamps the tenant's current monthly billing settings onto every MONTHLY
 * item — this is the one place a fresh (client-submitted) item list picks
 * up `monthlyBillingStrategy`/`customMonthLengthDays`; the client itself
 * never sends these fields (see QuoteItemSource). Mirrors
 * rentals.service.ts's identically named function exactly.
 */
function withMonthlyBillingSettings(
  items: QuoteItemDto[],
  settings: EffectiveRentalBillingSettings | null,
): QuoteItemSource[] {
  return items.map((item) => {
    if (item.billingMode !== "MONTHLY") {
      return item;
    }
    return {
      ...item,
      monthlyBillingStrategy: settings!.monthlyBillingStrategy,
      customMonthLengthDays: settings!.customMonthLengthDays,
      // The client may explicitly choose a per-item partial-month policy
      // (see the Prices step); the tenant's setting is only the default
      // when it doesn't (see DECISIONS.md D-072).
      partialMonthPolicy: item.partialMonthPolicy ?? settings!.partialMonthPolicy,
    };
  });
}

function toPricedItemInput(item: QuoteItemSource): PricedQuoteItemInput {
  return {
    billingMode: item.billingMode,
    quantity: item.quantity ?? 1,
    unitPriceMinor: item.unitPriceMinor ?? null,
    dailyPriceMinor: item.dailyPriceMinor ?? null,
    weeklyPriceMinor: item.weeklyPriceMinor ?? null,
    monthlyPriceMinor: item.monthlyPriceMinor ?? null,
    customPriceMinor: item.customPriceMinor ?? null,
    discountType: item.discountType ?? null,
    discountValue: item.discountValue ?? 0,
    taxRateBp: item.taxRateBp ?? 0,
    depositMinor: item.depositMinor ?? 0,
    monthlyBillingStrategy: item.monthlyBillingStrategy ?? null,
    customMonthLengthDays: item.customMonthLengthDays ?? null,
    partialMonthPolicy: item.partialMonthPolicy ?? null,
  };
}

function toPricedItemInputFromExisting(item: QuoteItem): PricedQuoteItemInput {
  return {
    billingMode: item.billingMode,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    dailyPriceMinor: item.dailyPriceMinor,
    weeklyPriceMinor: item.weeklyPriceMinor,
    monthlyPriceMinor: item.monthlyPriceMinor,
    customPriceMinor: item.customPriceMinor,
    discountType: item.discountType,
    discountValue: item.discountValue,
    taxRateBp: item.taxRateBp,
    depositMinor: item.depositMinor,
    monthlyBillingStrategy: item.monthlyBillingStrategy,
    customMonthLengthDays: item.customMonthLengthDays,
    partialMonthPolicy: item.partialMonthPolicy,
  };
}

function fromExistingItem(item: QuoteItem): QuoteItemSource {
  return {
    itemType: item.itemType,
    ...(item.assetId ? { assetId: item.assetId } : {}),
    name: item.name,
    ...(item.description !== null ? { description: item.description } : {}),
    quantity: item.quantity,
    ...(item.unit !== null ? { unit: item.unit } : {}),
    billingMode: item.billingMode,
    ...(item.unitPriceMinor !== null ? { unitPriceMinor: item.unitPriceMinor } : {}),
    ...(item.dailyPriceMinor !== null ? { dailyPriceMinor: item.dailyPriceMinor } : {}),
    ...(item.weeklyPriceMinor !== null ? { weeklyPriceMinor: item.weeklyPriceMinor } : {}),
    ...(item.monthlyPriceMinor !== null ? { monthlyPriceMinor: item.monthlyPriceMinor } : {}),
    ...(item.customPriceMinor !== null ? { customPriceMinor: item.customPriceMinor } : {}),
    ...(item.discountType ? { discountType: item.discountType } : {}),
    discountValue: item.discountValue,
    taxRateBp: item.taxRateBp,
    depositMinor: item.depositMinor,
    sortOrder: item.sortOrder,
    ...(item.notes !== null ? { notes: item.notes } : {}),
    monthlyBillingStrategy: item.monthlyBillingStrategy,
    customMonthLengthDays: item.customMonthLengthDays,
    partialMonthPolicy: item.partialMonthPolicy,
  };
}

function toQuoteItemCreateData(
  tenantId: string,
  quoteId: string,
  item: QuoteItemSource,
  pricing: QuoteItemPricingResult,
): Prisma.QuoteItemUncheckedCreateInput {
  return {
    tenantId,
    quoteId,
    itemType: item.itemType,
    assetId: item.assetId ?? null,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity ?? 1,
    unit: item.unit ?? null,
    billingMode: item.billingMode,
    unitPriceMinor: item.unitPriceMinor ?? null,
    dailyPriceMinor: item.dailyPriceMinor ?? null,
    weeklyPriceMinor: item.weeklyPriceMinor ?? null,
    monthlyPriceMinor: item.monthlyPriceMinor ?? null,
    customPriceMinor: item.customPriceMinor ?? null,
    monthlyBillingStrategy:
      item.billingMode === "MONTHLY" ? (item.monthlyBillingStrategy ?? null) : null,
    customMonthLengthDays:
      item.billingMode === "MONTHLY" ? (item.customMonthLengthDays ?? null) : null,
    partialMonthPolicy: item.billingMode === "MONTHLY" ? (item.partialMonthPolicy ?? null) : null,
    discountType: item.discountType ?? null,
    discountValue: item.discountValue ?? 0,
    discountTotalMinor: pricing.discountTotalMinor,
    taxRateBp: item.taxRateBp ?? 0,
    taxTotalMinor: pricing.taxTotalMinor,
    depositMinor: item.depositMinor ?? 0,
    lineSubtotalMinor: pricing.lineSubtotalMinor,
    lineTotalMinor: pricing.lineTotalMinor,
    sortOrder: item.sortOrder ?? 0,
    notes: item.notes ?? null,
  };
}

function buildSendEmailHtml(
  quote: QuoteDetailView,
  tenantName: string,
  publicUrl: string,
  message: string | undefined,
): string {
  const escapedMessage = message ? `<p>${escapeHtml(message)}</p>` : "";
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>${escapeHtml(tenantName)}</h2>
      <p>Please find attached your commercial quote <strong>${escapeHtml(quote.quoteNumber)}</strong>.</p>
      ${escapedMessage}
      <p><a href="${publicUrl}">View and respond to this quote online</a></p>
      <p style="color:#888; font-size: 12px;">This link is valid until ${quote.validUntil.toISOString().slice(0, 10)}.</p>
    </div>
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
