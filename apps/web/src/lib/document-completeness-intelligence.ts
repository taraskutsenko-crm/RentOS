import type { RentalDocument, RentalSourceQuote, RentalStatus } from "../types/rental";

export type DocumentChecklistItemKey =
  "commercialOffer" | "contract" | "handoverProtocol" | "returnProtocol";

/**
 * Which real Document.documentType each checklist row corresponds to —
 * used to link a "missing" row straight to the "Generate document" flow
 * (`/app/documents/new?rentalId=...&documentType=...`) pre-filled with the
 * right type, turning the checklist from informational into actionable.
 * `commercialOffer` has no entry: it is never "missing" (see below), only
 * "present"/"notRequired", so there is nothing to generate for it here —
 * a Quote is created from the Customer/Quotes workspace, not this page.
 */
export const CHECKLIST_ITEM_DOCUMENT_TYPE: Partial<
  Record<DocumentChecklistItemKey, RentalDocument["documentType"]>
> = {
  contract: "CONTRACT",
  handoverProtocol: "HANDOVER_PROTOCOL",
  returnProtocol: "RETURN_PROTOCOL",
};

export type DocumentChecklistState = "present" | "missing" | "notRequired";

export interface DocumentChecklistItem {
  key: DocumentChecklistItemKey;
  state: DocumentChecklistState;
}

/** Rental states in which the asset has actually been handed over. */
const HANDED_OVER_STATUSES: RentalStatus[] = ["ACTIVE", "RETURNED", "COMPLETED"];

/** Rental states in which the asset has actually come back. */
const RETURNED_STATUSES: RentalStatus[] = ["RETURNED", "COMPLETED"];

function hasNonVoidedDocument(documents: RentalDocument[], type: RentalDocument["documentType"]) {
  return documents.some(
    (document) => document.documentType === type && document.status !== "VOIDED",
  );
}

/**
 * A pure, real-data-only derivation of a rental's document checklist —
 * never a persisted state, never fabricated urgency. `commercialOffer` is
 * informational only (a direct-created rental with no source quote is a
 * legitimate workflow, not a defect); `contract` is always expected;
 * `handoverProtocol`/`returnProtocol` only become "missing" once the
 * rental has actually reached the lifecycle stage where they'd exist.
 */
export function getRentalDocumentChecklist(rental: {
  status: RentalStatus;
  sourceQuote: RentalSourceQuote | null;
  documents: RentalDocument[];
}): DocumentChecklistItem[] {
  const { status, sourceQuote, documents } = rental;

  const commercialOffer: DocumentChecklistItem = {
    key: "commercialOffer",
    state: sourceQuote ? "present" : "notRequired",
  };

  const contract: DocumentChecklistItem = {
    key: "contract",
    state: hasNonVoidedDocument(documents, "CONTRACT") ? "present" : "missing",
  };

  const handoverProtocol: DocumentChecklistItem = {
    key: "handoverProtocol",
    state: !HANDED_OVER_STATUSES.includes(status)
      ? "notRequired"
      : hasNonVoidedDocument(documents, "HANDOVER_PROTOCOL")
        ? "present"
        : "missing",
  };

  const returnProtocol: DocumentChecklistItem = {
    key: "returnProtocol",
    state: !RETURNED_STATUSES.includes(status)
      ? "notRequired"
      : hasNonVoidedDocument(documents, "RETURN_PROTOCOL")
        ? "present"
        : "missing",
  };

  return [commercialOffer, contract, handoverProtocol, returnProtocol];
}
