"use client";

import { describe, expect, it } from "bun:test";
import type { DocBlock } from "../../../doc-schema";
import { stateShapeAgentView } from "../agent-view";

function shapeBlock(props: Record<string, unknown>): DocBlock {
  return { id: "b1", type: "state-shape", props, children: [] };
}

const CTX = { listDepth: 0, listIndex: 0 };

describe("state-shape component agent view", () => {
  it("projects name, source, and the recursive field tree byte-for-byte", () => {
    const block = shapeBlock({
      name: "StructuredTableState",
      source: {
        path: "packages/docs-model/src/components/structured-table/state.ts",
        symbol: "StructuredTableState",
      },
      fields: [
        { name: "title", type: "string", required: false },
        {
          name: "columns",
          type: "TableCell[]",
          description: "Header cells",
          fields: [
            { name: "insert", type: "string" },
            { name: "attributes", type: "DeltaSpanAttributes", required: false },
          ],
        },
        { name: "rows", type: "TableCell[][]" },
      ],
    });
    expect(stateShapeAgentView(block, CTX)).toBe(
      "**StructuredTableState** — packages/docs-model/src/components/structured-table/state.ts#StructuredTableState\n\n" +
        "```\n" +
        "title?: string\n" +
        "columns: TableCell[]  # Header cells\n" +
        "  insert: string\n" +
        "  attributes?: DeltaSpanAttributes\n" +
        "rows: TableCell[][]\n" +
        "```",
    );
  });

  it("projects a name without a source", () => {
    const block = shapeBlock({ name: "Shape", fields: [{ name: "a" }] });
    expect(stateShapeAgentView(block, CTX)).toBe("**Shape**\n\n```\na\n```");
  });

  it("projects a source without a symbol", () => {
    const block = shapeBlock({
      name: "Shape",
      source: { path: "src/state.ts" },
      fields: [{ name: "a" }],
    });
    expect(stateShapeAgentView(block, CTX)).toBe("**Shape** — src/state.ts\n\n```\na\n```");
  });

  it("projects a source alone when the name is absent", () => {
    const block = shapeBlock({
      source: { path: "src/state.ts", symbol: "Shape" },
      fields: [{ name: "a", type: "string" }],
    });
    expect(stateShapeAgentView(block, CTX)).toBe("— src/state.ts#Shape\n\n```\na: string\n```");
  });

  it("projects a bare field tree without any header line", () => {
    const block = shapeBlock({
      fields: [{ name: "a", fields: [{ name: "b", fields: [{ name: "c" }] }] }],
    });
    expect(stateShapeAgentView(block, CTX)).toBe("```\na\n  b\n    c\n```");
  });

  it("projects only the header when fields are empty", () => {
    const block = shapeBlock({ name: "Shape", fields: [] });
    expect(stateShapeAgentView(block, CTX)).toBe("**Shape**");
  });

  it("appends the example as a pretty-printed json fence after the shape fence", () => {
    const block = shapeBlock({
      name: "Shape",
      fields: [{ name: "a", type: "string" }],
      example: '{"a": "value", "b": [1, 2]}',
    });
    expect(stateShapeAgentView(block, CTX)).toBe(
      "**Shape**\n\n" +
        "```\na: string\n```\n\n" +
        "```json\n" +
        "{\n" +
        '  "a": "value",\n' +
        '  "b": [\n' +
        "    1,\n" +
        "    2\n" +
        "  ]\n" +
        "}\n" +
        "```",
    );
  });

  it("projects the example fence alone when header and fields are absent", () => {
    const block = shapeBlock({ fields: [], example: "[true]" });
    expect(stateShapeAgentView(block, CTX)).toBe("```json\n[\n  true\n]\n```");
  });

  it("drops a malformed example instead of crashing", () => {
    const block = shapeBlock({
      name: "Shape",
      fields: [{ name: "a" }],
      example: '{"a": ',
    });
    expect(stateShapeAgentView(block, CTX)).toBe("**Shape**\n\n```\na\n```");
  });

  it("returns null for other block types", () => {
    const block: DocBlock = { id: "b1", type: "paragraph", props: {}, children: [] };
    expect(stateShapeAgentView(block, CTX)).toBeNull();
  });
});
