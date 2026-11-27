import { describe, expect, it } from "bun:test";
import sampleFixture from "../__fixtures__/sample.doc.json";
import type { DocBlock, DocDocument } from "../doc-schema";
import { validateDocDocument } from "../doc-schema";
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

describe("projectToMarkdown — the sample fixture", () => {
  const validated = validateDocDocument(sampleFixture);
  if (!validated.ok) throw new Error("sample.doc.json fixture failed validation");
  const markdown = projectToMarkdown(validated.document);

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

  it("projects a fenced code block with language, followed by its annotation lines", () => {
    expect(markdown).toContain(
      "```typescript\nexport const answer = 42;\nexport const double = () =>\n  answer * 2;\n```\n" +
        "> **L1 (Export):** The canonical answer constant.\n" +
        "> **L2-3:** Helper that doubles the answer.",
    );
  });

  it("projects a plain paragraph without a blockquote marker", () => {
    expect(markdown).toContain("\nStable ids are a system invariant.\n");
    expect(markdown).not.toContain("> Stable ids are a system invariant.");
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

  it.each([
    ["projects a video as a labeled blockquote, greppable on '> **Video'", () => {
      expect(markdown).toContain(
        "> **Video: Docs walkthrough** — https://www.youtube.com/watch?v=dQw4w9WgXcQ — An external video (YouTube).",
      );
      expect(markdown.match(/^> \*\*Video/m)).not.toBeNull();
    }],
    ["url wins over src when both are present", () => {
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
    }],
    ["falls back to the bundle-relative src when url is absent", () => {
      const doc = docWith(
        { v: block("v", { type: "video", props: { src: "./assets/videos/demo.mp4" } }) },
        ["v"],
      );
      expect(projectToMarkdown(doc)).toContain("> **Video** — ./assets/videos/demo.mp4");
    }],
    ["projects the bare label when neither url nor src is present", () => {
      const doc = docWith(
        { v: block("v", { type: "video", props: { title: "Missing target" } }) },
        ["v"],
      );
      expect(projectToMarkdown(doc)).toContain("> **Video: Missing target**");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

  it("projects a structured-table as a bold title line plus a markdown pipe table", () => {
    expect(markdown).toContain(
      "**Structured table sample**\n\n" +
        "| Name | Value |\n" +
        "| --- | --- |\n" +
        "| answer | 42 |\n" +
        "| question | unknown |",
    );
  });

  it.each([
    ["projects an interaction-surface as bold title plus a fenced block of signature lines", () => {
      expect(markdown).toContain(
        "**File-tree block surface**\n\n" +
          "```\n" +
          "[action] file-tree.addEntry(path: string, note?: string, change?: string) -> props patch  # Append a path entry to the tree\n" +
          "  path: string  # /-separated path\n" +
          "  note?: string\n" +
          "  change?: string\n" +
          "[action] file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath\n" +
          "[action] file-tree.removeEntry(path: string)\n" +
          "```",
      );
    }],
    ["prefixes [kind] on every operation; an operation without a kind is an action", () => {
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
      const md = projectToMarkdown(
        surfaceDoc([
          { name: "state.reset", kind: "action" },
          { name: "state.clear" },
          { name: "state.snapshot", kind: "query", returns: "State" },
          { name: "state.changed", kind: "event", description: "Fires after every applied op" },
        ]),
      );
      expect(md).toContain(
        "```\n" +
          "[action] state.reset()\n" +
          "[action] state.clear()\n" +
          "[query] state.snapshot() -> State\n" +
          "[event] state.changed()  # Fires after every applied op\n" +
          "```",
      );
    }],
    ["renders params as name[?][: type] and skips malformed operations", () => {
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
    }],
    ["projects only the bold title when no operations survive", () => {
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
      const md = projectToMarkdown(surfaceDoc([], "Empty surface"));
      expect(md).toContain("**Empty surface**");
      expect(md).not.toContain("```");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

  it.each([
    ["projects a file-tree as a fenced tree rendering with guides, markers, and notes", () => {
      expect(markdown).toContain(
        "```\n" +
          "  src/\n" +
          "  ├── components/docs/\n" +
          "> │   └── src/components/docs/BlockRenderer.tsx -> DocBlockRenderer.tsx\n" +
          "  └── lib/\n" +
          "      ├── docs-model/\n" +
          "~     │   ├── doc-ops.ts  # typed ops + inverses\n" +
          "+     │   └── doc-schema.ts  # types + validation\n" +
          "-     └── legacy/  # dead code purge\n" +
          "  README.md\n" +
          "```",
      );
    }],
    ["derives directories from path prefixes and nests with guides (dirs first, then alphabetical)", () => {
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
    }],
    ["does not pad lines when no entry carries a change marker", () => {
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
      const md = projectToMarkdown(treeDoc([{ path: "a/b.ts" }]));
      expect(md).toContain("```\na/\n└── b.ts\n```");
    }],
    ["respects an explicit trailing-/ entry as a (possibly empty) directory", () => {
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
      const md = projectToMarkdown(treeDoc([{ path: "empty-dir/" }, { path: "file.ts" }]));
      // Directory first, then the file — the explicit dir keeps its trailing /.
      expect(md).toContain("```\nempty-dir/\nfile.ts\n```");
    }],
    ["prefixes change markers, pads unmarked lines, and appends notes as '  # note'", () => {
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
    }],
    ["prints a chain of single-child folders as one compact line", () => {
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
      const md = projectToMarkdown(treeDoc([{ path: "packages/docs-model/src/a.ts" }, { path: "packages/docs-model/src/b.ts" }]));
      expect(md).toContain("```\npackages/docs-model/src/\n├── a.ts\n└── b.ts\n```");
    }],
    ["keeps a folder on its own line when it carries a note, change or color, or its only child is a file", () => {
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
      const md = projectToMarkdown(
        treeDoc([
          { path: "noted/", note: "why" },
          { path: "noted/inner/x.ts" },
          { path: "colored/", color: "blue" },
          { path: "colored/inner/y.ts" },
          { path: "moved/added/", change: "added" },
          { path: "lone/z.ts" },
        ]),
      );
      expect(md).toContain(
        "```\n" +
          "  colored/\n" +
          "  └── inner/\n" +
          "      └── y.ts\n" +
          "  lone/\n" +
          "  └── z.ts\n" +
          "  moved/\n" +
          "+ └── added/\n" +
          "  noted/  # why\n" +
          "  └── inner/\n" +
          "      └── x.ts\n" +
          "```",
      );
    }],
    ["renders a renamed entry as '{from} -> {name}' behind the '>' marker", () => {
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
      const md = projectToMarkdown(
        treeDoc([{ path: "src/new-name.ts", change: "renamed", from: "src/old-name.ts" }]),
      );
      expect(md).toContain("  src/\n> └── src/old-name.ts -> new-name.ts");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("projectToMarkdown — callout labels", () => {
  it.each([
    ["falls back to the uppercased tone when kind is absent", () => {
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
    }],
    ["projects a callout with kind winning over tone, greppable on '> **Decision'", () => {
      const validated = validateDocDocument(sampleFixture);
      if (!validated.ok) throw new Error("sample.doc.json fixture failed validation");
      const markdown = projectToMarkdown(validated.document);
      expect(markdown).toContain(
        "> **Decision: Heads up** — Annotations live in annotations.json, never in doc.json.",
      );
      expect(markdown.match(/^> \*\*Decision/m)).not.toBeNull();
      // kind wins: the tone-derived label must not appear for this block.
      expect(markdown).not.toContain("> **INFO");
    }],
    ["defaults to INFO when neither kind nor tone is present", () => {
      const doc = docWith(
        { c: block("c", { type: "callout", text: [{ insert: "body" }] }) },
        ["c"],
      );
      expect(projectToMarkdown(doc)).toContain("> **INFO** — body");
    }],
    ["uses kind verbatim as the label when present", () => {
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
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("projectToMarkdown — callout children", () => {
  it("keeps a callout's child list inside its quote, and the next block outside it", () => {
    const doc = docWith(
      {
        c: block("c", {
          type: "callout",
          props: { tone: "warning", title: "Rules" },
          text: [{ insert: "Two rules." }],
          children: ["r1", "r2"],
        }),
        r1: block("r1", { type: "list-item", props: { ordered: true }, text: [{ insert: "First rule." }] }),
        r2: block("r2", { type: "list-item", props: { ordered: true }, text: [{ insert: "Second rule." }] }),
        after: block("after", { text: [{ insert: "After the callout." }] }),
      },
      ["c", "after"],
    );
    expect(projectToMarkdown(doc)).toBe(
      "> **WARNING: Rules** — Two rules.\n>\n> 1. First rule.\n>\n> 2. Second rule.\n\nAfter the callout.\n",
    );
  });
});

describe("projectToMarkdown — ordered lists", () => {
  it.each([
    ["numbers list-items when props.ordered is true", () => {
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
    }],
    ["projects nested list items with 2-space indentation per depth", () => {
      const validated = validateDocDocument(sampleFixture);
      if (!validated.ok) throw new Error("sample.doc.json fixture failed validation");
      const markdown = projectToMarkdown(validated.document);
      expect(markdown).toContain("- First item");
      expect(markdown).toContain("  - Nested item under the first");
      expect(markdown).toContain("- Second item");
    }],
    ["defaults to '-' bullets when ordered is absent", () => {
      const doc = docWith(
        { a: block("a", { type: "list-item", text: [{ insert: "item" }] }) },
        ["a"],
      );
      expect(projectToMarkdown(doc)).toContain("- item");
    }],
    ["numbers from 1 even when non-list siblings precede the run (heading + ordered items)", () => {
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
    }],
    ["restarts numbering at 1 for each ordered run split by a non-list block", () => {
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
    }],
    ["emits [ ] for an open task and [x] for a done task", () => {
      const doc = docWith(
        {
          a: block("a", { type: "list-item", props: { checked: false }, text: [{ insert: "Install Bun." }] }),
          b: block("b", { type: "list-item", props: { checked: true }, text: [{ insert: "Retire the key." }] }),
        },
        ["a", "b"],
      );
      const md = projectToMarkdown(doc);
      expect(md).toContain("- [ ] Install Bun.");
      expect(md).toContain("- [x] Retire the key.");
    }],
    ["puts the box after the number on ordered task items", () => {
      const doc = docWith(
        {
          a: block("a", { type: "list-item", props: { ordered: true, checked: false }, text: [{ insert: "first" }] }),
          b: block("b", { type: "list-item", props: { ordered: true, checked: true }, text: [{ insert: "second" }] }),
        },
        ["a", "b"],
      );
      const md = projectToMarkdown(doc);
      expect(md).toContain("1. [ ] first");
      expect(md).toContain("2. [x] second");
    }],
    ["indents nested task items and leaves plain siblings box-free", () => {
      const doc = docWith(
        {
          a: block("a", { type: "list-item", props: { checked: false }, text: [{ insert: "parent" }], children: ["c"] }),
          c: block("c", { type: "list-item", props: { checked: true }, text: [{ insert: "child" }] }),
          d: block("d", { type: "list-item", text: [{ insert: "plain" }] }),
        },
        ["a", "d"],
      );
      const md = projectToMarkdown(doc);
      expect(md).toContain("- [ ] parent");
      expect(md).toContain("  - [x] child");
      expect(md).toContain("- plain");
      expect(md).not.toContain("- [ ] plain");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
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
});
