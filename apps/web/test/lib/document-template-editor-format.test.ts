import { describe, expect, it } from "vitest";

import {
  readBlocksV1Schema,
  toBlocksV1Schema,
} from "../../src/lib/document-template-editor-format";

describe("document-template-editor-format", () => {
  describe("readBlocksV1Schema", () => {
    it("returns null for null/undefined", () => {
      expect(readBlocksV1Schema(null)).toBeNull();
      expect(readBlocksV1Schema(undefined)).toBeNull();
    });

    it("returns null for a legacy/unrecognized shape", () => {
      expect(readBlocksV1Schema({})).toBeNull();
      expect(readBlocksV1Schema({ someOtherKey: true })).toBeNull();
      expect(readBlocksV1Schema({ editorFormat: "blocks-v2", blocks: [] })).toBeNull();
      expect(readBlocksV1Schema({ editorFormat: "blocks-v1", blocks: "not-an-array" })).toBeNull();
    });

    it("returns the blocks array for a recognized blocks-v1 shape", () => {
      const blocks = [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }];
      expect(readBlocksV1Schema({ editorFormat: "blocks-v1", blocks })).toEqual(blocks);
    });
  });

  describe("toBlocksV1Schema", () => {
    it("wraps blocks in the recognized editorFormat envelope", () => {
      const blocks = [{ type: "paragraph" }];
      expect(toBlocksV1Schema(blocks)).toEqual({ editorFormat: "blocks-v1", blocks });
    });
  });
});
