import type { AssetCategoryTreeNode } from "../types/asset";

/**
 * One category flattened out of `AssetCategoryTreeNode[]` for use in a
 * native `<select>`, which cannot render a real nested tree — `depth`
 * lets a caller render an indentation prefix so a parent category and its
 * children are visually distinguishable (see docs/DECISIONS.md, category
 * hierarchy fix). Depth-first order, so a parent always appears
 * immediately before its own children.
 *
 * The single canonical flattening function for every category `<select>`
 * in the app — do not reimplement this per component (see
 * `asset-categories/page.tsx`'s parent picker and `asset-form.tsx`'s
 * category picker, both consumers).
 */
export interface FlatCategoryOption {
  id: string;
  name: string;
  depth: number;
  isActive: boolean;
}

export function flattenCategoryTree(
  nodes: AssetCategoryTreeNode[],
  depth = 0,
): FlatCategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth, isActive: node.isActive },
    ...flattenCategoryTree(node.children, depth + 1),
  ]);
}

/** The indentation prefix a `<select><option>` uses to show hierarchy depth. */
export function categoryIndent(depth: number): string {
  return "— ".repeat(depth);
}
