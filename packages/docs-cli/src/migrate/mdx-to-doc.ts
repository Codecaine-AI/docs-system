/**
 * MDX document -> DocDocument builder (M2 migration, TG4.2).
 *
 * Converts one MDX source file into a docs-model DocDocument (doc-schema.ts):
 * frontmatter -> doc meta, prose -> paragraph/heading/list-item/code/quote/
 * divider blocks with inline marks parsed by inline-to-delta.ts, and
 * recognized MDX component tags -> their matching doc-schema block type where
 * one exists.
 *
 * Segmentation mirrors MdxDocumentRenderer's parseMdxSegments/parseAttrs
 * (apps/frontend/src/components/docs/MdxDocumentRenderer.tsx lines 96-195):
 * scan line by line, PascalCase-tag lines open/close a component segment,
 * everything else buffers into a markdown segment that gets flushed and
 * parsed as prose.
 */

import { basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { inlineToDelta } from "./inline-to-delta";
import {
  validateDocDocument,
  type DocBlock,
  type DocBlockType,
  type DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";

export type MdxToDocResult = {
  doc: DocDocument;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export type Frontmatter = Record<string, string | string[]>;

function parseFrontmatterValue(raw: string): string | string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter((item) => item.length > 0);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

/**
 * Minimal frontmatter parser for the flat `key: value` / `key: [a, b]` shape
 * used across docs/**\/*.mdx (verified: no nested YAML objects in the
 * corpus). Returns the parsed record and the remaining body (content after
 * the closing `---`).
 */
export function parseFrontmatter(source: string): { meta: Frontmatter; body: string } {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: source };
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex < 0) {
    return { meta: {}, body: source };
  }

  const meta: Frontmatter = {};
  for (const line of lines.slice(1, closingIndex)) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    meta[match[1]] = parseFrontmatterValue(match[2]);
  }

  const body = lines
    .slice(closingIndex + 1)
    .join("\n")
    .replace(/^\s*\n/, "");
  return { meta, body };
}

// ---------------------------------------------------------------------------
// Segmentation (mirrors MdxDocumentRenderer parseMdxSegments/parseAttrs)
// ---------------------------------------------------------------------------

const COMPONENT_OPEN_RE = /^<([A-Z][A-Za-z0-9]*)\b([^>]*)>\s*$/;
const SELF_CLOSING_COMPONENT_RE = /^<([A-Z][A-Za-z0-9]*)\b([^>]*)\/>\s*$/;
const ATTR_RE = /([A-Za-z_:][A-Za-z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/g;

type Segment =
  | { kind: "markdown"; content: string }
  | { kind: "component"; tag: string; attrs: Record<string, string>; body: string };

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

/**
 * Segments an MDX body into markdown runs and recognized component blocks.
 * Any PascalCase tag is treated as a component segment (unlike the renderer,
 * the migration doesn't gate on a registry — it maps every recognized tag it
 * knows about and falls back to a lossless raw-source code block for the
 * rest, see COMPONENT_TAG_TO_BLOCK_TYPE / buildUnmappedComponentBlock below).
 */
function segmentMdx(content: string): Segment[] {
  const lines = content.split("\n");
  const segments: Segment[] = [];
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
    if (markdownBuffer.length === 0) return;
    const markdown = markdownBuffer.join("\n");
    if (markdown.trim().length > 0) {
      segments.push({ kind: "markdown", content: markdown });
    }
    markdownBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const selfClosingMatch = trimmed.match(SELF_CLOSING_COMPONENT_RE);
    const openMatch = trimmed.match(COMPONENT_OPEN_RE);
    const componentMatch = selfClosingMatch ?? openMatch;

    if (!componentMatch) {
      markdownBuffer.push(lines[i]);
      continue;
    }

    flushMarkdown();
    const tag = componentMatch[1];
    const attrs = parseAttrs(componentMatch[2] ?? "");
    const bodyLines: string[] = [];

    if (!selfClosingMatch) {
      const closeRe = new RegExp(`^</${tag}>\\s*$`);
      while (i + 1 < lines.length) {
        i++;
        if (closeRe.test(lines[i].trim())) break;
        bodyLines.push(lines[i]);
      }
    }

    segments.push({ kind: "component", tag, attrs, body: bodyLines.join("\n") });
  }

  flushMarkdown();
  return segments;
}

// ---------------------------------------------------------------------------
// Id minting
// ---------------------------------------------------------------------------

/**
 * Mints a stable, human-scannable block id: `b-<slug>-<n>`. Deterministic
 * given the same input document (slug derived from text content + a
 * per-document running counter keeps ids stable across re-runs as long as
 * the source doesn't change — that's the migration re-run contract).
 */
function makeIdMinter(docSlug: string) {
  let counter = 0;
  const seen = new Set<string>();
  return (hint: string): string => {
    counter += 1;
    const slug =
      hint
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "block";
    let candidate = `b-${docSlug}-${slug}-${counter}`;
    let bump = 0;
    while (seen.has(candidate)) {
      bump += 1;
      candidate = `b-${docSlug}-${slug}-${counter}-${bump}`;
    }
    seen.add(candidate);
    return candidate;
  };
}

function docSlugFromPath(docPath: string): string {
  const base = basename(docPath, extname(docPath));
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "doc"
  );
}

// ---------------------------------------------------------------------------
// Markdown prose -> blocks
// ---------------------------------------------------------------------------

type BuildCtx = {
  docPath: string;
  mintId: (hint: string) => string;
  warnings: string[];
  blocks: Record<string, DocBlock>;
};

function textInsert(md: string, ctx: BuildCtx): DocBlock["text"] {
  const { spans, warnings } = inlineToDelta(md, { docPath: ctx.docPath });
  ctx.warnings.push(...warnings);
  return spans;
}

function addBlock(ctx: BuildCtx, block: DocBlock): string {
  ctx.blocks[block.id] = block;
  return block.id;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```(\S*)\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const DIVIDER_RE = /^(---|\*\*\*|___)\s*$/;
const UNORDERED_LIST_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_LIST_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

type ListItemNode = {
  indent: number;
  text: string;
  ordered: boolean;
};

/**
 * Parses a markdown prose segment into an ordered list of top-level block
 * ids (already registered into ctx.blocks). Handles headings, fenced code,
 * blockquotes, dividers, list items (with indent-based nesting), and plain
 * paragraphs (blank-line separated).
 */
function buildProseBlocks(markdown: string, ctx: BuildCtx): string[] {
  const lines = markdown.split("\n");
  const topLevel: string[] = [];
  let i = 0;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join("\n");
    if (text.trim().length > 0) {
      const id = ctx.mintId(text.trim().slice(0, 24));
      topLevel.push(
        addBlock(ctx, {
          id,
          type: "paragraph",
          props: {},
          text: textInsert(text, ctx),
          children: [],
        }),
      );
    }
    paragraphBuffer = [];
  };

  // List parsing works on a contiguous run of list lines; builds a nested
  // tree keyed by indent depth using a stack of (indent, blockId, children).
  const flushList = (itemLines: ListItemNode[]) => {
    if (itemLines.length === 0) return;
    type StackFrame = { indent: number; id: string; children: string[] };
    const stack: StackFrame[] = [];
    const roots: string[] = [];

    for (const item of itemLines) {
      const id = ctx.mintId(item.text.slice(0, 24));
      addBlock(ctx, {
        id,
        type: "list-item",
        props: { ordered: item.ordered },
        text: textInsert(item.text, ctx),
        children: [],
      });

      while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) {
        const finished = stack.pop() as StackFrame;
        ctx.blocks[finished.id].children = finished.children;
      }

      if (stack.length === 0) {
        roots.push(id);
      } else {
        stack[stack.length - 1].children.push(id);
      }
      stack.push({ indent: item.indent, id, children: [] });
    }

    while (stack.length > 0) {
      const finished = stack.pop() as StackFrame;
      ctx.blocks[finished.id].children = finished.children;
    }

    topLevel.push(...roots);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = ctx.mintId(text.slice(0, 24));
      topLevel.push(
        addBlock(ctx, {
          id,
          type: "heading",
          props: { level },
          text: textInsert(text, ctx),
          children: [],
        }),
      );
      i += 1;
      continue;
    }

    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      const id = ctx.mintId(lang ?? "code");
      topLevel.push(
        addBlock(ctx, {
          id,
          type: "code",
          props: lang ? { language: lang } : {},
          text: [{ insert: codeLines.join("\n") }],
          children: [],
        }),
      );
      continue;
    }

    if (DIVIDER_RE.test(trimmed)) {
      flushParagraph();
      const id = ctx.mintId("divider");
      topLevel.push(addBlock(ctx, { id, type: "divider", props: {}, children: [] }));
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line) || QUOTE_RE.test(trimmed)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && (QUOTE_RE.test(lines[i]) || lines[i].trim().length === 0)) {
        const m = lines[i].match(QUOTE_RE);
        if (m) quoteLines.push(m[1]);
        else break;
        i += 1;
      }
      const text = quoteLines.join("\n").trim();
      const id = ctx.mintId(text.slice(0, 24));
      topLevel.push(
        addBlock(ctx, {
          id,
          type: "quote",
          props: {},
          text: textInsert(text, ctx),
          children: [],
        }),
      );
      continue;
    }

    const isListLine = UNORDERED_LIST_RE.test(line) || ORDERED_LIST_RE.test(line);
    if (isListLine) {
      flushParagraph();
      const items: ListItemNode[] = [];
      while (i < lines.length) {
        const uMatch = lines[i].match(UNORDERED_LIST_RE);
        const oMatch = lines[i].match(ORDERED_LIST_RE);
        if (uMatch) {
          items.push({ indent: uMatch[1].length, text: uMatch[2], ordered: false });
          i += 1;
        } else if (oMatch) {
          items.push({ indent: oMatch[1].length, text: oMatch[3], ordered: true });
          i += 1;
        } else if (lines[i].trim().length === 0) {
          // Blank line: peek ahead — a single blank line inside a list is
          // tolerated (loose list); two blanks or a non-list line ends it.
          const next = lines[i + 1];
          const nextIsList =
            next !== undefined && (UNORDERED_LIST_RE.test(next) || ORDERED_LIST_RE.test(next));
          if (nextIsList) {
            i += 1;
            continue;
          }
          break;
        } else {
          break;
        }
      }
      flushList(items);
      continue;
    }

    // Table rows: keep as a paragraph run for now (tables render fine as
    // prose text via the markdown projection path used by adapted blocks;
    // no dedicated `table` block type exists in doc-schema v1).
    paragraphBuffer.push(line);
    i += 1;
  }

  flushParagraph();
  return topLevel;
}

// ---------------------------------------------------------------------------
// MDX component tag -> block type mapping
// ---------------------------------------------------------------------------

type ComponentMapper = (attrs: Record<string, string>, body: string, ctx: BuildCtx) => {
  type: DocBlockType;
  props: Record<string, unknown>;
  text?: DocBlock["text"];
};

function strAttr(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key]?.trim();
  return value || undefined;
}

/**
 * Tags with a first-class doc-schema block type (D28 — "the existing
 * docs-blocks registry becomes the block registry"). Mirrors
 * block-registry.ts's mdxAdapterDescriptor mappings for the ones with an
 * aligned block type today; the rest of the MDX component vocabulary
 * (Risk/OpenQuestion/Status/Milestone/Checklist/StructuredTable/Tabs/
 * Columns/Code(component)/ImplementationMap/ApiEndpoint/ApiSurface/
 * DataModel/Diff/JsonExplorer/AnnotatedCode/Diagram/Flow/Mermaid/Wireframe/
 * DesignBoard/Artboard/Screen/Prototype/PrototypeScreen/PrototypeTransition)
 * has no doc-schema block type yet — those fall back to buildUnmappedComponentBlock.
 */
const COMPONENT_TAG_TO_BLOCK_TYPE: Record<string, ComponentMapper> = {
  // Decision/AgentContract/Constraint/Assumption have NO first-class block
  // type in the 14-type vocabulary — they migrate to callouts carrying the
  // retired type name as `props.kind`, matching what doc-schema's
  // legacy-type coercion produces for an old doc.json that still used the
  // retired type name.
  Decision: (attrs, body, ctx) => ({
    type: "callout",
    props: {
      kind: "decision",
      status: strAttr(attrs, "status") ?? "proposed",
      title: strAttr(attrs, "title"),
    },
    text: textInsert(body.trim(), ctx),
  }),
  Callout: (attrs, body, ctx) => ({
    type: "callout",
    props: {
      tone: strAttr(attrs, "tone") ?? "info",
      title: strAttr(attrs, "title"),
    },
    text: textInsert(body.trim(), ctx),
  }),
  AgentContract: (attrs, body, ctx) => ({
    type: "callout",
    props: {
      kind: "agent-contract",
      agent: strAttr(attrs, "agent"),
      title: strAttr(attrs, "title"),
      tools: strAttr(attrs, "tools"),
      approvals: strAttr(attrs, "approvals"),
    },
    text: textInsert(body.trim(), ctx),
  }),
  FileTree: (attrs, body) => ({
    type: "file-tree",
    props: {
      title: strAttr(attrs, "title"),
      entries: parseFileTreeEntries(body),
    },
  }),
  Constraint: (attrs, body, ctx) => ({
    type: "callout",
    props: {
      kind: "constraint",
      title: strAttr(attrs, "title"),
      severity: strAttr(attrs, "severity") ?? "hard",
      owner: strAttr(attrs, "owner"),
    },
    text: textInsert(body.trim(), ctx),
  }),
  Assumption: (attrs, body, ctx) => ({
    type: "callout",
    props: {
      kind: "assumption",
      title: strAttr(attrs, "title"),
      confidence: strAttr(attrs, "confidence") ?? "medium",
      owner: strAttr(attrs, "owner"),
    },
    text: textInsert(body.trim(), ctx),
  }),
  Canvas: (attrs) => ({
    type: "canvas",
    props: {
      src: strAttr(attrs, "src"),
      view: strAttr(attrs, "view"),
      title: strAttr(attrs, "title"),
    },
  }),
};

function parseFileTreeEntries(body: string): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  for (const rawLine of body.split("\n")) {
    const cleaned = rawLine
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^`([^`]+)`/, "$1")
      .trim();
    if (!cleaned) continue;
    const changeMatch = cleaned.match(/^\[(added|modified|removed|renamed)\]\s+/i);
    const change = changeMatch?.[1]?.toLowerCase();
    const withoutChange = changeMatch ? cleaned.slice(changeMatch[0].length).trim() : cleaned;
    const [pathPart, ...noteParts] = withoutChange.split(/\s+(?:--|::|—)\s+/);
    const path = pathPart?.replace(/^`|`$/g, "").trim();
    if (!path) continue;
    const entry: Record<string, unknown> = { path };
    const note = noteParts.join(" - ").trim();
    if (note) entry.note = note;
    if (change) entry.change = change;
    entries.push(entry);
  }
  return entries;
}

/**
 * Fallback for MDX component tags with no doc-schema block type yet (see the
 * comment above COMPONENT_TAG_TO_BLOCK_TYPE for the list). Preserves the
 * original tag + full raw source verbatim as a `code` block with
 * `props.language: "mdx"` and `props.mdxTag` — lossless, validated, and
 * clearly flagged in the migration warnings so this can be revisited once
 * doc-schema grows those block types (tracked as an explicit irreducible case,
 * not silently dropped).
 */
function buildUnmappedComponentBlock(
  tag: string,
  attrs: Record<string, string>,
  body: string,
  ctx: BuildCtx,
): string {
  ctx.warnings.push(
    `Unmapped MDX component <${tag}> in ${ctx.docPath} — stored as raw "code" fallback block (props.mdxTag="${tag}"); no doc-schema block type exists for this tag yet.`,
  );
  const attrsSource = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  const source = `<${tag}${attrsSource ? ` ${attrsSource}` : ""}>\n${body}\n</${tag}>`;
  const id = ctx.mintId(tag);
  return addBlock(ctx, {
    id,
    type: "code",
    props: { language: "mdx", mdxTag: tag, mdxAttrs: attrs },
    text: [{ insert: source }],
    children: [],
  });
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

/**
 * Converts an MDX source document into a DocDocument. Never throws on
 * recoverable issues (unmapped components, unclassifiable links) — those
 * surface as warnings. Structural validation failures (which should not
 * happen given the builder's own invariants) are reported via
 * validateDocDocument and the caller decides how to fail loudly.
 */
export function mdxToDoc(source: string, docPath: string): MdxToDocResult {
  const { meta, body } = parseFrontmatter(source);
  const docSlug = docSlugFromPath(docPath);
  const mintId = makeIdMinter(docSlug);
  const warnings: string[] = [];
  const blocks: Record<string, DocBlock> = {};
  const ctx: BuildCtx = { docPath, mintId, warnings, blocks };

  const segments = segmentMdx(body);
  const rootChildren: string[] = [];

  for (const segment of segments) {
    if (segment.kind === "markdown") {
      rootChildren.push(...buildProseBlocks(segment.content, ctx));
      continue;
    }

    const mapper = COMPONENT_TAG_TO_BLOCK_TYPE[segment.tag];
    if (!mapper) {
      rootChildren.push(buildUnmappedComponentBlock(segment.tag, segment.attrs, segment.body, ctx));
      continue;
    }

    const { type, props, text } = mapper(segment.attrs, segment.body, ctx);
    const idHint = strAttr(segment.attrs, "id") ?? strAttr(segment.attrs, "title") ?? segment.tag;
    const id = ctx.mintId(idHint);
    rootChildren.push(addBlock(ctx, { id, type, props, text, children: [] }));
  }

  const rootId = mintId("root");
  const title =
    (typeof meta.title === "string" && meta.title) ||
    findFirstHeadingText(blocks, rootChildren) ||
    docSlug;

  const rootProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === "title") continue;
    rootProps[key] = value;
  }

  blocks[rootId] = {
    id: rootId,
    type: "paragraph",
    props: rootProps,
    children: rootChildren,
  };

  const docId = docIdFromPath(docPath);
  const rawDoc: DocDocument = {
    schemaVersion: 1,
    id: docId,
    title,
    root: rootId,
    blocks,
  };

  const result = validateDocDocument(rawDoc);
  if (!result.ok) {
    const issueText = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`mdxToDoc produced an invalid DocDocument for ${docPath}: ${issueText}`);
  }

  return { doc: result.document, warnings };
}

function findFirstHeadingText(blocks: Record<string, DocBlock>, ids: string[]): string | undefined {
  for (const id of ids) {
    const block = blocks[id];
    if (block?.type === "heading" && block.text) {
      const text = block.text.map((span) => span.insert).join("").trim();
      if (text) return text;
    }
  }
  return undefined;
}

/** Max id length allowed by doc-schema's isId(): first char + up to 96 more. */
const MAX_ID_LENGTH = 97;
/** Short deterministic hash suffix length used to disambiguate truncated ids. */
const ID_HASH_SUFFIX_LENGTH = 8;

/**
 * Stable doc id derived from its repo path (deterministic across re-runs).
 * Deep doc trees can produce slugs longer than doc-schema's 97-char id cap
 * (isId: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/); when that happens, keep the
 * most specific (rightmost) part of the path for scannability and append a
 * short deterministic hash of the FULL slug so two different long paths that
 * happen to share a truncated tail never collide.
 */
export function docIdFromPath(docPath: string): string {
  const withoutExt = docPath.replace(/\.mdx?$/i, "");
  const slug = withoutExt
    .replace(/^docs\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "doc";
  if (safeSlug.length <= MAX_ID_LENGTH) return safeSlug;

  const hash = createHash("sha1").update(safeSlug).digest("hex").slice(0, ID_HASH_SUFFIX_LENGTH);
  const keepLength = MAX_ID_LENGTH - ID_HASH_SUFFIX_LENGTH - 1; // reserve room for "-<hash>"
  const tail = safeSlug.slice(-keepLength).replace(/^-+/, "");
  return `${tail}-${hash}`;
}
