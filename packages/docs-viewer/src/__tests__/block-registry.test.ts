import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "../render/DocBlockRenderer";
import {
  deltaToMarkdown,
  deltaToPlainText,
  type DocBlockRenderContext,
  getDocBlockDescriptor,
} from "../render/block-registry";

/** Minimal render context — enough to drive descriptors directly. */
function makeCtx(overrides: Partial<DocBlockRenderContext> = {}): DocBlockRenderContext {
  return {
    renderText: () => null,
    renderChildren: () => null,
    renderMarkdown: () => null,
    ...overrides,
  };
}

function block(blockType: DocBlock["type"], props: Record<string, unknown> = {}): DocBlock {
  return { id: `${blockType}-1`, type: blockType, props, children: [] };
}

/** Wraps a single block in a minimal one-page DocDocument. */
function singleBlockDoc(example: DocBlock): DocDocument {
  return {
    schemaVersion: 1,
    id: `registry-${example.type}`,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: [example.id] },
      [example.id]: example,
    },
  };
}

describe("block registry", () => {
  it("resolves a descriptor for every doc.json block type", () => {
    for (const blockType of DOC_BLOCK_TYPES) {
      const descriptor = getDocBlockDescriptor(blockType);
      expect(descriptor).not.toBeNull();
      if (!descriptor) continue;
      expect(descriptor.type).toBe(blockType);
      expect(descriptor.targetKind.length).toBeGreaterThan(0);
      expect(descriptor.agentDescription.length).toBeGreaterThan(0);
      expect(descriptor.patchOps.length).toBeGreaterThan(0);
      expect(typeof descriptor.render).toBe("function");
    }
  });

  it("reuses the docs-block component metadata for adapted block types", () => {
    expect(getDocBlockDescriptor("callout")?.label).toBe("Callout");
    expect(getDocBlockDescriptor("file-tree")?.label).toBe("File Tree");
    expect(getDocBlockDescriptor("structured-table")?.label).toBe("Structured Table");
    expect(getDocBlockDescriptor("interaction-surface")?.label).toBe("Interaction Surface");
    expect(getDocBlockDescriptor("interaction-surface")?.targetKind).toBe("interaction-surface");
    expect(getDocBlockDescriptor("mermaid")?.label).toBe("Mermaid");
  });

  it("returns null for unknown and retired block types", () => {
    expect(getDocBlockDescriptor("wormhole")).toBeNull();
    // Retired types never reach the registry: doc-schema validation coerces
    // them to callout, so the registry must not resurrect descriptors.
    for (const retired of [
      "decision",
      "checklist",
      "attachment",
      "agent-contract",
      "tabs",
      "data-model",
      "api-surface",
    ]) {
      expect(getDocBlockDescriptor(retired)).toBeNull();
    }
  });

  it("appends a body-format hint to the parse-reuse block types' agentDescription", () => {
    expect(getDocBlockDescriptor("mermaid")?.agentDescription).toContain("flowchart LR");
    expect(getDocBlockDescriptor("code")?.agentDescription).toContain("annotations");
  });
});

describe("file-tree — mdx adapter + tree rendering", () => {
  function fileTreeDoc(props: Record<string, unknown>): DocDocument {
    return singleBlockDoc({ id: "tree-1", type: "file-tree", props, children: [] });
  }

  function renderTree(props: Record<string, unknown>): string {
    return renderToStaticMarkup(
      createElement(DocBlockRenderer, { document: fileTreeDoc(props) }),
    );
  }

  it("documents the v2 entry fields in the agentDescription", () => {
    const description = getDocBlockDescriptor("file-tree")?.agentDescription ?? "";
    expect(description).toContain("change?");
    expect(description).toContain("renamed");
    expect(description).toContain("from?");
    expect(description).toContain('trailing "/"');
  });

  it("nests flat paths and renders tree-style guide glyphs", () => {
    const html = renderTree({
      title: "Layout",
      entries: [
        { path: "src/runtime/registry.ts" },
        { path: "src/runtime/dispatch.ts" },
        { path: "src/index.ts" },
      ],
    });
    expect(html).toContain('data-docs-block-type="file-tree"');
    expect(html).toContain('data-source-id="tree-1"');
    expect(html).toContain('class="not-prose my-4"');
    expect(html).toContain("Layout");
    expect(html).toContain('class="mb-1.5 text-sm font-medium text-foreground"');
    expect(html).not.toContain("File Tree");
    expect(html).not.toContain("3 entries");
    // Derived directories from prefixes + guide glyphs at each depth.
    expect(html).toContain("└── ");
    expect(html).toContain("├── ");
    expect(html).toContain("│   ");
    // Rows show basenames; full paths live in the entry data attribute.
    expect(html).toContain('data-docs-file-tree-entry="src/runtime/registry.ts"');
    expect(html).toContain('data-docs-file-tree-entry="src/index.ts"');
    expect(html).toContain(">registry.ts</span>");
    // Derived dirs render with a trailing slash and no entry attribute.
    expect(html).toContain(">runtime/</span>");
    expect(html).not.toContain('data-docs-file-tree-entry="src/"');
  });

  it("sorts directories before files, then alphabetically", () => {
    const html = renderTree({
      entries: [
        { path: "zeta.ts" },
        { path: "alpha.ts" },
        { path: "beta/inner.ts" },
      ],
    });
    const beta = html.indexOf(">beta/</span>");
    const alpha = html.indexOf(">alpha.ts</span>");
    const zeta = html.indexOf(">zeta.ts</span>");
    expect(beta).toBeGreaterThan(-1);
    expect(alpha).toBeGreaterThan(beta);
    expect(zeta).toBeGreaterThan(alpha);
  });

  it("respects explicit trailing-/ directory entries (with metadata)", () => {
    const html = renderTree({
      entries: [
        { path: "docs/", note: "empty for now" },
        { path: "src/main.ts" },
      ],
    });
    expect(html).toContain('data-docs-file-tree-entry="docs/"');
    expect(html).toContain(">docs/</span>");
    expect(html).toContain("# empty for now");
  });

  it("renders diff markers and tints per change state", () => {
    const html = renderTree({
      entries: [
        { path: "src/a.ts", change: "added" },
        { path: "src/b.ts", change: "removed" },
        { path: "src/c.ts", change: "modified" },
      ],
    });
    expect(html).toContain('data-docs-file-tree-change="added"');
    expect(html).toContain(">+</span>");
    expect(html).toContain("bg-emerald-500/10");
    expect(html).toContain('data-docs-file-tree-change="removed"');
    expect(html).toContain(">-</span>");
    expect(html).toContain("bg-rose-500/10");
    expect(html).toContain("line-through");
    expect(html).toContain('data-docs-file-tree-change="modified"');
    expect(html).toContain(">~</span>");
    expect(html).toContain("bg-amber-500/10");
    // Derived parent dirs never carry change state: the first change attr in
    // the markup appears only after the derived `src/` directory row.
    const srcRow = html.indexOf(">src/</span>");
    expect(srcRow).toBeGreaterThan(-1);
    expect(html.slice(0, srcRow)).not.toContain("data-docs-file-tree-change");
  });

  it("renders renamed entries as struck from → name with the sky tint", () => {
    const html = renderTree({
      entries: [
        { path: "src/agents/planner.ts", change: "renamed", from: "src/agents/orchestrator.ts" },
      ],
    });
    expect(html).toContain('data-docs-file-tree-change="renamed"');
    expect(html).toContain("bg-sky-500/10");
    expect(html).toContain(">src/agents/orchestrator.ts</span>");
    expect(html).toContain("line-through");
    expect(html).toContain("→");
    expect(html).toContain(">planner.ts</span>");
  });

  it("renders notes as muted # comments with a title attribute", () => {
    const html = renderTree({
      entries: [{ path: "src/registry.ts", note: "single tool registry" }],
    });
    expect(html).toContain("# single tool registry");
    expect(html).toContain('title="single tool registry"');
  });

  it("keeps rendering plain v1 { path } entries (backward compat)", () => {
    const html = renderTree({
      entries: [{ path: "src/lib/doc-ops.ts" }, { path: "README.md" }],
    });
    expect(html).toContain('data-docs-file-tree-entry="src/lib/doc-ops.ts"');
    expect(html).toContain(">doc-ops.ts</span>");
    expect(html).toContain(">README.md</span>");
    expect(html).not.toContain("data-docs-file-tree-change");
  });

  it("filters malformed entries and strips malformed optional fields without crashing", () => {
    const html = renderTree({
      entries: [
        null,
        "not an object",
        { note: "no path" },
        { path: 42 },
        { path: "ok.ts", change: "exploded", note: 7, from: 3 },
        { path: "   " },
      ],
    });
    expect(html).toContain('data-docs-file-tree-entry="ok.ts"');
    expect(html).not.toContain("data-docs-file-tree-change");
    expect(html).not.toContain("1 entry");
  });

  it("renders the empty-tree placeholder when entries are absent or not an array", () => {
    for (const props of [{}, { entries: "nope" }, { entries: [] }]) {
      const html = renderTree(props as Record<string, unknown>);
      expect(html).toContain('data-docs-block-type="file-tree"');
      expect(html).not.toContain("0 entries");
      expect(html).toContain("(no entries)");
    }
  });
});

describe("structured-table / interaction-surface — props-driven descriptors", () => {
  it("structured-table renders the component from typed props", () => {
    const doc = singleBlockDoc({
      id: "table-1",
      type: "structured-table",
      props: {
        title: "Agent roster",
        density: "compact",
        columns: ["Agent", "Model"],
        rows: [["planner", "fable-5"], ["worker"]],
      },
      children: [],
    });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).toContain('data-doc-block="structured-table"');
    expect(html).toContain('data-docs-block-type="structured-table"');
    expect(html).toContain("Agent roster");
    expect(html).toContain("planner");
    expect(html).not.toContain("Invalid Structured Table block");
  });

  it("structured-table falls back to the placeholder on malformed columns/rows", () => {
    for (const props of [
      {}, // no columns at all
      { columns: ["A"], rows: [[1]] }, // non-string cell
      { columns: [], rows: [] }, // empty header
      { columns: ["A"], rows: "nope" }, // rows not an array
    ]) {
      const doc = singleBlockDoc({
        id: "table-1",
        type: "structured-table",
        props: props as Record<string, unknown>,
        children: [],
      });
      const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
      expect(html).toContain("Invalid Structured Table block");
      expect(html).toContain('data-block-id="table-1"');
      expect(html).not.toContain('data-docs-block-type="structured-table"');
    }
  });

  it("interaction-surface renders operation signatures from typed props", () => {
    const doc = singleBlockDoc({
      id: "surface-1",
      type: "interaction-surface",
      props: {
        title: "File-tree block surface",
        operations: [
          {
            name: "file-tree.addEntry",
            description: "Append a path entry",
            params: [
              { name: "path", type: "string", required: true },
              { name: "note", type: "string", required: false },
            ],
            returns: "props patch",
            kind: "action",
          },
          { name: "file-tree.entries", returns: "FileTreeEntry[]", kind: "query" },
        ],
      },
      children: [],
    });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).toContain('data-doc-block="interaction-surface"');
    expect(html).toContain('data-docs-block-type="interaction-surface"');
    expect(html).toContain('data-interaction-operation="file-tree.addEntry"');
    expect(html).toContain("Append a path entry");
    expect(html).toContain("File-tree block surface");
    // The signature is colorized token-by-token (data-sig-token spans), but
    // its flat text is still the full `name(params) -> returns` signature.
    const signatureText = html.replace(/<[^>]+>/g, "").replace(/&gt;/g, ">");
    expect(signatureText).toContain(
      "file-tree.addEntry(path: string, note?: string) -> props patch",
    );
    expect(html).toContain('data-sig-token="name"');
    expect(html).toContain(">query<");
    expect(html).not.toContain("Invalid Interaction Surface block");
  });

  it("interaction-surface falls back to the placeholder on malformed operations", () => {
    for (const operations of [
      undefined, // absent
      [], // empty
      [{ params: [] }], // operation without a name
      [{ name: "op", kind: "mutation" }], // unknown kind
      [{ name: "op", params: [{ type: "string" }] }], // param without a name
      [{ name: "op", params: "nope" }], // params not an array
    ]) {
      const doc = singleBlockDoc({
        id: "surface-1",
        type: "interaction-surface",
        props: operations === undefined ? {} : { operations },
        children: [],
      });
      const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
      expect(html).toContain("Invalid Interaction Surface block");
      expect(html).toContain('data-block-id="surface-1"');
      expect(html).not.toContain('data-docs-block-type="interaction-surface"');
    }
  });
});

describe("code — optional props.annotations", () => {
  function codeDoc(props: Record<string, unknown>): DocDocument {
    return singleBlockDoc({
      id: "code-1",
      type: "code",
      props,
      text: [{ insert: "const a = 1;\nconst b = 2;\nconst c = a + b;" }],
      children: [],
    });
  }

  it("renders the annotated code block when valid annotations exist", () => {
    const doc = codeDoc({
      language: "ts",
      annotations: [
        { lines: "1", label: "Setup", note: "Declares the first operand." },
        { lines: "3", note: "The sum." },
      ],
    });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).toContain('data-doc-block="code"');
    expect(html).toContain('data-code-annotations="code-1"');
    expect(html).toContain("Declares the first operand.");
    // Code text survives highlighting (hljs token spans split the raw text,
    // so compare with tags stripped) and carries ts token spans.
    expect(html.replace(/<[^>]+>/g, "")).toContain("const c = a + b;");
    expect(html).toContain("hljs-keyword");
  });

  it("skips malformed annotation entries but keeps the valid ones", () => {
    const doc = codeDoc({
      annotations: [
        { lines: 2, note: "numeric lines — malformed" },
        { lines: "2", note: "" }, // empty note — malformed
        { lines: "2", note: "The second operand." },
        "not an object",
      ],
    });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).toContain('data-code-annotations="code-1"');
    expect(html).toContain("The second operand.");
    expect(html).not.toContain("malformed");
  });

  it("keeps the plain pre path when annotations are absent or entirely malformed", () => {
    for (const props of [
      {},
      { annotations: [] },
      { annotations: [{ lines: 4, note: 7 }] },
      { annotations: "nope" },
    ]) {
      const doc = codeDoc(props as Record<string, unknown>);
      const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
      expect(html).toContain('data-doc-block="code"');
      expect(html).not.toContain("data-code-annotations");
      expect(html).toContain("<pre");
      expect(html).toContain("const a = 1;");
      expect(html).toContain('class="hljs"');
    }
  });
});

describe("code — syntax highlighting on the plain path", () => {
  function codeDoc(text: string, props: Record<string, unknown> = {}): DocDocument {
    return singleBlockDoc({
      id: "code-1",
      type: "code",
      props,
      text: [{ insert: text }],
      children: [],
    });
  }

  it("renders hljs token spans for a declared language", () => {
    const doc = codeDoc("const a = 1;", { language: "ts" });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).toContain('data-language="ts"');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">1</span>');
    expect(html.replace(/<[^>]+>/g, "")).toContain("const a = 1;");
  });

  it("pretty-prints one-liner JSON into nested form (display only) with tokens", () => {
    const doc = codeDoc('{"name":"app","ok":true}', { language: "json" });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    const text = html.replace(/<[^>]+>/g, "");
    // Nested multi-line structure, never the one-liner (hljs escapes quotes).
    expect(text).toContain("{\n  &quot;name&quot;: &quot;app&quot;,\n  &quot;ok&quot;: true\n}");
    expect(html).toContain("hljs-attr");
  });

  it("escapes markup in code with no matching grammar", () => {
    const doc = codeDoc('<script>alert("x")</script>', { language: "klingon" });
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("delta projections", () => {
  it("projects marks to markdown", () => {
    expect(
      deltaToMarkdown([
        { insert: "plain " },
        { insert: "bold", attributes: { bold: true } },
        { insert: " and " },
        { insert: "code", attributes: { code: true } },
        { insert: " and " },
        { insert: "site", attributes: { link: "https://example.com" } },
        { insert: " and " },
        {
          insert: "schema",
          attributes: { reference: { kind: "source", path: "apps/frontend/src/lib/docs-model/doc-schema.ts" } },
        },
      ]),
    ).toBe(
      "plain **bold** and `code` and [site](https://example.com) and [schema](apps/frontend/src/lib/docs-model/doc-schema.ts)",
    );
  });

  it("projects plain text", () => {
    expect(deltaToPlainText([{ insert: "a" }, { insert: "b", attributes: { bold: true } }])).toBe("ab");
    expect(deltaToPlainText(undefined)).toBe("");
  });
});

describe("image block type — resolveAssetSrc (TG7.3)", () => {
  it("image block resolves its src through ctx.resolveAssetSrc when provided", () => {
    const descriptor = getDocBlockDescriptor("image");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx({
      resolveAssetSrc: (src) => `https://api.example.com/asset?path=${encodeURIComponent(src)}`,
    });
    const html = renderToStaticMarkup(
      descriptor!.render(block("image", { src: "./assets/images/sample.png", alt: "Sample" }), ctx) as never,
    );
    expect(html).toContain(
      'src="https://api.example.com/asset?path=.%2Fassets%2Fimages%2Fsample.png"',
    );
    expect(html).not.toContain('src="./assets/images/sample.png"');
  });

  it("image block falls back to the raw src when resolveAssetSrc is omitted (non-regression)", () => {
    const descriptor = getDocBlockDescriptor("image");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx();
    const html = renderToStaticMarkup(
      descriptor!.render(block("image", { src: "./assets/images/sample.png" }), ctx) as never,
    );
    expect(html).toContain('src="./assets/images/sample.png"');
  });
});

describe("video block type — descriptor", () => {
  it("embeds a provider url as an iframe, with title/caption threaded through", () => {
    const descriptor = getDocBlockDescriptor("video");
    expect(descriptor).not.toBeNull();
    const html = renderToStaticMarkup(
      descriptor!.render(
        block("video", {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Docs walkthrough",
          caption: "An external video.",
        }),
        makeCtx(),
      ) as never,
    );
    expect(html).toContain('data-doc-block="video"');
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="Docs walkthrough"');
    expect(html).toContain("An external video.");
  });

  it("renders a link card (never an iframe) for a non-provider url", () => {
    const descriptor = getDocBlockDescriptor("video");
    const html = renderToStaticMarkup(
      descriptor!.render(block("video", { url: "https://example.com/talk" }), makeCtx()) as never,
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="https://example.com/talk"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("resolves a bundle-relative src through ctx.resolveAssetSrc like image (TG7.3)", () => {
    const descriptor = getDocBlockDescriptor("video");
    const ctx = makeCtx({
      resolveAssetSrc: (src) => `https://api.example.com/asset?path=${encodeURIComponent(src)}`,
    });
    const html = renderToStaticMarkup(
      descriptor!.render(block("video", { src: "./assets/videos/demo.mp4" }), ctx) as never,
    );
    expect(html).toContain("<video");
    expect(html).toContain(
      'src="https://api.example.com/asset?path=.%2Fassets%2Fvideos%2Fdemo.mp4"',
    );
    expect(html).not.toContain('src="./assets/videos/demo.mp4"');
  });

  it("falls back to the raw src when resolveAssetSrc is omitted (non-regression)", () => {
    const descriptor = getDocBlockDescriptor("video");
    const html = renderToStaticMarkup(
      descriptor!.render(block("video", { src: "./assets/videos/demo.mp4" }), makeCtx()) as never,
    );
    expect(html).toContain('src="./assets/videos/demo.mp4"');
  });
});
