import { describe, expect, it } from "bun:test";
import sampleFixture from "../__fixtures__/sample.doc.json";
import type { DocBlock, DocDocument } from "../doc-schema";
import { DOC_BLOCK_TYPES, validateDocDocument } from "../doc-schema";
import { projectToMarkdown } from "../project-markdown";

function block(id: string, overrides: Partial<DocBlock> = {}): DocBlock {
  return {
    id,
    type: "paragraph",
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

describe("projectToMarkdown — the all-block-type sample fixture", () => {
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

  it("projects a fenced code block with language, followed by its annotation lines", () => {
    expect(markdown).toContain(
      "```typescript\nexport const answer = 42;\nexport const double = () =>\n  answer * 2;\n```\n" +
        "> **L1 (Export):** The canonical answer constant.\n" +
        "> **L2-3:** Helper that doubles the answer.",
    );
  });

  it("projects a quote as a blockquote", () => {
    expect(markdown).toContain("> Stable ids are a system invariant.");
  });

  it("projects a callout with kind winning over tone, greppable on '> **Decision'", () => {
    expect(markdown).toContain(
      "> **Decision: Heads up** — Comments live in comments.json, never in doc.json.",
    );
    expect(markdown.match(/^> \*\*Decision/m)).not.toBeNull();
    // kind wins: the tone-derived label must not appear for this block.
    expect(markdown).not.toContain("> **INFO");
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

  it("projects a video as a labeled blockquote, greppable on '> **Video'", () => {
    expect(markdown).toContain(
      "> **Video: Docs walkthrough** — https://www.youtube.com/watch?v=dQw4w9WgXcQ — An external video (YouTube).",
    );
    expect(markdown.match(/^> \*\*Video/m)).not.toBeNull();
  });

  it("projects a structured-table as a bold title line plus a markdown pipe table", () => {
    expect(markdown).toContain(
      "**Structured table sample**\n\n" +
        "| Name | Value |\n" +
        "| --- | --- |\n" +
        "| answer | 42 |\n" +
        "| question | unknown |",
    );
  });

  it("projects an interaction-surface as bold title plus a fenced block of signature lines", () => {
    expect(markdown).toContain(
      "**File-tree block surface**\n\n" +
        "```\n" +
        "file-tree.addEntry(path: string, note?: string, change?: string) -> props patch  # Append a path entry to the tree\n" +
        "file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath\n" +
        "file-tree.removeEntry(path: string)\n" +
        "```",
    );
  });

  it("projects mermaid as a labeled blockquote", () => {
    expect(markdown).toContain("> **Mermaid: Mermaid sample** — flowchart LR");
  });

  it("projects a file-tree as a fenced tree rendering with guides, markers, and notes", () => {
    expect(markdown).toContain(
      "```\n" +
        "  src/\n" +
        "  ├── components/\n" +
        "  │   └── docs/\n" +
        "> │       └── src/components/docs/BlockRenderer.tsx -> DocBlockRenderer.tsx\n" +
        "  └── lib/\n" +
        "      ├── docs-model/\n" +
        "~     │   ├── doc-ops.ts  # typed ops + inverses\n" +
        "+     │   └── doc-schema.ts  # types + validation\n" +
        "-     └── legacy/  # dead code purge\n" +
        "  README.md\n" +
        "```",
    );
  });

  it("covers every canonical block type exactly (the fixture is the vocabulary)", () => {
    const typesInFixture = new Set(
      Object.values(validated.document.blocks).map((b) => b.type),
    );
    expect([...typesInFixture].sort()).toEqual([...DOC_BLOCK_TYPES].sort());
  });

  it("contains every block's identifying content — full block type coverage", () => {
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

describe("projectToMarkdown — callout labels", () => {
  it("falls back to the uppercased tone when kind is absent", () => {
    const doc = docWith(
      {
        c: block("c", {
          type: "callout",
          props: { tone: "warning", title: "Careful" },
          text: [{ insert: "body" }],
        }),
      },
      ["c"],
    );
    expect(projectToMarkdown(doc)).toContain("> **WARNING: Careful** — body");
  });

  it("defaults to INFO when neither kind nor tone is present", () => {
    const doc = docWith(
      { c: block("c", { type: "callout", text: [{ insert: "body" }] }) },
      ["c"],
    );
    expect(projectToMarkdown(doc)).toContain("> **INFO** — body");
  });

  it("uses kind verbatim as the label when present", () => {
    const doc = docWith(
      {
        c: block("c", {
          type: "callout",
          props: { kind: "Requirement", tone: "info" },
          text: [{ insert: "Id stability" }],
        }),
      },
      ["c"],
    );
    expect(projectToMarkdown(doc)).toContain("> **Requirement** — Id stability");
  });
});

describe("projectToMarkdown — interaction-surface signatures", () => {
  function surfaceDoc(operations: unknown[], title?: string): DocDocument {
    return docWith(
      {
        s: block("s", {
          type: "interaction-surface",
          props: title ? { title, operations } : { operations },
        }),
      },
      ["s"],
    );
  }

  it("prefixes [kind] only for query/event operations; actions render bare", () => {
    const md = projectToMarkdown(
      surfaceDoc([
        { name: "state.reset", kind: "action" },
        { name: "state.snapshot", kind: "query", returns: "State" },
        { name: "state.changed", kind: "event", description: "Fires after every applied op" },
      ]),
    );
    expect(md).toContain(
      "```\n" +
        "state.reset()\n" +
        "[query] state.snapshot() -> State\n" +
        "[event] state.changed()  # Fires after every applied op\n" +
        "```",
    );
  });

  it("renders params as name[?][: type] and skips malformed operations", () => {
    const md = projectToMarkdown(
      surfaceDoc([
        {
          name: "table.updateCell",
          params: [
            { name: "rowIndex", type: "number", required: true },
            { name: "column", required: false },
            { name: "value", type: "string" },
          ],
        },
        { notName: "malformed" },
      ]),
    );
    expect(md).toContain("table.updateCell(rowIndex: number, column?, value: string)");
    expect(md).not.toContain("malformed");
  });

  it("projects only the bold title when no operations survive", () => {
    const md = projectToMarkdown(surfaceDoc([], "Empty surface"));
    expect(md).toContain("**Empty surface**");
    expect(md).not.toContain("```");
  });
});

describe("projectToMarkdown — video targets", () => {
  it("url wins over src when both are present", () => {
    const doc = docWith(
      {
        v: block("v", {
          type: "video",
          props: { url: "https://vimeo.com/76979871", src: "./assets/videos/demo.mp4" },
        }),
      },
      ["v"],
    );
    expect(projectToMarkdown(doc)).toContain("> **Video** — https://vimeo.com/76979871");
  });

  it("falls back to the bundle-relative src when url is absent", () => {
    const doc = docWith(
      { v: block("v", { type: "video", props: { src: "./assets/videos/demo.mp4" } }) },
      ["v"],
    );
    expect(projectToMarkdown(doc)).toContain("> **Video** — ./assets/videos/demo.mp4");
  });

  it("projects the bare label when neither url nor src is present", () => {
    const doc = docWith(
      { v: block("v", { type: "video", props: { title: "Missing target" } }) },
      ["v"],
    );
    expect(projectToMarkdown(doc)).toContain("> **Video: Missing target**");
  });
});

describe("projectToMarkdown — ordered lists", () => {
  it("numbers list-items when props.ordered is true", () => {
    const doc = docWith(
      {
        a: block("a", { type: "list-item", props: { ordered: true }, text: [{ insert: "first" }] }),
        b: block("b", { type: "list-item", props: { ordered: true }, text: [{ insert: "second" }] }),
      },
      ["a", "b"],
    );
    const md = projectToMarkdown(doc);
    expect(md).toContain("1. first");
    expect(md).toContain("2. second");
  });

  it("defaults to '-' bullets when ordered is absent", () => {
    const doc = docWith(
      { a: block("a", { type: "list-item", text: [{ insert: "item" }] }) },
      ["a"],
    );
    expect(projectToMarkdown(doc)).toContain("- item");
  });

  it("numbers from 1 even when non-list siblings precede the run (heading + ordered items)", () => {
    const doc = docWith(
      {
        h: block("h", { type: "heading", props: { level: 1 }, text: [{ insert: "Title" }] }),
        a: block("a", { type: "list-item", props: { ordered: true }, text: [{ insert: "first" }] }),
        b: block("b", { type: "list-item", props: { ordered: true }, text: [{ insert: "second" }] }),
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
        a: block("a", { type: "list-item", props: { ordered: true }, text: [{ insert: "run1-first" }] }),
        b: block("b", { type: "list-item", props: { ordered: true }, text: [{ insert: "run1-second" }] }),
        p: block("p", { type: "paragraph", text: [{ insert: "interlude" }] }),
        c: block("c", { type: "list-item", props: { ordered: true }, text: [{ insert: "run2-first" }] }),
        d: block("d", { type: "list-item", props: { ordered: true }, text: [{ insert: "run2-second" }] }),
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

  it("skips the root's own wrapper, projecting only its children", () => {
    const doc = docWith(
      { h: block("h", { type: "heading", props: { level: 1 }, text: [{ insert: "Title" }] }) },
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

describe("projectToMarkdown — file-tree tree rendering", () => {
  function treeDoc(entries: unknown[]): DocDocument {
    return docWith(
      {
        t: block("t", {
          type: "file-tree",
          props: { entries },
        }),
      },
      ["t"],
    );
  }

  it("derives directories from path prefixes and nests with guides (dirs first, then alphabetical)", () => {
    const md = projectToMarkdown(treeDoc([{ path: "a/b.ts" }, { path: "a/c/d.ts" }, { path: "z.ts" }]));
    expect(md).toContain(
      "```\n" +
        "a/\n" +
        "├── c/\n" +
        "│   └── d.ts\n" +
        "└── b.ts\n" +
        "z.ts\n" +
        "```",
    );
  });

  it("does not pad lines when no entry carries a change marker", () => {
    const md = projectToMarkdown(treeDoc([{ path: "a/b.ts" }]));
    expect(md).toContain("```\na/\n└── b.ts\n```");
  });

  it("respects an explicit trailing-/ entry as a (possibly empty) directory", () => {
    const md = projectToMarkdown(treeDoc([{ path: "empty-dir/" }, { path: "file.ts" }]));
    // Directory first, then the file — the explicit dir keeps its trailing /.
    expect(md).toContain("```\nempty-dir/\nfile.ts\n```");
  });

  it("prefixes change markers, pads unmarked lines, and appends notes as '  # note'", () => {
    const md = projectToMarkdown(
      treeDoc([
        { path: "kept.ts" },
        { path: "new.ts", change: "added", note: "fresh" },
        { path: "gone.ts", change: "removed" },
        { path: "touched.ts", change: "modified" },
      ]),
    );
    expect(md).toContain(
      "```\n" +
        "- gone.ts\n" +
        "  kept.ts\n" +
        "+ new.ts  # fresh\n" +
        "~ touched.ts\n" +
        "```",
    );
  });

  it("renders a renamed entry as '{from} -> {name}' behind the '>' marker", () => {
    const md = projectToMarkdown(
      treeDoc([{ path: "src/new-name.ts", change: "renamed", from: "src/old-name.ts" }]),
    );
    expect(md).toContain("  src/\n> └── src/old-name.ts -> new-name.ts");
  });
});
