import type { BlockNode } from "./contract-section-library";

/**
 * The shape persisted into the previously-dormant
 * `DocumentTemplateVersion.variablesSchema` column when a version was authored
 * with the no-code builder (see apps/web/.../template-builder/). Any other
 * shape (including `null`, from every template created before this feature or
 * via the Advanced/Code textarea) is not recognized and falls back to
 * Advanced/Code mode — deliberately no reverse-parsing of arbitrary HTML back
 * into blocks.
 */
export interface BlocksV1Schema {
  editorFormat: "blocks-v1";
  blocks: BlockNode[];
}

export function readBlocksV1Schema(
  variablesSchema: Record<string, unknown> | null | undefined,
): BlockNode[] | null {
  if (!variablesSchema) return null;
  if (variablesSchema["editorFormat"] !== "blocks-v1") return null;
  const blocks = variablesSchema["blocks"];
  if (!Array.isArray(blocks)) return null;
  return blocks as BlockNode[];
}

export function toBlocksV1Schema(blocks: BlockNode[]): Record<string, unknown> {
  return { editorFormat: "blocks-v1", blocks };
}
