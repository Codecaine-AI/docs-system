import { describe, expect, it } from "bun:test";
import { docBlockOrder, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { docIdFromPath, mdxToDoc, parseFrontmatter } from "../mdx-to-doc";

describe("parseFrontmatter", () => {
  it("parses scalar and bracketed-array frontmatter keys", () => {
    const source = [
      "---",
      "covers: Why Spectre exists.",
      "type: overview",
      "concepts: [foo, bar, baz]",
      "format: mdx",
      "---",
      "",
      "# Heading",
    ].join("\n");
    const { meta, body } = parseFrontmatter(source);
    expect(meta.covers).toBe("Why Spectre exists.");
    expect(meta.type).toBe("overview");
    expect(meta.concepts).toEqual(["foo", "bar", "baz"]);
    expect(meta.format).toBe("mdx");
    expect(body.trim()).toBe("# Heading");
  });

  it("returns empty meta and the original source when there is no frontmatter", () => {
    const source = "# Just a heading\n\nSome text.";
    const { meta, body } = parseFrontmatter(source);
    expect(meta).toEqual({});
    expect(body).toBe(source);
  });

  it("handles an empty bracketed array", () => {
    const source = ["---", "concepts: []", "---", "", "Body."].join("\n");
    const { meta } = parseFrontmatter(source);
    expect(meta.concepts).toEqual([]);
  });
});

describe("docIdFromPath", () => {
  it("derives a stable slug from a docs/ path", () => {
    expect(docIdFromPath("docs/00-foundation/00-overview.mdx")).toBe("00-foundation-00-overview");
    expect(docIdFromPath("docs/10-system-design/50-interactive-canvas/index.mdx")).toBe(
      "10-system-design-50-interactive-canvas-index",
    );
  });

  it("is deterministic across repeated calls", () => {
    const a = docIdFromPath("docs/10-system-design/40-docs-mdx-lab.mdx");
    const b = docIdFromPath("docs/10-system-design/40-docs-mdx-lab.mdx");
    expect(a).toBe(b);
  });

  it("truncates overlong slugs to fit the schema's 97-char id cap, with a hash suffix to avoid collisions", () => {
    const deepPath =
      "docs/10-system-design/10-system-flow/20-session-phases/40-docs-update/agents/10-interview-foundation-agent.mdx";
    const id = docIdFromPath(deepPath);
    expect(id.length).toBeLessThanOrEqual(97);
    expect(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(id)).toBe(true);
  });

  it("produces different ids for two long paths that share the same tail after truncation", () => {
    const base = "docs/10-system-design/10-system-flow/20-session-phases/40-docs-update/agents/";
    const pathA = `${base}${"aaaa-".repeat(10)}shared-tail-name.mdx`;
    const pathB = `${base}${"bbbb-".repeat(10)}shared-tail-name.mdx`;
    expect(docIdFromPath(pathA)).not.toBe(docIdFromPath(pathB));
  });

  it("stays deterministic across repeated calls even when truncated", () => {
    const deepPath =
      "docs/10-system-design/10-system-flow/20-session-phases/40-docs-update/agents/10-interview-foundation-agent.mdx";
    expect(docIdFromPath(deepPath)).toBe(docIdFromPath(deepPath));
  });
});

const SAMPLE_MDX = [
  "---",
  "covers: A representative sample document.",
  "type: overview",
  "format: mdx",
  "---",
  "",
  "# Sample Doc",
  "",
  "This is a **bold** and *italic* paragraph with a [purpose](./10-purpose.mdx) link.",
  "",
  "## Section",
  "",
  "- First item",
  "- Second item",
  "  - Nested item",
  "- Third item",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "> A quoted line.",
  "",
  "---",
  "",
  "<Decision id=\"sample-decision\" status=\"accepted\" title=\"Ship it\">",
  "  We decided to ship the sample.",
  "</Decision>",
  "",
  "<Callout id=\"sample-callout\" tone=\"info\" title=\"Heads up\">",
  "  This is a callout body.",
  "</Callout>",
  "",
  "<Canvas id=\"sample-canvas\" title=\"Sample Canvas\" src=\"./assets/canvases/sample.canvas.json\" />",
  "",
  "<Mermaid id=\"sample-mermaid\" title=\"Unmapped Tag\">",
  "sequenceDiagram",
  "  A->>B: hi",
  "</Mermaid>",
].join("\n");

describe("mdxToDoc — golden sample", () => {
  const { doc, warnings } = mdxToDoc(SAMPLE_MDX, "docs/00-foundation/05-sample.mdx");

  it("produces a valid DocDocument", () => {
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("derives the doc id from the path and title from the first heading", () => {
    expect(doc.id).toBe("00-foundation-05-sample");
    expect(doc.title).toBe("Sample Doc");
  });

  it("carries frontmatter (minus title) into root block props", () => {
    const root = doc.blocks[doc.root];
    expect(root.props.covers).toBe("A representative sample document.");
    expect(root.props.type).toBe("overview");
    expect(root.props.format).toBe("mdx");
  });

  it("builds heading, paragraph, list, code, quote, divider blocks in document order", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    const blockTypes = order.map((id) => doc.blocks[id].type);
    expect(blockTypes).toEqual([
      "heading", // Sample Doc
      "paragraph", // bold/italic/link paragraph
      "heading", // Section
      "list-item", // First item
      "list-item", // Second item
      "list-item", // Nested item (depth-first: nested under Second item)
      "list-item", // Third item
      "code",
      "quote",
      "divider",
      "callout", // Decision -> callout carrying kind="decision"
      "callout",
      "canvas",
      "code", // Mermaid fallback
    ]);
  });

  it("parses inline marks and the doc-reference link in the paragraph", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    const paragraphId = order[1];
    const paragraph = doc.blocks[paragraphId];
    expect(paragraph.text).toEqual([
      { insert: "This is a " },
      { insert: "bold", attributes: { bold: true } },
      { insert: " and " },
      { insert: "italic", attributes: { italic: true } },
      { insert: " paragraph with a " },
      {
        insert: "purpose",
        attributes: {
          reference: { kind: "doc", path: "docs/00-foundation/10-purpose.mdx", label: "purpose" },
        },
      },
      { insert: " link." },
    ]);
  });

  it("nests list items via children (Nested item under Second item)", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    const secondItemId = order[4];
    const secondItem = doc.blocks[secondItemId];
    expect(secondItem.text?.map((s) => s.insert).join("")).toBe("Second item");
    expect(secondItem.children.length).toBe(1);
    const nested = doc.blocks[secondItem.children[0]];
    expect(nested.type).toBe("list-item");
    expect(nested.text?.map((s) => s.insert).join("")).toBe("Nested item");
  });

  it("maps Decision/Callout/Canvas to their doc-schema block types with expected props", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    // Decision has no first-class block type anymore — it migrates to a
    // callout with the retired type name as props.kind (coercion parity).
    const decision = doc.blocks[order[10]];
    expect(decision.type).toBe("callout");
    expect(decision.props).toEqual({ kind: "decision", status: "accepted", title: "Ship it" });
    expect(decision.text?.map((s) => s.insert).join("")).toBe("We decided to ship the sample.");

    const callout = doc.blocks[order[11]];
    expect(callout.type).toBe("callout");
    expect(callout.props).toEqual({ tone: "info", title: "Heads up" });

    const canvas = doc.blocks[order[12]];
    expect(canvas.type).toBe("canvas");
    expect(canvas.props.src).toBe("./assets/canvases/sample.canvas.json");
    expect(canvas.props.title).toBe("Sample Canvas");
  });

  it("falls back unmapped MDX components to a raw code block and warns", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    const fallback = doc.blocks[order[13]];
    expect(fallback.type).toBe("code");
    expect(fallback.props.language).toBe("mdx");
    expect(fallback.props.mdxTag).toBe("Mermaid");
    expect(fallback.text?.[0]?.insert).toContain("<Mermaid");
    expect(fallback.text?.[0]?.insert).toContain("sequenceDiagram");

    expect(warnings.some((w) => w.includes("Mermaid"))).toBe(true);
  });

  it("preserves fenced code language and exact source text", () => {
    const order = docBlockOrder(doc).filter((id) => id !== doc.root);
    const code = doc.blocks[order[7]];
    expect(code.type).toBe("code");
    expect(code.props.language).toBe("ts");
    expect(code.text).toEqual([{ insert: "const x = 1;" }]);
  });

  it("mints stable ids deterministically across repeated runs on the same input", () => {
    const second = mdxToDoc(SAMPLE_MDX, "docs/00-foundation/05-sample.mdx");
    expect(second.doc).toEqual(doc);
  });
});

describe("mdxToDoc — documents without frontmatter", () => {
  it("still produces a valid document with a derived title", () => {
    const source = "# Untitled\n\nJust a paragraph.";
    const { doc } = mdxToDoc(source, "docs/.drafts/untitled.mdx");
    const result = validateDocDocument(doc);
    expect(result.ok).toBe(true);
    expect(doc.title).toBe("Untitled");
  });
});
