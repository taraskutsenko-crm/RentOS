import { Injectable, Logger } from "@nestjs/common";

import type {
  DocumentSignatureProvider,
  SignatureRequestInput,
  SignatureRequestResult,
  SignatureStatusResult,
} from "./document-signature-provider.types";

/**
 * The only DocumentSignatureProvider implementation shipped in TASK-0008
 * Part 2 — logs the request and immediately reports PENDING, exactly
 * mirroring LoggingEmailProvider's "placeholder now, real transport later"
 * shape (see ADR 0007). No webhook, no external HTTP call, no real
 * cryptographic signature — `checkStatus` always reports back PENDING
 * (a real provider would poll or receive a webhook); staff record the
 * actual outcome via the existing Document sign/reject actions once a
 * signature is obtained by whatever means. See
 * docs/adr/0011-document-rendering-and-sharing.md.
 */
@Injectable()
export class LocalMockSignatureProvider implements DocumentSignatureProvider {
  private readonly logger = new Logger(LocalMockSignatureProvider.name);

  async requestSignature(input: SignatureRequestInput): Promise<SignatureRequestResult> {
    this.logger.log(
      `[LocalMockSignatureProvider] Would request signature for document=${input.documentNumber} ` +
        `signer=${input.signerEmail ?? "(none)"} (no real provider configured — see docs/architecture.md)`,
    );
    return { externalReference: null, status: "PENDING" };
  }

  async checkStatus(): Promise<SignatureStatusResult> {
    return { status: "PENDING" };
  }

  async cancel(): Promise<void> {
    // No external system to notify.
  }
}
