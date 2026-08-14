import { describe, expect, it } from "vitest";

import {
  CONTRACT_SECTIONS,
  fullContractBlocks,
  renderBlocksToHtml,
  variableBlock,
  variableChip,
} from "../../src/lib/contract-section-library";
import { DOCUMENT_VARIABLE_PATHS } from "../../src/lib/document-variable-registry";

describe("contract-section-library", () => {
  it("has exactly 16 body sections — the 18-section contract minus Title and Signatures (rendered by the shared shell)", () => {
    expect(CONTRACT_SECTIONS).toHaveLength(16);
  });

  it("every section has a unique id and a non-empty labelKey", () => {
    const ids = CONTRACT_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of CONTRACT_SECTIONS) {
      expect(section.labelKey.length).toBeGreaterThan(0);
    }
  });

  it("every variableChip/variableBlock path used in the library exists in the document variable registry", () => {
    const registeredPaths = new Set(DOCUMENT_VARIABLE_PATHS);
    function collectPaths(nodes: ReturnType<typeof fullContractBlocks>): string[] {
      const found: string[] = [];
      for (const node of nodes) {
        if (node.type === "variableChip" || node.type === "variableBlock") {
          found.push(String(node.attrs?.path));
        }
        if (node.content) found.push(...collectPaths(node.content));
      }
      return found;
    }
    const usedPaths = collectPaths(fullContractBlocks());
    expect(usedPaths.length).toBeGreaterThan(0);
    for (const path of usedPaths) {
      expect(registeredPaths.has(path), `"${path}" is not in DOCUMENT_VARIABLE_PATHS`).toBe(true);
    }
  });

  it("renderBlocksToHtml renders a docSection into a titled .doc-section div", () => {
    const html = renderBlocksToHtml(CONTRACT_SECTIONS.find((s) => s.id === "parties")!.content);
    expect(html).toContain('<div class="doc-section">');
    expect(html).toContain('<div class="doc-section__title">Parties</div>');
    expect(html).toContain("{{company.name}}");
    expect(html).toContain("{{customer.name}}");
  });

  it("renderBlocksToHtml renders a variableBlock as a bare {{path}} placeholder, not wrapped in a paragraph", () => {
    const html = renderBlocksToHtml([variableBlock("rental.assetsTableHtml")]);
    expect(html).toBe("{{rental.assetsTableHtml}}");
  });

  it("renderBlocksToHtml HTML-escapes authored text but leaves {{path}} syntax verbatim", () => {
    const html = renderBlocksToHtml([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Terms & <Conditions>" }, variableChip("today")],
      },
    ]);
    expect(html).toContain("Terms &amp; &lt;Conditions&gt;");
    expect(html).toContain("{{today}}");
    expect(html).not.toContain("<Conditions>");
  });

  it("fullContractBlocks concatenates all 16 sections in the same order as CONTRACT_SECTIONS", () => {
    const blocks = fullContractBlocks();
    const sectionTitles = blocks
      .filter((b) => b.type === "docSection")
      .map((b) => b.content?.[0]?.content?.[0]?.text);
    expect(sectionTitles).toEqual([
      "Parties",
      "Subject of the Contract — Rented Assets",
      "Rental Period",
      "Price",
      "Payment Terms",
      "Delivery and Handover",
      "Return",
      "Customer Responsibilities",
      "Damage and Loss",
      "Late Return",
      "Non-Payment",
      "Termination",
      "Additional Costs",
      "Notices",
      "Applicable Terms and Jurisdiction",
      "Additional Conditions",
    ]);
  });

  it("renderBlocksToHtml(fullContractBlocks()) contains every section title the built-in default CONTRACT template renders", () => {
    const html = renderBlocksToHtml(fullContractBlocks());
    const expectedTitles = [
      "Parties",
      "Subject of the Contract — Rented Assets",
      "Rental Period",
      "Price",
      "Payment Terms",
      "Delivery and Handover",
      "Return",
      "Customer Responsibilities",
      "Damage and Loss",
      "Late Return",
      "Non-Payment",
      "Termination",
      "Additional Costs",
      "Notices",
      "Applicable Terms and Jurisdiction",
      "Additional Conditions",
    ];
    for (const title of expectedTitles) {
      expect(html).toContain(title);
    }
  });
});
