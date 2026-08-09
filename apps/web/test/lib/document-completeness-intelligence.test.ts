import { describe, expect, it } from "vitest";

import { getRentalDocumentChecklist } from "../../src/lib/document-completeness-intelligence";
import type { RentalDocument, RentalStatus } from "../../src/types/rental";

function contractDoc(overrides: Partial<RentalDocument> = {}): RentalDocument {
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
  it("marks commercialOffer as present when a source quote exists, never as missing", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
      documents: [],
    });
    expect(checklist.find((item) => item.key === "commercialOffer")).toEqual({
      key: "commercialOffer",
      state: "present",
    });
  });

  it("marks commercialOffer as notRequired (never missing) for a directly-created rental with no source quote", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [],
    });
    expect(checklist.find((item) => item.key === "commercialOffer")).toEqual({
      key: "commercialOffer",
      state: "notRequired",
    });
  });

  it("marks contract as missing when no CONTRACT document exists, regardless of rental status", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [],
    });
    expect(checklist.find((item) => item.key === "contract")).toEqual({
      key: "contract",
      state: "missing",
    });
  });

  it("marks contract as present when a non-voided CONTRACT document exists", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [contractDoc()],
    });
    expect(checklist.find((item) => item.key === "contract")).toEqual({
      key: "contract",
      state: "present",
    });
  });

  it("does not count a VOIDED contract document as present", () => {
    const checklist = getRentalDocumentChecklist({
      status: "DRAFT",
      sourceQuote: null,
      documents: [contractDoc({ status: "VOIDED" })],
    });
    expect(checklist.find((item) => item.key === "contract")).toEqual({
      key: "contract",
      state: "missing",
    });
  });

  it.each<RentalStatus>(["DRAFT", "QUOTE", "RESERVED"])(
    "marks handoverProtocol as notRequired before the asset has been handed over (status=%s)",
    (status) => {
      const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
      expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
        key: "handoverProtocol",
        state: "notRequired",
      });
    },
  );

  it.each<RentalStatus>(["ACTIVE", "RETURNED", "COMPLETED"])(
    "marks handoverProtocol as missing once the rental has started with no protocol on file (status=%s)",
    (status) => {
      const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
      expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
        key: "handoverProtocol",
        state: "missing",
      });
    },
  );

  it("marks handoverProtocol as present once a HANDOVER_PROTOCOL document exists for an active rental", () => {
    const checklist = getRentalDocumentChecklist({
      status: "ACTIVE",
      sourceQuote: null,
      documents: [contractDoc({ id: "doc-2", documentType: "HANDOVER_PROTOCOL" })],
    });
    expect(checklist.find((item) => item.key === "handoverProtocol")).toEqual({
      key: "handoverProtocol",
      state: "present",
    });
  });

  it.each<RentalStatus>(["DRAFT", "QUOTE", "RESERVED", "ACTIVE"])(
    "marks returnProtocol as notRequired before the asset has actually come back (status=%s)",
    (status) => {
      const checklist = getRentalDocumentChecklist({ status, sourceQuote: null, documents: [] });
      expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
        key: "returnProtocol",
        state: "notRequired",
      });
    },
  );

  it("marks returnProtocol as missing once the rental is RETURNED with no protocol on file", () => {
    const checklist = getRentalDocumentChecklist({
      status: "RETURNED",
      sourceQuote: null,
      documents: [],
    });
    expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
      key: "returnProtocol",
      state: "missing",
    });
  });

  it("marks returnProtocol as present once a RETURN_PROTOCOL document exists for a returned rental", () => {
    const checklist = getRentalDocumentChecklist({
      status: "COMPLETED",
      sourceQuote: null,
      documents: [contractDoc({ id: "doc-3", documentType: "RETURN_PROTOCOL" })],
    });
    expect(checklist.find((item) => item.key === "returnProtocol")).toEqual({
      key: "returnProtocol",
      state: "present",
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
