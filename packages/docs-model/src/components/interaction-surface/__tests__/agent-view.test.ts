"use client";

import { describe, expect, it } from "bun:test";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { interactionSurfaceAgentView } from "../agent-view";

const fixtureBlock = sampleFixture.blocks["interaction-surface-1"] as DocBlock;

describe("interaction-surface component agent view", () => {
  it("projects the fixture byte-for-byte", () => {
    expect(interactionSurfaceAgentView(fixtureBlock, { listDepth: 0, listIndex: 0 })).toBe(
      "**File-tree block surface**\n\n```\n" +
        "file-tree.addEntry(path: string, note?: string, change?: string) -> props patch  # Append a path entry to the tree\n" +
        "  path: string  # /-separated path\n" +
        "file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath\n" +
        "file-tree.removeEntry(path: string)\n```",
    );
  });

  it("emits no detail lines for params without descriptions or nested fields", () => {
    const block: DocBlock = {
      id: "b1",
      type: "interaction-surface",
      props: {
        operations: [
          {
            name: "docs.load",
            params: [
              { name: "path", type: "string", required: true },
              { name: "fresh", type: "boolean", required: false },
            ],
            returns: "DocDocument",
          },
        ],
      },
      children: [],
    };
    expect(interactionSurfaceAgentView(block, { listDepth: 0, listIndex: 0 })).toBe(
      "```\ndocs.load(path: string, fresh?: boolean) -> DocDocument\n```",
    );
  });

  it("indents nested param fields two spaces per depth beneath the signature", () => {
    const block: DocBlock = {
      id: "b1",
      type: "interaction-surface",
      props: {
        operations: [
          {
            name: "state-shape.addField",
            description: "Insert a field under the parent named by path",
            params: [
              {
                name: "field",
                type: "Field",
                required: true,
                fields: [
                  { name: "name", type: "string" },
                  { name: "required", type: "boolean", required: false, description: "false = optional" },
                  {
                    name: "fields",
                    type: "Field[]",
                    required: false,
                    fields: [{ name: "name", type: "string" }],
                  },
                ],
              },
              { name: "path", type: "string", required: false, description: "Dot-path of the PARENT" },
              { name: "index", type: "number", required: false },
            ],
            returns: "props patch",
          },
        ],
      },
      children: [],
    };
    expect(interactionSurfaceAgentView(block, { listDepth: 0, listIndex: 0 })).toBe(
      "```\n" +
        "state-shape.addField(field: Field, path?: string, index?: number) -> props patch  # Insert a field under the parent named by path\n" +
        "  field: Field\n" +
        "    name: string\n" +
        "    required?: boolean  # false = optional\n" +
        "    fields?: Field[]\n" +
        "      name: string\n" +
        "  path?: string  # Dot-path of the PARENT\n```",
    );
  });
});
