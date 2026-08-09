import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentStatusBadge } from "../../src/components/documents/document-status-badge";
import type { DocumentStatus } from "../../src/types/document";
import { renderWithProviders } from "../test-utils";

describe("DocumentStatusBadge", () => {
  it.each<[DocumentStatus, string]>([
    ["DRAFT", "Draft"],
    ["READY", "Ready"],
    ["SENT", "Sent"],
    ["VIEWED", "Viewed"],
    ["PARTIALLY_SIGNED", "Partially signed"],
    ["SIGNED", "Signed"],
    ["REJECTED", "Rejected"],
    ["VOIDED", "Voided"],
    ["ARCHIVED", "Archived"],
  ])("renders the translated label for %s", (status, label) => {
    renderWithProviders(<DocumentStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("gives SIGNED a visually distinct tone from a neutral status like DRAFT", () => {
    const { unmount } = renderWithProviders(<DocumentStatusBadge status="SIGNED" />);
    const signedClass = screen.getByText("Signed").className;
    unmount();

    renderWithProviders(<DocumentStatusBadge status="DRAFT" />);
    const draftClass = screen.getByText("Draft").className;

    expect(signedClass).not.toBe(draftClass);
  });

  it("gives REJECTED a visually distinct tone from SIGNED", () => {
    const { unmount } = renderWithProviders(<DocumentStatusBadge status="REJECTED" />);
    const rejectedClass = screen.getByText("Rejected").className;
    unmount();

    renderWithProviders(<DocumentStatusBadge status="SIGNED" />);
    const signedClass = screen.getByText("Signed").className;

    expect(rejectedClass).not.toBe(signedClass);
  });
});
