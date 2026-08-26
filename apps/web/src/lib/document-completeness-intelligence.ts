import type {
  RentalDocument,
  RentalDocumentStatus,
  RentalSourceQuote,
  RentalStatus,
} from "../types/rental";

export type DocumentChecklistItemKey =
  "commercialOffer" | "contract" | "handoverProtocol" | "returnProtocol" | "depositReceipt";

/**
 * Which real Document.documentType each checklist row corresponds to — used
 * to link a row with nothing generated yet straight to the "Generate
 * document" flow (`/app/documents/new?rentalId=...&documentType=...`)
 * pre-filled with the right type, turning the checklist from informational
 * into actionable.
 */
export const CHECKLIST_ITEM_DOCUMENT_TYPE: Record<
  DocumentChecklistItemKey,
  RentalDocument["documentType"]
> = {
  commercialOffer: "QUOTE",
  contract: "CONTRACT",
  handoverProtocol: "HANDOVER_PROTOCOL",
  returnProtocol: "RETURN_PROTOCOL",
  depositReceipt: "DEPOSIT_RECEIPT",
};

/**
 * A real, derived-only lifecycle state per checklist row — never persisted,
 * never fabricated. Distinguishes a business record existing
 * (`sourceQuoteOnly`) from a generated Document actually existing
 * (`generated`/`sent`/`signed`), and a document not yet being relevant at
 * this rental stage (`notRequiredYet`) from one that could be generated
 * right now (`readyToGenerate`) — see DECISIONS.md D-078.
 */
export type DocumentChecklistState =
  | "notApplicable"
  | "sourceQuoteOnly"
  | "notRequiredYet"
  | "readyToGenerate"
  | "generated"
  | "sent"
  | "signed";

export interface DocumentChecklistItem {
  key: DocumentChecklistItemKey;
  state: DocumentChecklistState;
  /** The specific document driving `state`, when one exists — lets the UI link straight to it instead of only offering "Generate". */
  document: RentalDocument | null;
}

/**
 * Rental states in which a Handover Protocol may be prepared — from
 * RESERVED onward, not only once the asset has actually been handed over
 * (ACTIVE). Staff routinely prepare handover paperwork ahead of the actual
 * physical handover; gating "readyToGenerate" on ACTIVE alone incorrectly
 * showed "Not required yet" for a real, already-committed reservation (see
 * DECISIONS.md, document checklist actionability fix).
 */
const HANDOVER_PREPARABLE_STATUSES: RentalStatus[] = [
  "RESERVED",
  "ACTIVE",
  "RETURNED",
  "COMPLETED",
];

/**
 * Rental states in which a Return Protocol may be prepared — from ACTIVE
 * onward (the asset is actually out), not only once it has already come
 * back (RETURNED). Same rationale as HANDOVER_PREPARABLE_STATUSES above.
 */
const RETURN_PREPARABLE_STATUSES: RentalStatus[] = ["ACTIVE", "RETURNED", "COMPLETED"];

/**
 * A deposit receipt only makes sense once the rental is actually committed
 * (RESERVED onward) — same reasoning as HANDOVER_PREPARABLE_STATUSES: staff
 * routinely collect the deposit ahead of physical handover, not only once
 * ACTIVE.
 */
const DEPOSIT_PREPARABLE_STATUSES: RentalStatus[] = ["RESERVED", "ACTIVE", "RETURNED", "COMPLETED"];

const SIGNED_STATUSES: RentalDocumentStatus[] = ["SIGNED", "PARTIALLY_SIGNED"];
const SENT_STATUSES: RentalDocumentStatus[] = ["SENT", "VIEWED"];

/**
 * The most-advanced non-voided document of `type`, and the lifecycle tier
 * it represents — "signed" outranks "sent" outranks "generated" — so a
 * checklist row reflects the furthest real progress made, regardless of how
 * many draft/superseded documents of the same type also exist.
 */
function mostAdvancedDocument(
  documents: RentalDocument[],
  type: RentalDocument["documentType"],
): { state: "generated" | "sent" | "signed"; document: RentalDocument } | null {
  const matches = documents.filter((d) => d.documentType === type && d.status !== "VOIDED");
  if (matches.length === 0) return null;

  const signed = matches.find((d) => SIGNED_STATUSES.includes(d.status));
  if (signed) return { state: "signed", document: signed };

  const sent = matches.find((d) => SENT_STATUSES.includes(d.status));
  if (sent) return { state: "sent", document: sent };

  return { state: "generated", document: matches[0]! };
}

/**
 * A pure, real-data-only derivation of a rental's document checklist — never
 * a persisted state, never fabricated urgency.
 */
export function getRentalDocumentChecklist(rental: {
  status: RentalStatus;
  sourceQuote: RentalSourceQuote | null;
  /** A canonical Quote generated FROM this Rental — the opposite direction from sourceQuote (see DECISIONS.md D-106). */
  generatedQuote?: RentalSourceQuote | null;
  documents: RentalDocument[];
  /** Optional — omit when the caller doesn't need the depositReceipt row (e.g. rental-next-action.ts's status-only derivation). */
  items?: { depositMinor: number }[];
}): DocumentChecklistItem[] {
  const { status, sourceQuote, generatedQuote, documents, items = [] } = rental;
  const depositRequired = items.some((item) => item.depositMinor > 0);

  const linkedQuote = sourceQuote ?? generatedQuote ?? null;
  const offerDocument = mostAdvancedDocument(documents, "QUOTE");
  const commercialOffer: DocumentChecklistItem = offerDocument
    ? { key: "commercialOffer", state: offerDocument.state, document: offerDocument.document }
    : {
        key: "commercialOffer",
        // A real Quote linked either direction (this Rental was converted
        // from one, or a canonical Quote was generated FROM it via
        // "Generate Commercial Quote") always outranks "readyToGenerate" —
        // the caller (rentals/[id]/page.tsx) resolves which one to link to.
        state: linkedQuote
          ? "sourceQuoteOnly"
          : items.length > 0
            ? "readyToGenerate"
            : "notApplicable",
        document: null,
      };

  const contractDocument = mostAdvancedDocument(documents, "CONTRACT");
  const contract: DocumentChecklistItem = contractDocument
    ? { key: "contract", state: contractDocument.state, document: contractDocument.document }
    : { key: "contract", state: "readyToGenerate", document: null };

  // A document's own existence always wins over the rental's current
  // lifecycle stage — generating a Handover/Return early (before the
  // rental technically "needs" one yet) must still be recognized as
  // generated, never masked back down to "not required yet" (the
  // confirmed bug this replaces — see DECISIONS.md D-078).
  const handoverDocument = mostAdvancedDocument(documents, "HANDOVER_PROTOCOL");
  const handoverProtocol: DocumentChecklistItem = handoverDocument
    ? {
        key: "handoverProtocol",
        state: handoverDocument.state,
        document: handoverDocument.document,
      }
    : {
        key: "handoverProtocol",
        state: HANDOVER_PREPARABLE_STATUSES.includes(status) ? "readyToGenerate" : "notRequiredYet",
        document: null,
      };

  const returnDocument = mostAdvancedDocument(documents, "RETURN_PROTOCOL");
  const returnProtocol: DocumentChecklistItem = returnDocument
    ? { key: "returnProtocol", state: returnDocument.state, document: returnDocument.document }
    : {
        key: "returnProtocol",
        state: RETURN_PREPARABLE_STATUSES.includes(status) ? "readyToGenerate" : "notRequiredYet",
        document: null,
      };

  const depositDocument = mostAdvancedDocument(documents, "DEPOSIT_RECEIPT");
  const depositReceipt: DocumentChecklistItem = depositDocument
    ? { key: "depositReceipt", state: depositDocument.state, document: depositDocument.document }
    : {
        key: "depositReceipt",
        state: !depositRequired
          ? "notApplicable"
          : DEPOSIT_PREPARABLE_STATUSES.includes(status)
            ? "readyToGenerate"
            : "notRequiredYet",
        document: null,
      };

  return [commercialOffer, contract, handoverProtocol, returnProtocol, depositReceipt];
}
