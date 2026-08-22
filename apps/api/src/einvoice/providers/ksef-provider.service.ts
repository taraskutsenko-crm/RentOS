import { Injectable, NotImplementedException } from "@nestjs/common";

import type {
  EInvoiceConnectionTestResult,
  EInvoiceProvider,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "../einvoice-provider.interface";
import type { InvoiceDetailView } from "../../invoices/invoice.types";

/**
 * Poland's KSeF (Krajowy System e-Faktur) — the `EInvoiceProvider` boundary
 * implementation for Poland. INTENTIONALLY NOT WIRED to any real KSeF
 * endpoint in this pass — see the task's explicit constraint: "Do not fake
 * a working KSeF connection. If real KSeF connectivity is outside this
 * pass, implement the provider boundary/settings architecture and clearly
 * report the remaining official API integration work."
 *
 * A light, non-committal check of KSeF API 2.0's publicly documented
 * shape (Ministry of Finance / api.ksef.mf.gov.pl, accurate as of this
 * pass — always re-verify against the official spec before implementing
 * real calls, per the task's explicit instruction not to implement from
 * memory or outdated examples):
 *   - REST API, OpenAPI-described, base URLs
 *     `https://api-test.ksef.mf.gov.pl/api/v2` (test) and
 *     `https://api.ksef.mf.gov.pl/api/v2` (production).
 *   - Auth flow: POST `/api/v2/auth/challenge` -> a short-lived challenge;
 *     the caller signs an `AuthTokenRequest` XML document (containing the
 *     challenge + a ContextIdentifier — NIP / InternalId / NipVatUe) and
 *     exchanges it for a JWT used on subsequent calls.
 *   - Official docs/OpenAPI/SDKs: https://ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/wsparcie-dla-integratorow
 *
 * None of the above is implemented below — every method here is an honest
 * "not yet built" response or a NotImplementedException. Real
 * implementation work remaining (see docs/DECISIONS.md and the final
 * report): the actual challenge/auth-token exchange, XAdES/qualified-seal
 * signing of the AuthTokenRequest, the real invoice XML schema (FA(2)/
 * FA(3) — verify current schema version against the official spec before
 * building), submission/session endpoints, and status polling.
 */
@Injectable()
export class KsefProvider implements EInvoiceProvider {
  async testConnection(
    _credentials: string,
    _environment: string,
  ): Promise<EInvoiceConnectionTestResult> {
    return {
      connected: false,
      errorMessage:
        "KSeF connectivity is not implemented yet — this is a settings/credential-storage placeholder only. See docs/DECISIONS.md for the remaining official API integration work.",
    };
  }

  submitInvoice(
    _invoice: InvoiceDetailView,
    _credentials: string,
    _environment: string,
  ): Promise<EInvoiceSubmissionResult> {
    throw new NotImplementedException(
      "KSeF invoice submission is not implemented yet — the provider boundary is ready, but no real API call is wired up in this pass.",
    );
  }

  checkSubmissionStatus(
    _externalReferenceNumber: string,
    _credentials: string,
    _environment: string,
  ): Promise<EInvoiceStatusResult> {
    throw new NotImplementedException(
      "KSeF status polling is not implemented yet — the provider boundary is ready, but no real API call is wired up in this pass.",
    );
  }
}
