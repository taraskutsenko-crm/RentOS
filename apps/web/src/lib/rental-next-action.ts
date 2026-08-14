import type { RentalDocument, RentalSourceQuote, RentalStatus } from "../types/rental";
import { getRentalDocumentChecklist } from "./document-completeness-intelligence";

export type RentalNextActionKind =
  "GENERATE_CONTRACT" | "PREPARE_HANDOVER" | "RETURN_ASSET" | "NONE";

export interface RentalNextAction {
  kind: RentalNextActionKind;
}

/**
 * Pure derivation of the single most useful next step for a rental,
 * surfaced as the Rental Workspace's PageHeader primary action — mirrors
 * getRentalTimeIntelligence's pattern (see docs/UI_REDESIGN_PLAN.md's
 * Pre-Chapter 10 workflow-continuity section). Never fabricates a step
 * with no real backend capability: only document generation (the
 * already-existing "Generate document" flow) and the already-existing
 * "Return" action are considered — Reserve/Start remain surfaced via the
 * existing secondary actions rather than duplicated here.
 */
export function getRentalNextAction(rental: {
  status: RentalStatus;
  sourceQuote: RentalSourceQuote | null;
  documents: RentalDocument[];
}): RentalNextAction {
  if (rental.status === "CANCELLED" || rental.status === "COMPLETED") {
    return { kind: "NONE" };
  }

  const checklist = getRentalDocumentChecklist(rental);
  const contract = checklist.find((item) => item.key === "contract");
  if (contract?.state === "missing") {
    return { kind: "GENERATE_CONTRACT" };
  }

  const handoverProtocol = checklist.find((item) => item.key === "handoverProtocol");
  if (handoverProtocol?.state === "missing") {
    return { kind: "PREPARE_HANDOVER" };
  }

  if (rental.status === "ACTIVE") {
    return { kind: "RETURN_ASSET" };
  }

  return { kind: "NONE" };
}
