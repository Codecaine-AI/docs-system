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
    type: "paragraph",
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
        type: "heading",
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
      list: block("list", { type: "list-item", text: [{ insert: "Item" }], children: ["nested"] }),
      nested: block("nested", { type: "list-item", text: [{ insert: "Nested item" }] }),
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

  it("rejects a non-string block type", () => {
    const doc = validDoc();
    (doc.blocks.p1 as unknown as { type: unknown }).type = 42;
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "$.blocks.p1.type")).toBe(true);
  });

  it("rejects a missing block type", () => {
    const doc = validDoc();
    delete (doc.blocks.p1 as unknown as { type?: unknown }).type;
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === "$.blocks.p1.type")).toBe(true);
  });

  it("rejects a block that carries the retired \"flavour\" key instead of \"type\"", () => {
    const doc = validDoc() as unknown as { blocks: Record<string, Record<string, unknown>> };
    doc.blocks.p1.flavour = doc.blocks.p1.type;
    delete doc.blocks.p1.type;
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((candidate) => candidate.path === "$.blocks.p1.flavour");
    expect(issue?.message).toContain('"flavour"');
    expect(issue?.message).toContain('"type"');
  });

  it("rejects the retired \"flavour\" key even alongside a valid \"type\"", () => {
    const doc = validDoc() as unknown as { blocks: Record<string, Record<string, unknown>> };
    doc.blocks.p1.flavour = "paragraph";
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((candidate) => candidate.path === "$.blocks.p1.flavour")).toBe(true);
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

  it("tolerates wrong-typed canvas props on read and preserves them", () => {
    const doc = validDoc();
    doc.blocks.root.children.push("canvas-1");
    doc.blocks["canvas-1"] = block("canvas-1", {
      type: "canvas",
      props: { canvasId: 42 },
    });
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks["canvas-1"].props.canvasId).toBe(42);
  });

  it("tolerates stray canvas props on read and preserves them", () => {
    const doc = validDoc();
    doc.blocks.root.children.push("canvas-1");
    doc.blocks["canvas-1"] = block("canvas-1", {
      type: "canvas",
      props: { zoom: 3 },
    });
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks["canvas-1"].props.zoom).toBe(3);
  });
});

describe("validateDocDocument — legacy type coercion", () => {
  function docWithBlock(raw: Record<string, unknown>): Record<string, unknown> {
    return {
      schemaVersion: 1,
      id: "doc-coerce",
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["legacy"] },
        legacy: raw,
      },
    };
  }

  it("coerces a retired semantic type to a callout carrying the type as kind", () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "requirement",
        props: { title: "Id stability" },
        text: [{ insert: "Update keeps ids; split and merge mint fresh ones." }],
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.document.blocks.legacy;
    expect(block.type).toBe("callout");
    expect(block.props.kind).toBe("requirement");
    // Original props, text, and children survive verbatim.
    expect(block.props.title).toBe("Id stability");
    expect(block.text).toEqual([{ insert: "Update keeps ids; split and merge mint fresh ones." }]);
    expect(block.children).toEqual([]);
  });

  it("coerces never-in-schema legacy types (e.g. \"overview\") the same way", () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "overview",
        props: { title: "Big picture" },
        text: [{ insert: "Legacy overview body." }],
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks.legacy.type).toBe("callout");
    expect(result.document.blocks.legacy.props.kind).toBe("overview");
  });

  it('coerces the retired "data-model" type to a callout carrying kind "data-model"', () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "data-model",
        props: { title: "Old model", entities: [{ name: "Doc", fields: [] }] },
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.document.blocks.legacy;
    expect(block.type).toBe("callout");
    expect(block.props.kind).toBe("data-model");
    // Original props survive verbatim alongside the coercion.
    expect(block.props.title).toBe("Old model");
    expect(block.props.entities).toEqual([{ name: "Doc", fields: [] }]);
  });

  it('coerces the retired "api-surface" type to a callout carrying kind "api-surface"', () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "api-surface",
        props: { title: "Old routes" },
        text: [{ insert: "- GET /docs/sample -- Fetch the sample doc" }],
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.document.blocks.legacy;
    expect(block.type).toBe("callout");
    expect(block.props.kind).toBe("api-surface");
    expect(block.text).toEqual([{ insert: "- GET /docs/sample -- Fetch the sample doc" }]);
  });

  it("keeps an existing non-empty props.kind instead of overwriting it", () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "decision",
        props: { kind: "ADR", title: "Normalized tree" },
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks.legacy.props.kind).toBe("ADR");
    expect(result.document.blocks.legacy.type).toBe("callout");
  });

  it('coerces the retired "mermaid" type to a callout carrying kind "mermaid"', () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "mermaid",
        props: { title: "Flow" },
        text: [{ insert: "flowchart LR\n  A[Doc] --> B[Render]" }],
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.document.blocks.legacy;
    expect(block.type).toBe("callout");
    expect(block.props.kind).toBe("mermaid");
    // Original props and diagram source survive verbatim.
    expect(block.props.title).toBe("Flow");
    expect(block.text).toEqual([{ insert: "flowchart LR\n  A[Doc] --> B[Render]" }]);
  });

  it("serialization emits the coerced canonical form", () => {
    const result = validateDocDocument(
      docWithBlock({
        id: "legacy",
        type: "requirement",
        props: { title: "Id stability" },
        children: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = serializeDocDocument(result.document);
    const parsed = JSON.parse(serialized) as {
      blocks: Record<string, { type: string; props: Record<string, unknown> }>;
    };
    expect(parsed.blocks.legacy.type).toBe("callout");
    expect(parsed.blocks.legacy.props.kind).toBe("requirement");
    // Re-validating the serialized form is a no-op (already canonical).
    const revalidated = validateDocDocument(JSON.parse(serialized));
    expect(revalidated.ok).toBe(true);
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
      "type",
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
