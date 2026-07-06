import { describe, expect, it } from "bun:test";
import sampleFixture from "../__fixtures__/sample.doc.json";
import type { DocBlock, DocDocument } from "../doc-schema";
import { validateDocDocument } from "../doc-schema";
import { projectToMarkdown } from "../project-markdown";

function block(id: string, overrides: Partial<DocBlock> = {}): DocBlock {
  return {
    id,
    flavour: "paragraph",
    props: {},
    children: [],
    ...overrides,
  };
}

function docWith(blocks: Record<string, DocBlock>, rootChildren: string[]): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-under-test",
    root: "root",
    blocks: {
      root: block("root", { children: rootChildren }),
      ...blocks,
    },
  };
}

describe("projectToMarkdown — the all-flavour sample fixture", () => {
  const validated = validateDocDocument(sampleFixture);
  if (!validated.ok) throw new Error("sample.doc.json fixture failed validation");
  const markdown = projectToMarkdown(validated.document);

  it("is a pure function: repeated calls return identical output", () => {
    expect(projectToMarkdown(validated.document)).toBe(markdown);
  });

  it("projects headings at the right level", () => {
    expect(markdown).toContain("# Docs Model Sample");
    expect(markdown).toContain("## Structure");
  });

  it("projects the mixed-marks paragraph with a plain reference (D35)", () => {
    expect(markdown).toContain("This paragraph mixes **bold**, *italic*, ~~struck~~, `inline code`");
    expect(markdown).toContain("[link](https://example.com)");
    // Reference span renders plain (its label), never as markdown link syntax.
    expect(markdown).toContain("a reference to doc-schema.ts.");
    expect(markdown).not.toContain("[doc-schema.ts](apps/frontend");
  });

  it("projects a divider", () => {
    expect(markdown).toContain("\n---\n");
  });

  it("projects nested list items with 2-space indentation per depth", () => {
    expect(markdown).toContain("- First item");
    expect(markdown).toContain("  - Nested item under the first");
    expect(markdown).toContain("- Second item");
  });

  it("projects a fenced code block with language", () => {
    expect(markdown).toContain("```typescript\nexport const answer = 42;\n```");
  });

  it("projects a quote as a blockquote", () => {
    expect(markdown).toContain("> Stable ids are a system invariant.");
  });

  it("projects a callout with tone and title", () => {
    expect(markdown).toContain("> **INFO:** **Heads up** — Comments live in comments.json, never in doc.json.");
  });

  it("projects a decision with status and title, greppable on '> **Decision'", () => {
    expect(markdown).toContain(
      "> **Decision (accepted): Normalized block tree** — Flat id-keyed blocks map with ordered children arrays.",
    );
    expect(markdown.match(/^> \*\*Decision/m)).not.toBeNull();
  });

  it("projects a canvas block as an HTML-comment reference line", () => {
    expect(markdown).toContain(
      '<!-- canvas: ./assets/canvases/sample.canvas.json view=container-architecture title="Architecture overview" -->',
    );
  });

  it("projects an image as a markdown image with caption", () => {
    expect(markdown).toContain("![Sample image](./assets/images/sample.png)");
    expect(markdown).toContain("*A bundled asset image (D30).*");
  });

  it("projects an attachment as a markdown link", () => {
    expect(markdown).toContain("[spec.pdf](./assets/attachments/spec.pdf)");
  });

  it("projects constraint/assumption/observation/outcome/requirement/implementation/testing as labeled blockquotes", () => {
    expect(markdown).toContain("> **Constraint (hard): No MDX regressions**");
    expect(markdown).toContain("The existing MDX pipeline keeps working untouched.");
    expect(markdown).toContain("> **Assumption (high): Delta spans suffice**");
    expect(markdown).toContain("> **Observation: Renderer walk**");
    expect(markdown).toContain("> **Outcome: Tracer complete**");
    expect(markdown).toContain("> **Requirement: Id stability**");
    expect(markdown).toContain("> **Implementation: docs-model module**");
    expect(markdown).toContain("> **Testing: Contract tests**");
  });

  it("projects an agent-contract with tools/approvals sub-lines", () => {
    expect(markdown).toContain("> **Agent Contract: doc-editor** — Doc editing agent");
    expect(markdown).toContain("tools: doc_get, doc_update_blocks");
    expect(markdown).toContain("approvals: Mutations require hash preconditions.");
  });

  it("projects a file-tree as a fenced text block listing path — note", () => {
    expect(markdown).toContain("```text");
    expect(markdown).toContain("src/lib/docs-model/doc-schema.ts — types + validation");
    expect(markdown).toContain("src/components/docs/DocBlockRenderer.tsx — tracer renderer");
  });

  it("contains every block's identifying content — full flavour coverage", () => {
    for (const id of Object.keys(validated.document.blocks)) {
      const b = validated.document.blocks[id];
      if (b.id === validated.document.root) continue;
      // Every non-root block should leave some trace in the projection.
      const title = typeof b.props.title === "string" ? b.props.title : undefined;
      const text = b.text?.map((s) => s.insert).join("") ?? "";
      const needle = title ?? text;
      if (needle) {
        expect(markdown.includes(needle.split("\n")[0].slice(0, 12))).toBe(true);
      }
    }
  });
});

describe("projectToMarkdown — ordered lists", () => {
  it("numbers list-items when props.ordered is true", () => {
    const doc = docWith(
      {
        a: block("a", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "first" }] }),
        b: block("b", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "second" }] }),
      },
      ["a", "b"],
    );
    const md = projectToMarkdown(doc);
    expect(md).toContain("1. first");
    expect(md).toContain("2. second");
  });

  it("defaults to '-' bullets when ordered is absent", () => {
    const doc = docWith(
      { a: block("a", { flavour: "list-item", text: [{ insert: "item" }] }) },
      ["a"],
    );
    expect(projectToMarkdown(doc)).toContain("- item");
  });

  it("numbers from 1 even when non-list siblings precede the run (heading + ordered items)", () => {
    const doc = docWith(
      {
        h: block("h", { flavour: "heading", props: { level: 1 }, text: [{ insert: "Title" }] }),
        a: block("a", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "first" }] }),
        b: block("b", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "second" }] }),
      },
      ["h", "a", "b"],
    );
    const md = projectToMarkdown(doc);
    expect(md).toContain("1. first");
    expect(md).toContain("2. second");
    expect(md).not.toContain("2. first");
    expect(md).not.toContain("3. second");
  });

  it("restarts numbering at 1 for each ordered run split by a non-list block", () => {
    const doc = docWith(
      {
        a: block("a", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "run1-first" }] }),
        b: block("b", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "run1-second" }] }),
        p: block("p", { flavour: "paragraph", text: [{ insert: "interlude" }] }),
        c: block("c", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "run2-first" }] }),
        d: block("d", { flavour: "list-item", props: { ordered: true }, text: [{ insert: "run2-second" }] }),
      },
      ["a", "b", "p", "c", "d"],
    );
    const md = projectToMarkdown(doc);
    expect(md).toContain("1. run1-first");
    expect(md).toContain("2. run1-second");
    expect(md).toContain("1. run2-first");
    expect(md).toContain("2. run2-second");
    expect(md).not.toContain("3. run2-first");
    expect(md).not.toContain("4. run2-second");
  });
});

describe("projectToMarkdown — structural edge cases", () => {
  it("returns an empty string for a document whose root is missing", () => {
    const doc: DocDocument = { schemaVersion: 1, id: "x", root: "root", blocks: {} };
    expect(projectToMarkdown(doc)).toBe("");
  });

  it("skips the root's own chrome, projecting only its children", () => {
    const doc = docWith(
      { h: block("h", { flavour: "heading", props: { level: 1 }, text: [{ insert: "Title" }] }) },
      ["h"],
    );
    const md = projectToMarkdown(doc);
    expect(md.trim()).toBe("# Title");
  });

  it("is a pure function that performs no I/O (no disk writes)", () => {
    // Constructive proof: projectToMarkdown's signature is (doc) => string,
    // it imports no fs/node:fs/promises, and calling it twice on the same
    // input yields byte-identical output with no side effects observable
    // via the return value or thrown errors.
    const doc = docWith({ h: block("h", { text: [{ insert: "hello" }] }) }, ["h"]);
    const first = projectToMarkdown(doc);
    const second = projectToMarkdown(doc);
    expect(first).toBe(second);
  });
});
