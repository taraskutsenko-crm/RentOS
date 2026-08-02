import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RentalExtensionRequest } from "@prisma/client";

import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RentalsService } from "../../rentals/rentals.service";
import type { CreateExtensionRequestDto } from "../dto/create-extension-request.dto";
import type { RespondExtensionRequestDto } from "../dto/respond-extension-request.dto";
import { PortalNotificationsService } from "../notifications/portal-notifications.service";
import { PortalRentalsService } from "../rentals/portal-rentals.service";

/**
 * Customer submission + staff response for "please extend my rental."
 * Approving a request never recomputes pricing/availability itself — it
 * delegates entirely to RentalsService.extendPlannedEnd(), the same rule
 * every other portal service follows (no business logic duplicated
 * outside the module that owns it).
 */
@Injectable()
export class PortalExtensionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rentalsService: RentalsService,
    private readonly portalRentalsService: PortalRentalsService,
    private readonly notificationsService: PortalNotificationsService,
  ) {}

  async create(
    tenantId: string,
    customerId: string,
    rentalId: string,
    dto: CreateExtensionRequestDto,
  ): Promise<RentalExtensionRequest> {
    const rental = await this.portalRentalsService.findOne(tenantId, customerId, rentalId);
    if (rental.status !== "RESERVED" && rental.status !== "ACTIVE") {
      throw new ConflictException(
        `Cannot request an extension for a rental in ${rental.status} status`,
      );
    }

    const requestedEnd = new Date(dto.requestedEnd);
    if (requestedEnd <= rental.plannedEnd) {
      throw new BadRequestException("The requested end date must be after the current planned end");
    }

    const existingPending = await this.prisma.rentalExtensionRequest.findFirst({
      where: { tenantId, rentalId, status: "PENDING" },
    });
    if (existingPending) {
      throw new ConflictException("A pending extension request already exists for this rental");
    }

    const created = await this.prisma.rentalExtensionRequest.create({
      data: {
        tenantId,
        rentalId,
        customerId,
        currentEnd: rental.plannedEnd,
        requestedEnd,
        message: dto.message ?? null,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: null,
      action: "rental.extension_requested",
      entityType: "Rental",
      entityId: rentalId,
      metadata: {
        customerId,
        extensionRequestId: created.id,
        requestedEnd: requestedEnd.toISOString(),
      },
    });

    return created;
  }

  async findMany(
    tenantId: string,
    customerId: string,
    rentalId?: string,
  ): Promise<RentalExtensionRequest[]> {
    return this.prisma.rentalExtensionRequest.findMany({
      where: { tenantId, customerId, ...(rentalId ? { rentalId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Staff-side: lists every extension request for the tenant, optionally scoped to one rental. */
  async findManyForStaff(tenantId: string, rentalId?: string): Promise<RentalExtensionRequest[]> {
    return this.prisma.rentalExtensionRequest.findMany({
      where: { tenantId, ...(rentalId ? { rentalId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    });
  }

  async respond(
    tenantId: string,
    requestId: string,
    actorUserId: string,
    dto: RespondExtensionRequestDto,
  ): Promise<RentalExtensionRequest> {
    const request = await this.prisma.rentalExtensionRequest.findFirst({
      where: { id: requestId, tenantId },
    });
    if (!request) {
      throw new NotFoundException("Extension request not found");
    }
    if (request.status !== "PENDING") {
      throw new ConflictException(`Cannot respond to a request in ${request.status} status`);
    }

    if (dto.approve) {
      await this.rentalsService.extendPlannedEnd(
        tenantId,
        request.rentalId,
        actorUserId,
        request.requestedEnd,
      );
    }

    const updated = await this.prisma.rentalExtensionRequest.update({
      where: { id: requestId },
      data: {
        status: dto.approve ? "APPROVED" : "REJECTED",
        responseMessage: dto.responseMessage ?? null,
        respondedAt: new Date(),
        respondedByUserId: actorUserId,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: dto.approve ? "rental.extension_approved" : "rental.extension_rejected",
      entityType: "Rental",
      entityId: request.rentalId,
      metadata: { extensionRequestId: requestId },
    });

    await this.notificationsService.create({
      tenantId,
      customerId: request.customerId,
      type: "EXTENSION_RESPONSE",
      title: dto.approve ? "Extension request approved" : "Extension request declined",
      body: dto.approve
        ? `Your rental has been extended to ${request.requestedEnd.toLocaleDateString()}.`
        : (dto.responseMessage ?? "Your extension request was declined."),
      link: `/portal/rentals/${request.rentalId}`,
    });

    return updated;
  }
}
