import { describe, expect, it } from "vitest";

import { getRentalDocumentChecklist } from "../../src/lib/document-completeness-intelligence";
import type { RentalDocument, RentalDocumentStatus, RentalStatus } from "../../src/types/rental";

function doc(overrides: Partial<RentalDocument> = {}): RentalDocument {
  return {
    id: "doc-1",
    documentType: "CONTRACT",
    customTypeName: null,
    documentNumber: "CON-000001",
    status: "READY",
    title: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getRentalDocumentChecklist", () => {
  describe("commercialOffer", () => {
    it("is notApplicable for a directly-created rental with no source quote and no QUOTE document", () => {
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: null,
        documents: [],
      });
      expect(checklist.find((item) => item.key === "commercialOffer")).toEqual({
        key: "commercialOffer",
        state: "notApplicable",
        document: null,
      });
    });

    it("is sourceQuoteOnly when a source quote exists but no QUOTE document was ever generated (business object != document)", () => {
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
        documents: [],
      });
      expect(checklist.find((item) => item.key === "commercialOffer")).toEqual({
        key: "commercialOffer",
        state: "sourceQuoteOnly",
        document: null,
      });
    });

    it("is generated when a real QUOTE document exists, even without checking sourceQuote", () => {
      const offerDoc = doc({
        id: "doc-offer",
        documentType: "QUOTE",
        documentNumber: "Q-2026-000001",
      });
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
        documents: [offerDoc],
      });
      expect(checklist.find((item) => item.key === "commercialOffer")).toEqual({
        key: "commercialOffer",
        state: "generated",
        document: offerDoc,
      });
    });
  });

  describe("contract", () => {
    it("is readyToGenerate when no CONTRACT document exists, regardless of rental status", () => {
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: null,
        documents: [],
      });
      expect(checklist.find((item) => item.key === "contract")).toEqual({
        key: "contract",
        state: "readyToGenerate",
        document: null,
      });
    });

    it("is generated when a non-voided CONTRACT document exists", () => {
      const contractDoc = doc();
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: null,
        documents: [contractDoc],
      });
      expect(checklist.find((item) => item.key === "contract")).toEqual({
        key: "contract",
        state: "generated",
        document: contractDoc,
      });
    });

    it("does not count a VOIDED contract document as generated", () => {
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: null,
        documents: [doc({ status: "VOIDED" })],
      });
      expect(checklist.find((item) => item.key === "contract")).toEqual({
        key: "contract",
        state: "readyToGenerate",
        document: null,
      });
    });

    it.each<RentalDocumentStatus>(["SENT", "VIEWED"])("reflects sent for status=%s", (status) => {
      const contractDoc = doc({ status });
      const checklist = getRentalDocumentChecklist({
        status: "DRAFT",
        sourceQuote: null,
        documents: [contractDoc],
      });
      expect(checklist.find((item) => item.key === "contract")).toEqual({
        key: "contract",
        state: "sent",
        document: contractDoc,
      });
    });

    it.each<RentalDocumentStatus>(["SIGNED", "PARTIALLY_SIGNED"])(
      "reflects signed for status=%s",
      (status) => {
        const contractDoc = doc({ status });
        const checklist = getRentalDocumentChecklist({
          status: "DRAFT",
          sourceQuote: null,
          documents: [contractDoc],
        });
        expect(checklist.find((item) => item.key === "contract")).toEqual({
          key: "contract",
          state: "signed",
          document: contractDoc,
        });
      },
    );
  });

  describe("handoverProtocol", () => {
    it.each<RentalStatus>(["DRAFT", "QUOTE", "RESERVED"])(
      "is notRequiredYet before the asset has been handed over and no document exists (status=%s)",
      (status) => {
        const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
        expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
          key: "handoverProtocol",
          state: "notRequiredYet",
          document: null,
        });
      },
    );

    it.each<RentalStatus>(["ACTIVE", "RETURNED", "COMPLETED"])(
      "is readyToGenerate once the rental has started with no protocol on file (status=%s)",
      (status) => {
        const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
        expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
          key: "handoverProtocol",
          state: "readyToGenerate",
          document: null,
        });
      },
    );

    it("is generated once a HANDOVER_PROTOCOL document exists for an active rental", () => {
      const handoverDoc = doc({ id: "doc-2", documentType: "HANDOVER_PROTOCOL" });
      const checklist = getRentalDocumentChecklist({
        status: "ACTIVE",
        sourceQuote: null,
        documents: [handoverDoc],
      });
      expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
        key: "handoverProtocol",
        state: "generated",
        document: handoverDoc,
      });
    });

    it.each<RentalStatus>(["DRAFT", "QUOTE", "RESERVED"])(
      "regression: a Handover Protocol generated before the rental is ACTIVE is still recognized as generated, never masked back to notRequiredYet (status=%s)",
      (status) => {
        const handoverDoc = doc({ id: "doc-early-handover", documentType: "HANDOVER_PROTOCOL" });
        const checklist = getRentalDocumentChecklist({
          status,
          sourceQuote: null,
          documents: [handoverDoc],
        });
        expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
          key: "handoverProtocol",
          state: "generated",
          document: handoverDoc,
        });
      },
    );
  });

  describe("returnProtocol", () => {
    it.each<RentalStatus>(["DRAFT", "QUOTE", "RESERVED", "ACTIVE"])(
      "is notRequiredYet before the asset has actually come back and no document exists (status=%s)",
      (status) => {
        const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
        expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
          key: "returnProtocol",
          state: "notRequiredYet",
          document: null,
        });
      },
    );

    it("is readyToGenerate once the rental is RETURNED with no protocol on file", () => {
      const checklist = getRentalDocumentChecklist({
        status: "RETURNED",
        sourceQuote: null,
        documents: [],
      });
      expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
        key: "returnProtocol",
        state: "readyToGenerate",
        document: null,
      });
    });

    it("is generated once a RETURN_PROTOCOL document exists for a returned rental", () => {
      const returnDoc = doc({ id: "doc-3", documentType: "RETURN_PROTOCOL" });
      const checklist = getRentalDocumentChecklist({
        status: "COMPLETED",
        sourceQuote: null,
        documents: [returnDoc],
      });
      expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
        key: "returnProtocol",
        state: "generated",
        document: returnDoc,
      });
    });

    it("regression: a Return Protocol generated before RETURNED is still recognized as generated, never masked back to notRequiredYet", () => {
      const returnDoc = doc({ id: "doc-early-return", documentType: "RETURN_PROTOCOL" });
      const checklist = getRentalDocumentChecklist({
        status: "ACTIVE",
        sourceQuote: null,
        documents: [returnDoc],
      });
      expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
        key: "returnProtocol",
        state: "generated",
        document: returnDoc,
      });
    });
  });

  it("picks the most-advanced non-voided document when several of the same type exist", () => {
    const draftDoc = doc({ id: "doc-draft", status: "DRAFT" });
    const signedDoc = doc({ id: "doc-signed", status: "SIGNED" });
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [draftDoc, signedDoc],
    });
    expect(checklist.find((item) => item.key === "contract")).toEqual({
      key: "contract",
      state: "signed",
      document: signedDoc,
    });
  });

  it("returns exactly the four expected checklist items, in order", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [],
    });
    expect(checklist.map((item) => item.key)).toEqual([
      "commercialOffer",
      "contract",
      "handoverProtocol",
      "returnProtocol",
    ]);
  });
});
