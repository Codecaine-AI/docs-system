/**
 * Joint round-trip equivalence gate (§8.5 reversibility evidence).
 *
 * For a representative sample of REAL repo docs, runs the full pipeline
 *   mdxToDoc(source) -> projectToMarkdown(doc)
 * and asserts SEMANTIC equivalence to the source — no content loss:
 * every heading text, every paragraph's plain text (marks stripped), every
 * list item's text, and every code fence's content must appear in the
 * projection, in source order.
 *
 * Byte equality is deliberately NOT asserted — MDX component blocks
 * legitimately project differently (e.g. a Decision projects as
 * `> **Decision (status): title** — body`, a Canvas as an HTML-comment
 * reference line). For those, targeted assertions check the key fields
 * survive. Unmapped tags (migrated as raw-source `code` fallback blocks)
 * must surface their raw MDX in the projection.
 *
 * Known, deliberate projection differences this test accommodates (rather
 * than treating as loss):
 * - Inline marks re-serialize canonically: `_italic_` -> `*italic*`. The
 *   normalizer strips mark characters from both sides before comparing.
 * - Links/references project per D35: plain links keep `[text](href)`,
 *   doc/source references render their label (the source anchor text —
 *   preserved via SpectreRef.label by the migrator). The normalizer reduces
 *   link syntax to its anchor text on both sides.
 * - List bullets/numbering re-serialize (`*` -> `-`, renumbered `1.`); the
 *   normalizer compares item text, not markers.
 * - Blockquote `>` prefixes and heading `#` markers are formatting, not
 *   content; `>` is stripped by the normalizer, heading text is compared as
 *   a substring of the projected heading line.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mdxToDoc, parseFrontmatter } from "../mdx-to-doc";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";

/**
 * The live .mdx twins were retired after migration (§8.5), so the sampled
 * sources are preserved verbatim as fixtures under __fixtures__/real-docs/
 * (extracted from git at the pre-retirement commit 1e4e8f53). The SAMPLE_DOCS
 * entries keep their original repo paths — mdxToDoc needs them for id
 * derivation — and are mapped to fixture files by flattening `/` to `__`.
 */
const FIXTURES_DIR = join(import.meta.dir, "../__fixtures__/real-docs");

function fixturePathFor(docPath: string): string {
  return join(FIXTURES_DIR, docPath.replace(/^docs\//, "").replaceAll("/", "__"));
}

/** Representative sample, picked from the migration report (see CP4 notes). */
const SAMPLE_DOCS = [
  // Required anchor case: frontmatter + prose + Canvas + Decision + reference links.
  "docs/00-foundation/00-overview.mdx",
  // Deep 10-system-design doc: 7 levels deep (the overlong-id case), heavy
  // markdown tables, headings, lists, dividers.
  "docs/10-system-design/10-system-flow/20-session-phases/40-docs-update/agents/10-interview-foundation-agent.mdx",
  // The MDX component lab: exercises all 22 unmapped component tags (raw
  // code-fallback path) plus a mapped Canvas.
  "docs/10-system-design/40-docs-mdx-lab.mdx",
  // Nested lists + many code fences (18 fences, nested bullets).
  "docs/10-system-design/10-system-flow/20-session-phases/20-plan/18-pipeline-execution.mdx",
];

// ---------------------------------------------------------------------------
// Pure helpers: source-content extraction + normalization
// ---------------------------------------------------------------------------

type SourceChunk =
  | { kind: "text"; text: string; line: number }
  | { kind: "code"; text: string; line: number };

const COMPONENT_OPEN_RE = /^<([A-Z][A-Za-z0-9]*)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```/;
const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const DIVIDER_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Extracts the comparable prose/code content of an MDX source, skipping
 * frontmatter and MDX component segments (those are asserted separately via
 * targeted key-field checks — their projection is legitimately different).
 */
function extractSourceChunks(source: string): SourceChunk[] {
  const { body } = parseFrontmatter(source);
  const lines = body.split("\n");
  const chunks: SourceChunk[] = [];

  let inFence = false;
  let fenceBuffer: string[] = [];
  let fenceStartLine = 0;
  let componentCloseTag: string | null = null;

  lines.forEach((line, index) => {
    // Inside an MDX component segment: skip until its close tag. Component
    // content is covered by the targeted component assertions.
    if (componentCloseTag) {
      if (line.trim() === componentCloseTag) componentCloseTag = null;
      return;
    }

    if (inFence) {
      if (FENCE_RE.test(line.trim())) {
        inFence = false;
        chunks.push({ kind: "code", text: fenceBuffer.join("\n"), line: fenceStartLine });
        fenceBuffer = [];
      } else {
        fenceBuffer.push(line);
      }
      return;
    }

    if (FENCE_RE.test(line.trim())) {
      inFence = true;
      fenceStartLine = index + 1;
      return;
    }

    const componentMatch = line.match(COMPONENT_OPEN_RE);
    if (componentMatch) {
      const tag = componentMatch[1];
      const selfClosing = /\/>\s*$/.test(line.trim());
      const closesOnSameLine = line.includes(`</${tag}>`);
      if (!selfClosing && !closesOnSameLine) componentCloseTag = `</${tag}>`;
      return;
    }

    const trimmed = line.trim();
    if (!trimmed || DIVIDER_RE.test(trimmed)) return;

    const heading = line.match(HEADING_RE);
    if (heading) {
      chunks.push({ kind: "text", text: heading[2], line: index + 1 });
      return;
    }
    const listItem = line.match(LIST_ITEM_RE);
    if (listItem) {
      chunks.push({ kind: "text", text: listItem[2], line: index + 1 });
      return;
    }
    const quote = line.match(QUOTE_RE);
    if (quote) {
      if (quote[1].trim()) chunks.push({ kind: "text", text: quote[1], line: index + 1 });
      return;
    }
    // Paragraph / table row.
    chunks.push({ kind: "text", text: trimmed, line: index + 1 });
  });

  return chunks;
}

/**
 * Reduces text to its comparable content: link syntax -> anchor text, all
 * inline mark characters and blockquote markers removed, whitespace
 * collapsed. Applied identically to source chunks and the projection, so
 * canonical re-serialization differences (e.g. `_x_` -> `*x*`) cancel out.
 */
function normalize(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](href) -> text
    .replace(/[`*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Asserts every chunk appears in the projection, in order. Returns the list
 * of misses (empty = pass) so the test failure output names each lost chunk
 * with its source line.
 */
function findLostChunks(chunks: SourceChunk[], projection: string): string[] {
  const normalizedProjection = normalize(projection);
  const misses: string[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const needle = normalize(chunk.text);
    if (!needle) continue;
    const index = normalizedProjection.indexOf(needle, cursor);
    if (index === -1) {
      const anywhere = normalizedProjection.includes(needle);
      misses.push(
        `${chunk.kind} @ source line ${chunk.line}: ${
          anywhere ? "OUT OF ORDER" : "MISSING"
        } -> ${JSON.stringify(needle.slice(0, 120))}`,
      );
    } else {
      cursor = index;
    }
  }
  return misses;
}

function projectDoc(docPath: string): { source: string; projection: string; warnings: string[] } {
  const source = readFileSync(fixturePathFor(docPath), "utf8");
  const { doc, warnings } = mdxToDoc(source, docPath);
  return { source, projection: projectToMarkdown(doc), warnings };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("round-trip: mdxToDoc -> projectToMarkdown preserves content of real repo docs", () => {
  for (const docPath of SAMPLE_DOCS) {
    it(`preserves all prose, list, and code content in order: ${docPath}`, () => {
      const { source, projection } = projectDoc(docPath);
      const chunks = extractSourceChunks(source);
      expect(chunks.length).toBeGreaterThan(0);
      expect(findLostChunks(chunks, projection)).toEqual([]);
    });
  }
});

describe("round-trip: mapped component blocks keep their key fields", () => {
  it("00-foundation/00-overview: Decision projects with status, title, and body", () => {
    const { projection } = projectDoc("docs/00-foundation/00-overview.mdx");
    expect(projection).toContain(
      "> **Decision (accepted): Documentation is the durable project memory**",
    );
    // Body text survives (normalized — the em-dash join is projection syntax).
    expect(normalize(projection)).toContain(
      normalize("Treat documentation as Spectre's durable project memory, not as a secondary artifact."),
    );
  });

  it("00-foundation/00-overview: Canvas projects as an HTML-comment reference with its src", () => {
    const { projection } = projectDoc("docs/00-foundation/00-overview.mdx");
    expect(projection).toContain(
      "<!-- canvas: ./assets/canvases/read-foundation-before-diving-into-the-diagram.canvas.json",
    );
  });

  it("00-foundation/00-overview: reference-link anchor text survives via SpectreRef.label", () => {
    const { projection } = projectDoc("docs/00-foundation/00-overview.mdx");
    // Source: `### [10-purpose.md](10-purpose.md)` — the anchor text must
    // survive projection (D35 renders references as plain label text).
    expect(projection).toContain("### 10-purpose.md");
    expect(projection).toContain("### 20-principles.md");
    expect(projection).toContain("### 30-boundaries.md");
  });
});

describe("round-trip: unmapped component tags preserve their raw MDX source", () => {
  const LAB_DOC = "docs/10-system-design/40-docs-mdx-lab.mdx";
  const UNMAPPED_TAGS = [
    "AnnotatedCode",
    "ApiEndpoint",
    "ApiSurface",
    "Artboard",
    "Checklist",
    "Code",
    "Columns",
    "DataModel",
    "DesignBoard",
    "Diagram",
    "Diff",
    "Flow",
    "ImplementationMap",
    "JsonExplorer",
    "Mermaid",
    "Prototype",
    "PrototypeScreen",
    "PrototypeTransition",
    "Screen",
    "StructuredTable",
    "Tabs",
    "Wireframe",
  ];

  it("every unmapped tag's raw MDX opening tag appears in the projection", () => {
    const { projection } = projectDoc(LAB_DOC);
    for (const tag of UNMAPPED_TAGS) {
      expect(projection).toContain(`<${tag}`);
    }
  });

  it("an unmapped tag's inner body survives verbatim (Mermaid diagram source)", () => {
    const { projection } = projectDoc(LAB_DOC);
    expect(projection).toContain("sequenceDiagram");
    expect(projection).toContain("Reviewer->>DocsLab: Queue anchored cue");
  });
});
