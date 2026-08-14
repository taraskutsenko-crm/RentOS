/**
 * The 18-section professional Rental Contract (see
 * apps/api/.../rendering/default-templates.ts's rentalContractBody, and
 * docs/UI_REDESIGN_PLAN.md's Pre-Chapter 10 section), reauthored as
 * reusable, insertable block fragments for the no-code template builder
 * (Part E). Sections 1 (Title) and 18 (Signatures) are rendered by the
 * shared document shell every template already gets automatically — this
 * library covers the 16 body sections in between.
 *
 * Blocks are plain JSON in ProseMirror's node shape (the format Tiptap
 * reads/writes natively — see docs/ARCHITECTURE_LOCK.md's Tiptap/ProseMirror
 * decision) so the no-code builder (apps/web/src/components/documents/
 * template-builder/) can insert a section's `content` directly via
 * `editor.chain().insertContent(section.content).run()` with no translation
 * step. `renderBlocksToHtml` converts that same JSON into the exact
 * `{{dot.path}}`-templated HTML string DocumentRendererService already
 * knows how to render — zero backend rendering changes.
 *
 * Deliberately simpler than default-templates.ts's built-in HTML for the
 * three data-heavy sections (Parties/Rental Period/Price): those use
 * `.doc-grid`/`.doc-field` two-column layouts in the raw-HTML default, but
 * here they're plain paragraphs with inline variable chips — a normal user
 * reorders/edits paragraphs, not CSS grids. The built-in default (used
 * automatically until a tenant creates/activates their own template) keeps
 * its richer layout unchanged.
 */

/** A ProseMirror-JSON-compatible node — structurally what Tiptap's JSONContent expects. */
export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
  text?: string;
}

/** A block-level atom holding one raw-HTML variable (e.g. a pre-built assets table) — inserted as its own block, never inline. */
export function variableBlock(path: string): BlockNode {
  return { type: "variableBlock", attrs: { path } };
}

/** An inline atom rendered as a chip in the editor (e.g. "[Company name]") and as `{{path}}` in the stored template. */
export function variableChip(path: string): BlockNode {
  return { type: "variableChip", attrs: { path } };
}

function text(value: string): BlockNode {
  return { type: "text", text: value };
}

function paragraph(content: BlockNode[]): BlockNode {
  return { type: "paragraph", content };
}

function docSection(titleText: string, body: BlockNode[]): BlockNode {
  return {
    type: "docSection",
    content: [{ type: "docSectionTitle", content: [text(titleText)] }, ...body],
  };
}

export interface ContractSectionDefinition {
  id: string;
  /** i18n key for the "Add section" picker label — see packages/localization's documentTemplateBuilder.section.* namespace. */
  labelKey: string;
  content: BlockNode[];
}

export const CONTRACT_SECTIONS: ContractSectionDefinition[] = [
  {
    id: "parties",
    labelKey: "contractSection.parties",
    content: [
      docSection("Parties", [
        paragraph([text("Company: "), variableChip("company.name")]),
        paragraph([text("Represented by: "), variableChip("employee.name")]),
        paragraph([text("Customer: "), variableChip("customer.name")]),
        paragraph([text("Address: "), variableChip("customer.address")]),
        paragraph([
          text("Contact: "),
          variableChip("customer.email"),
          text(" · "),
          variableChip("customer.phone"),
        ]),
      ]),
    ],
  },
  {
    id: "subjectAssets",
    labelKey: "contractSection.subjectAssets",
    content: [
      docSection("Subject of the Contract — Rented Assets", [
        variableBlock("rental.assetsTableHtml"),
      ]),
    ],
  },
  {
    id: "rentalPeriod",
    labelKey: "contractSection.rentalPeriod",
    content: [
      docSection("Rental Period", [
        paragraph([text("Start: "), variableChip("rental.startDateTime")]),
        paragraph([text("End: "), variableChip("rental.endDateTime")]),
      ]),
    ],
  },
  {
    id: "price",
    labelKey: "contractSection.price",
    content: [
      docSection("Price", [
        paragraph([text("Rental total: "), variableChip("rental.total")]),
        paragraph([text("Security deposit: "), variableChip("rental.deposit")]),
      ]),
    ],
  },
  {
    id: "paymentTerms",
    labelKey: "contractSection.paymentTerms",
    content: [
      docSection("Payment Terms", [
        paragraph([
          text("The Customer agrees to pay the Rental total of "),
          variableChip("rental.total"),
          text(" according to the payment schedule agreed with "),
          variableChip("company.name"),
          text(
            ". Any security deposit stated above is held for the duration of the rental and is refundable subject to the return conditions described below.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "deliveryHandover",
    labelKey: "contractSection.deliveryHandover",
    content: [
      docSection("Delivery and Handover", [
        paragraph([
          text(
            "The rented assets are handed over to the Customer at the start of the Rental Period in the condition recorded in the accompanying Handover Protocol, if one is issued. The Customer is responsible for inspecting the assets at handover and reporting any pre-existing damage immediately.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "return",
    labelKey: "contractSection.return",
    content: [
      docSection("Return", [
        paragraph([
          text("The Customer must return the rented assets to "),
          variableChip("company.name"),
          text(
            " by the End of the Rental Period stated above, in the same condition as received, ordinary wear and tear excepted. Condition at return is recorded in the accompanying Return Protocol, if one is issued.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "customerResponsibilities",
    labelKey: "contractSection.customerResponsibilities",
    content: [
      docSection("Customer Responsibilities", [
        paragraph([
          text(
            "The Customer shall use the rented assets only for their intended purpose, in accordance with any operating instructions provided, and shall not sublet, lend, or transfer the assets to any third party without ",
          ),
          variableChip("company.name"),
          text("'s prior written consent."),
        ]),
      ]),
    ],
  },
  {
    id: "damageAndLoss",
    labelKey: "contractSection.damageAndLoss",
    content: [
      docSection("Damage and Loss", [
        paragraph([
          text(
            "The Customer is responsible for any damage to or loss of the rented assets occurring during the Rental Period, beyond ordinary wear and tear, and agrees to reimburse ",
          ),
          variableChip("company.name"),
          text(" for repair or replacement costs as documented in a Damage Report."),
        ]),
      ]),
    ],
  },
  {
    id: "lateReturn",
    labelKey: "contractSection.lateReturn",
    content: [
      docSection("Late Return", [
        paragraph([
          text("If the rented assets are not returned by the End of the Rental Period, "),
          variableChip("company.name"),
          text(
            " may charge an additional fee for each day of late return, and reserves the right to recover the assets at the Customer's expense.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "nonPayment",
    labelKey: "contractSection.nonPayment",
    content: [
      docSection("Non-Payment", [
        paragraph([
          text("If any amount due under this Contract is not paid when due, "),
          variableChip("company.name"),
          text(
            " reserves the right to suspend the rental, withhold the security deposit, and pursue collection of the outstanding balance.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "termination",
    labelKey: "contractSection.termination",
    content: [
      docSection("Termination", [
        paragraph([
          text(
            "Either party may terminate this Contract early by written notice in the event the other party materially breaches its obligations under this Contract and fails to remedy that breach within a reasonable period after notice.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "additionalCosts",
    labelKey: "contractSection.additionalCosts",
    content: [
      docSection("Additional Costs", [
        paragraph([
          text(
            "Costs not included in the Rental total above — such as delivery, collection, fuel, cleaning, or consumables — are the Customer's responsibility and will be invoiced separately unless otherwise agreed in writing.",
          ),
        ]),
      ]),
    ],
  },
  {
    id: "notices",
    labelKey: "contractSection.notices",
    content: [
      docSection("Notices", [
        paragraph([
          text("Any notice under this Contract shall be sent to "),
          variableChip("company.name"),
          text(" at "),
          variableChip("company.address"),
          text(" or to the Customer at the address stated above."),
        ]),
      ]),
    ],
  },
  {
    id: "jurisdiction",
    labelKey: "contractSection.jurisdiction",
    content: [
      docSection("Applicable Terms and Jurisdiction", [
        paragraph([
          text(
            "This Contract is governed by the terms agreed between the parties. Any dispute arising from this Contract shall be resolved in accordance with the jurisdiction applicable to ",
          ),
          variableChip("company.name"),
          text(", as customized by "),
          variableChip("company.name"),
          text(" for this template."),
        ]),
      ]),
    ],
  },
  {
    id: "additionalConditions",
    labelKey: "contractSection.additionalConditions",
    content: [
      docSection("Additional Conditions", [
        paragraph([text("Any additional conditions specific to this rental can be added here.")]),
        paragraph([variableChip("notes")]),
      ]),
    ],
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converts inline node content (text + variableChip) into the raw HTML the resolver already understands. */
function inlineToHtml(nodes: BlockNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.text ?? "");
      if (node.type === "variableChip") return `{{${String(node.attrs?.path ?? "")}}}`;
      return "";
    })
    .join("");
}

/**
 * Converts a block tree into the exact `{{dot.path}}`-templated HTML string
 * format DocumentRendererService already renders — the no-code builder's
 * entire backend integration is "produce this string," nothing else
 * changes server-side. `variableChip`/`variableBlock` paths are emitted
 * verbatim (never HTML-escaped) since they're the template syntax itself,
 * not user-entered text; every other text node is escaped.
 */
export function renderBlocksToHtml(blocks: BlockNode[]): string {
  return blocks.map(blockToHtml).join("");
}

function blockToHtml(block: BlockNode): string {
  switch (block.type) {
    case "docSection": {
      const [titleNode, ...body] = block.content ?? [];
      const titleHtml =
        titleNode?.type === "docSectionTitle" ? inlineToHtml(titleNode.content) : "";
      return (
        `<div class="doc-section"><div class="doc-section__title">${titleHtml}</div>` +
        `${body.map(blockToHtml).join("")}</div>`
      );
    }
    case "paragraph":
      return `<p class="doc-clause">${inlineToHtml(block.content)}</p>`;
    case "variableBlock":
      return `{{${String(block.attrs?.path ?? "")}}}`;
    default:
      return "";
  }
}

/** All 16 body sections concatenated, in order — the "start from Havelio Rental Contract template" starter content (see the New Template page). */
export function fullContractBlocks(): BlockNode[] {
  return CONTRACT_SECTIONS.flatMap((section) => section.content);
}
