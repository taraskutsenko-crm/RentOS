import { Inject, Injectable } from "@nestjs/common";

import {
  EMAIL_PROVIDER,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "./email.types";

/**
 * Thin, provider-agnostic layer — mirrors StorageService exactly. Never
 * called inside a `$transaction`: an SMTP/API call is network I/O and must
 * not hold a database transaction open (see QuotesService.send, which sends
 * only after its status-change transaction has already committed).
 */
@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  send(message: EmailMessage): Promise<EmailSendResult> {
    return this.provider.send(message);
  }
}
