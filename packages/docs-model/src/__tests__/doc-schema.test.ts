import { describe, expect, it } from "bun:test";
import type { DocBlock, DocDocument } from "../doc-schema";
import {
  docBlockOrder,
  serializeDocDocument,
  validateDocDocument,
} from "../doc-schema";
import { validateSpectreRef } from "../spectre-ref";

function block(id: string, overrides: Partial<DocBlock> = {}): DocBlock {
  return {
    id,
    flavour: "paragraph",
    props: {},
    children: [],
    ...overrides,
  };
}

function validDoc(): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-overview",
    title: "Overview",
    root: "root",
    blocks: {
      root: block("root", { children: ["h1", "p1", "list"] }),
      h1: block("h1", {
        flavour: "heading",
        props: { level: 1 },
        text: [{ insert: "Overview" }],
      }),
      p1: block("p1", {
        text: [
          { insert: "Spectre keeps " },
          { insert: "docs", attributes: { bold: true } },
          {
            insert: "schema.ts",
            attributes: {
              code: true,
              reference: { kind: "source", path: "external/canvas/packages/canvas/src/schema.ts" },
            },
          },
        ],
      }),
      list: block("list", { flavour: "list-item", text: [{ insert: "Item" }], children: ["nested"] }),
      nested: block("nested", { flavour: "list-item", text: [{ insert: "Nested item" }] }),
    },
  };
}

describe("validateDocDocument", () => {
  it("accepts a valid normalized tree", () => {
    const result = validateDocDocument(validDoc());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root).toBe("root");
    expect(Object.keys(result.document.blocks)).toHaveLength(5);
    expect(result.document.blocks.p1.text).toHaveLength(3);
  });

  it("rejects a non-object document", () => {
    const result = validateDocDocument(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe("$");
  });

  it("rejects an unknown flavour", () => {
    const doc = validDoc();
    (doc.blocks.p1 as unknown as { flavour: string }).flavour = "wormhole";
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "$.blocks.p1.flavour")).toBe(true);
  });

  it("rejects a missing root id", () => {
    const doc = validDoc() as unknown as Record<string, unknown>;
    delete doc.root;
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "$.root")).toBe(true);
  });

  it("rejects a root that is not present in blocks", () => {
    const doc = validDoc();
    doc.root = "ghost";
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes('"ghost"'))).toBe(true);
  });

  it("rejects orphan child references", () => {
    const doc = validDoc();
    doc.blocks.root.children.push("missing-child");
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes("Orphan child"))).toBe(true);
  });

  it("rejects a block shared by two parents", () => {
    const doc = validDoc();
    doc.blocks.p1.children.push("nested");
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes("Shared child"))).toBe(true);
  });

  it("rejects cycles (detached cyclic subtree is unreachable)", () => {
    const doc = validDoc();
    doc.blocks.a = block("a", { children: ["b"] });
    doc.blocks.b = block("b", { children: ["a"] });
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.issues.some(
        (issue) => issue.message.includes("Shared child") || issue.message.includes("Unreachable"),
      ),
    ).toBe(true);
  });

  it("rejects the root appearing as a child (cycle through root)", () => {
    const doc = validDoc();
    doc.blocks.nested.children.push("root");
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.message.includes("cannot be a child"))).toBe(true);
  });

  it("rejects blocks not reachable from root", () => {
    const doc = validDoc();
    doc.blocks.island = block("island");
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "$.blocks.island")).toBe(true);
  });

  it("rejects a block whose id does not match its map key", () => {
    const doc = validDoc();
    doc.blocks.p1 = { ...doc.blocks.p1, id: "p2" };
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
  });

  it("rejects malformed delta spans and bad references", () => {
    const doc = validDoc();
    doc.blocks.p1.text = [{ insert: 42 } as unknown as { insert: string }];
    expect(validateDocDocument(doc).ok).toBe(false);

    const doc2 = validDoc();
    doc2.blocks.p1.text = [
      {
        insert: "x",
        attributes: { reference: { kind: "nope", path: "" } },
      } as unknown as { insert: string },
    ];
    expect(validateDocDocument(doc2).ok).toBe(false);
  });

  it("accepts canvas blocks with canvasId only", () => {
    const doc = validDoc();
    doc.blocks.root.children.push("canvas-1");
    doc.blocks["canvas-1"] = block("canvas-1", {
      flavour: "canvas",
      props: { canvasId: "canvas-main" },
    });
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("tolerates canvas blocks without canvasId or src (legacy title-only placeholders)", () => {
    const doc = validDoc();
    doc.blocks.root.children.push("canvas-1");
    doc.blocks["canvas-1"] = block("canvas-1", {
      flavour: "canvas",
      props: { title: "Docs Lab Canvas" },
    });
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
  });
});

describe("validateSpectreRef", () => {
  it("accepts doc and source refs", () => {
    expect(validateSpectreRef({ kind: "doc", path: "docs/00-foundation/00-overview" }).ok).toBe(true);
    expect(
      validateSpectreRef({
        kind: "source",
        path: "apps/frontend/src/lib/docs-model/doc-schema.ts",
        symbol: "validateDocDocument",
        line: 12,
        label: "doc schema",
      }).ok,
    ).toBe(true);
  });

  it("rejects unknown kinds and empty paths", () => {
    const bad = validateSpectreRef({ kind: "web", path: "" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.issues.map((issue) => issue.path)).toEqual(["$.kind", "$.path"]);
  });
});

describe("serializeDocDocument", () => {
  it("is deterministic regardless of in-memory key order", () => {
    const doc = validDoc();
    const shuffled: DocDocument = {
      blocks: Object.fromEntries(Object.entries(doc.blocks).reverse()) as DocDocument["blocks"],
      root: doc.root,
      title: doc.title,
      id: doc.id,
      schemaVersion: 1,
    };
    expect(serializeDocDocument(shuffled)).toBe(serializeDocDocument(doc));
  });

  it("emits blocks in depth-first document order with stable key order", () => {
    const serialized = serializeDocDocument(validDoc());
    const parsed = JSON.parse(serialized) as { blocks: Record<string, unknown> };
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "id", "title", "root", "blocks"]);
    expect(Object.keys(parsed.blocks)).toEqual(["root", "h1", "p1", "list", "nested"]);
    expect(Object.keys(parsed.blocks.h1 as Record<string, unknown>)).toEqual([
      "id",
      "flavour",
      "props",
      "text",
      "children",
    ]);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("round-trips through validateDocDocument", () => {
    const serialized = serializeDocDocument(validDoc());
    const result = validateDocDocument(JSON.parse(serialized));
    expect(result.ok).toBe(true);
  });
});

describe("docBlockOrder", () => {
  it("walks depth-first from root following child order", () => {
    expect(docBlockOrder(validDoc())).toEqual(["root", "h1", "p1", "list", "nested"]);
  });
});
