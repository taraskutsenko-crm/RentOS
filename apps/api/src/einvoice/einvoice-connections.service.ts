import { BadRequestException, Injectable } from "@nestjs/common";
import type { EInvoiceConnection, EInvoiceProviderType } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { EncryptionService } from "../common/encryption.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ConnectEInvoiceDto } from "./dto/connect-einvoice.dto";
import type { EInvoiceConnectionView } from "./einvoice-connection.types";
import type { EInvoiceProvider } from "./einvoice-provider.interface";
import { KsefProvider } from "./providers/ksef-provider.service";

const DEFAULT_ENVIRONMENT = "test";

/**
 * Settings -> Integrations backing service. Manages one
 * `EInvoiceConnection` row per (tenant, provider) and is the ONLY place
 * that ever decrypts a stored credential — always for the single call
 * that needs it, never held longer or logged (see EncryptionService,
 * task's explicit security requirement).
 */
@Injectable()
export class EInvoiceConnectionsService {
  private readonly providers: Record<EInvoiceProviderType, EInvoiceProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly encryptionService: EncryptionService,
    ksefProvider: KsefProvider,
  ) {
    this.providers = { KSEF: ksefProvider };
  }

  async getStatus(
    tenantId: string,
    provider: EInvoiceProviderType,
  ): Promise<EInvoiceConnectionView> {
    const connection = await this.prisma.eInvoiceConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    return toView(provider, connection);
  }

  async connect(
    tenantId: string,
    provider: EInvoiceProviderType,
    actorUserId: string,
    dto: ConnectEInvoiceDto,
  ): Promise<EInvoiceConnectionView> {
    const providerImpl = this.getProvider(provider);
    const environment = dto.environment ?? DEFAULT_ENVIRONMENT;

    // Always attempted before storing anything, so a tenant sees the real
    // (currently: honest "not implemented") outcome immediately — never a
    // silently-stored credential with no feedback.
    const testResult = await providerImpl.testConnection(dto.credentials, environment);
    const encryptedCredentials = this.encryptionService.encrypt(dto.credentials);

    const connection = await this.prisma.eInvoiceConnection.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        status: testResult.connected ? "CONNECTED" : "ERROR",
        environment,
        encryptedCredentials,
        lastError: testResult.errorMessage,
        connectedAt: testResult.connected ? new Date() : null,
        lastCheckedAt: new Date(),
      },
      update: {
        status: testResult.connected ? "CONNECTED" : "ERROR",
        environment,
        encryptedCredentials,
        lastError: testResult.errorMessage,
        connectedAt: testResult.connected ? new Date() : null,
        lastCheckedAt: new Date(),
      },
    });

    // Never logs `dto.credentials` or `encryptedCredentials` — only the
    // resulting status, matching the task's "never log secrets" requirement.
    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "einvoice_connection.connect_attempted",
      entityType: "EInvoiceConnection",
      entityId: connection.id,
      metadata: { provider, environment, status: connection.status },
    });

    return toView(provider, connection);
  }

  async disconnect(
    tenantId: string,
    provider: EInvoiceProviderType,
    actorUserId: string,
  ): Promise<EInvoiceConnectionView> {
    const connection = await this.prisma.eInvoiceConnection.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, status: "NOT_CONNECTED" },
      update: {
        status: "NOT_CONNECTED",
        encryptedCredentials: null,
        connectedAt: null,
        lastError: null,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "einvoice_connection.disconnected",
      entityType: "EInvoiceConnection",
      entityId: connection.id,
      metadata: { provider },
    });

    return toView(provider, connection);
  }

  private getProvider(provider: EInvoiceProviderType): EInvoiceProvider {
    const impl = this.providers[provider];
    if (!impl) {
      throw new BadRequestException(`No e-invoice provider implementation for ${provider}`);
    }
    return impl;
  }
}

function toView(
  provider: EInvoiceProviderType,
  connection: EInvoiceConnection | null,
): EInvoiceConnectionView {
  if (!connection) {
    return {
      provider,
      status: "NOT_CONNECTED",
      environment: null,
      connectedAt: null,
      lastCheckedAt: null,
      lastError: null,
    };
  }
  return {
    provider: connection.provider,
    status: connection.status,
    environment: connection.environment,
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
    lastError: connection.lastError,
  };
}
