import { describe, expect, it } from "vitest";

import { getRentalNextAction } from "../../src/lib/rental-next-action";
import type { RentalDocument, RentalStatus } from "../../src/types/rental";

function document(
  documentType: RentalDocument["documentType"],
  status: RentalDocument["status"] = "SIGNED",
): RentalDocument {
  return {
    id: `doc-${documentType}`,
    documentType,
    customTypeName: null,
    documentNumber: "DOC-000001",
    status,
    title: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function rental(status: RentalStatus, documents: RentalDocument[] = []) {
  return { status, sourceQuote: null, documents };
}

describe("getRentalNextAction", () => {
  it("returns NONE for a CANCELLED rental even with no documents", () => {
    expect(getRentalNextAction(rental("CANCELLED"))).toEqual({ kind: "NONE" });
  });

  it("returns NONE for a COMPLETED rental with all documents present", () => {
    const documents = [document("CONTRACT"), document("HANDOVER_PROTOCOL")];
    expect(getRentalNextAction(rental("COMPLETED", documents))).toEqual({ kind: "NONE" });
  });

  it("returns GENERATE_CONTRACT when no contract exists, regardless of status", () => {
    expect(getRentalNextAction(rental("DRAFT"))).toEqual({ kind: "GENERATE_CONTRACT" });
    expect(getRentalNextAction(rental("RESERVED"))).toEqual({ kind: "GENERATE_CONTRACT" });
    expect(getRentalNextAction(rental("ACTIVE"))).toEqual({ kind: "GENERATE_CONTRACT" });
  });

  it("treats a VOIDED contract as still missing", () => {
    const documents = [document("CONTRACT", "VOIDED")];
    expect(getRentalNextAction(rental("ACTIVE", documents))).toEqual({
      kind: "GENERATE_CONTRACT",
    });
  });

  // A Handover Protocol may be prepared as soon as the rental is RESERVED,
  // not only once the asset has actually been handed over (ACTIVE) — see
  // DECISIONS.md, document checklist actionability fix.
  it("returns PREPARE_HANDOVER once RESERVED with a contract but no handover protocol", () => {
    const documents = [document("CONTRACT")];
    expect(getRentalNextAction(rental("RESERVED", documents))).toEqual({
      kind: "PREPARE_HANDOVER",
    });
  });

  it("returns PREPARE_HANDOVER once ACTIVE with a contract but no handover protocol", () => {
    const documents = [document("CONTRACT")];
    expect(getRentalNextAction(rental("ACTIVE", documents))).toEqual({
      kind: "PREPARE_HANDOVER",
    });
  });

  it("returns RETURN_ASSET once ACTIVE with both contract and handover protocol present", () => {
    const documents = [document("CONTRACT"), document("HANDOVER_PROTOCOL")];
    expect(getRentalNextAction(rental("ACTIVE", documents))).toEqual({ kind: "RETURN_ASSET" });
  });

  it("returns NONE once RETURNED with every document present", () => {
    const documents = [
      document("CONTRACT"),
      document("HANDOVER_PROTOCOL"),
      document("RETURN_PROTOCOL"),
    ];
    expect(getRentalNextAction(rental("RETURNED", documents))).toEqual({ kind: "NONE" });
  });
});
