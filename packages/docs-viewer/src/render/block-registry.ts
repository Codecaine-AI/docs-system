"use client";

import { createElement, type ReactNode } from "react";
import type { DocsMdxBlock, DocsMdxParsedBlock } from "../docs-blocks/base";
import { CalloutDocsBlock } from "../docs-blocks/callout/CalloutDocsBlock";
import { AnnotatedCodeBlock, type CodeAnnotation } from "../docs-blocks/code/CodeAnnotations";
import { highlightCode, prettyPrintIfJson } from "../docs-blocks/code/highlight";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
  type InteractionSurfaceOperation,
} from "../docs-blocks/interaction-surface/InteractionSurfaceDocsBlock";
import { FileTreeDocsBlock } from "../docs-blocks/file-tree/FileTreeDocsBlock";
import { MermaidDocsBlock } from "../docs-blocks/mermaid/MermaidDocsBlock";
import {
  STRUCTURED_TABLE_AGENT_DESCRIPTION,
  STRUCTURED_TABLE_LABEL,
  StructuredTableBlock,
  type StructuredTableDensity,
} from "../docs-blocks/structured-table/StructuredTableDocsBlock";
import {
  VIDEO_AGENT_DESCRIPTION,
  VIDEO_LABEL,
  VideoBlock,
} from "../docs-blocks/video/VideoDocsBlock";
import type { DeltaSpan, DocBlock, DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import { deltaToPlainTextInline, wrapMarkdownMarks } from "@codecaine-ai/docs-model/delta-markdown";
import {
  CODE_BLOCK_CLASSES,
  HEADING_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CHILDREN_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
  PARAGRAPH_CLASSES,
  QUOTE_CLASSES,
} from "./block-classes";

/**
 * Block registry (D28): maps every doc.json block type — exactly the 14
 * canonical types in doc-schema's DOC_BLOCK_TYPES — to a render/agent
 * descriptor. Where a doc.json block type aligns with a docs-block component
 * implementation the descriptor delegates to that block's render — via
 * `mdxAdapterDescriptor` (callout, file-tree: `data` built by hand from
 * props), `parsedMdxAdapterDescriptor` (mermaid: `data` built by
 * REUSING the component's MDX-era parse() over a delta->markdown body
 * projection), or a plain props-driven descriptor (structured-table,
 * interaction-surface: the component renders straight from typed props, no
 * body grammar). The blocks are imported directly; the MDX-era tag registry and
 * MdxDocumentRenderer are gone. The remaining block types get minimal
 * tracer descriptors here. DocBlockRenderer supplies the concrete render
 * context (delta spans -> inline React, recursive children, canvas embeds,
 * markdown projection). Legacy/retired block types never reach this file:
 * doc-schema validation coerces them to `callout` (type name -> props.kind).
 */

export type DocBlockRenderContext = {
  /** Renders delta spans to inline React (bold/italic/strike/code/link/reference marks). */
  renderText: (text: DeltaSpan[] | undefined) => ReactNode;
  /** Renders the block's ordered children recursively. */
  renderChildren: (block: DocBlock) => ReactNode;
  /** Markdown string -> React; used by adapted MDX block implementations. */
  renderMarkdown: (markdown: string) => ReactNode;
  /** Canvas embed by id or legacy src (+ optional container view crop, D4/§4.4). */
  renderCanvas?: (input: {
    id: string;
    canvasId?: string;
    src?: string;
    view?: string;
    title?: string;
  }) => ReactNode;
  /**
   * Resolves an `image`/`video` block's raw `src` prop (often a
   * bundle-relative `./assets/images/...` or `./assets/videos/...` path) to
   * a fetchable URL — analogous to `renderCanvas` above, this is purely
   * optional plumbing: the host decides HOW to resolve (e.g. via the
   * `/docs/asset` GET route + `resolveBundleAssetSrc`), the block type
   * descriptors below just call it if present. When omitted, `image`/`video`
   * fall back to using the raw `src` unchanged (non-breaking for existing
   * callers that don't pass this prop).
   */
  resolveAssetSrc?: (src: string) => string;
};

/** @deprecated Use DocBlockRenderContext. */
export type DocFlavourRenderContext = DocBlockRenderContext;

export type DocBlockDescriptor = {
  type: DocBlockType;
  targetKind: string;
  label: string;
  agentDescription: string;
  /** Typed doc ops applicable to this block type (see doc-ops.ts DocOp union). */
  patchOps: readonly string[];
  render: (block: DocBlock, ctx: DocBlockRenderContext) => ReactNode;
};

/** @deprecated Use DocBlockDescriptor. */
export type DocFlavourDescriptor = DocBlockDescriptor;

const STRUCTURAL_OPS = ["insertBlock", "updateBlock", "deleteBlock", "moveBlock"] as const;
const TEXT_OPS = [...STRUCTURAL_OPS, "splitBlock", "mergeBlocks"] as const;

function stringProp(block: DocBlock, key: string): string | undefined {
  const value = block.props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Projects delta spans to a markdown string — used to feed adapted MDX block
 * implementations whose bodies are markdown, and by future `docs render`
 * projections (D26). Lossy only for exotic nesting; v1 marks project cleanly.
 *
 * Shares its bold/italic/strike/code/link wrapping with delta-markdown.ts's
 * `deltaToMarkdownInline` via `wrapMarkdownMarks` (M2 consolidation), but
 * intentionally renders `reference` marks as a markdown LINK — unlike
 * `deltaToMarkdownInline`'s plain-text reference projection — because this
 * projection feeds `react-markdown` in the browser, where a real link is
 * useful. See delta-markdown.ts's module header for the full rationale; do
 * not reconcile the two behaviors.
 */
export function deltaToMarkdown(text: DeltaSpan[] | undefined): string {
  if (!text) return "";
  return text
    .map((span) => {
      const attrs = span.attributes;
      if (attrs?.reference) return `[${span.insert}](${attrs.reference.path})`;
      return wrapMarkdownMarks(span.insert, attrs);
    })
    .join("");
}

/** Plain-text projection of delta spans (code blocks, alt text). */
export function deltaToPlainText(text: DeltaSpan[] | undefined): string {
  return deltaToPlainTextInline(text);
}

function el(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  return createElement(tag, props, ...children);
}

function blockAttrs(block: DocBlock): Record<string, unknown> {
  return {
    "data-doc-block": block.type,
    "data-block-id": block.id,
    "data-docs-target": "true",
    "data-docs-target-type": block.type,
  };
}

/**
 * Muted dashed-border placeholder card shown (inside the standard blockAttrs
 * wrapper, so targeting attributes keep working) when a block's body/props
 * don't match the shape its descriptor expects. Shared by the parse-reuse
 * adapters and the props-driven structured-table/interaction-surface
 * descriptors.
 */
function invalidBlockPlaceholder(
  block: DocBlock,
  ctx: DocBlockRenderContext,
  label: string,
): ReactNode {
  return el(
    "div",
    { key: block.id, ...blockAttrs(block) },
    el(
      "div",
      {
        className:
          "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
      },
      `Invalid ${label} block — see agent description for the expected shape.`,
    ),
    ctx.renderChildren(block),
  );
}

type MdxAdapterOptions = {
  type: DocBlockType;
  /** The docs-block component implementation the block type delegates to. */
  block: DocsMdxBlock<any>;
  /** Builds the block component's parsed `data` from the doc block + markdown body. */
  data: (block: DocBlock, body: string) => Record<string, unknown>;
};

/**
 * Adapts a docs-block component implementation (D28 — "the existing
 * docs-blocks registry becomes the block registry"): constructs the parsed
 * block the component expects from doc.json props + a delta->markdown body
 * projection, and reuses its render + agentDescription verbatim.
 */
function mdxAdapterDescriptor(options: MdxAdapterOptions): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    type: options.type,
    targetKind: mdxBlock.targetKind,
    label: mdxBlock.label,
    agentDescription: mdxBlock.agentDescription,
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const body = deltaToMarkdown(block.text);
      const rendered = mdxBlock.render(
        {
          tag: mdxBlock.tag,
          type: mdxBlock.type,
          targetKind: mdxBlock.targetKind,
          sourceId: block.id,
          data: options.data(block, body),
        },
        { renderMarkdown: ctx.renderMarkdown },
      );
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        rendered,
        ctx.renderChildren(block),
      );
    },
  };
}

/**
 * A docs-block component implementation that still carries its MDX-era
 * `parse()` (mermaid). The adapter below reuses that parser
 * instead of hand-building `data`.
 */
type ParseableDocsMdxBlock = DocsMdxBlock<any> & {
  parse(input: {
    tag: string;
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<any> | null;
};

type ParsedMdxAdapterOptions = {
  type: DocBlockType;
  /** The docs-block component implementation the block type delegates to. */
  block: ParseableDocsMdxBlock;
  /**
   * One-sentence body-format hint (the doc.json body grammar) appended to the
   * component's own agentDescription — doc.json authors write the block's
   * body into `text` delta spans, so the agent surface must spell out the
   * grammar the component's parse() expects.
   */
  bodyHint: string;
};

/**
 * Adapts a docs-block component by REUSING its MDX-era parser (parse-reuse
 * adapter): the doc.json convention for this block type is that the old
 * MDX attrs live in `props` (scalars, stringified) and the old MDX body
 * lives in the block's `text` delta spans (projected to markdown via
 * `deltaToMarkdown`, exactly like `mdxAdapterDescriptor`). `attrs.id` is
 * always the block's own id — every parser requires it. On a null parse
 * (body doesn't match the grammar) the block type renders the muted
 * dashed-border placeholder card instead of throwing, still wrapped with
 * `blockAttrs` so targeting attributes exist.
 */
function parsedMdxAdapterDescriptor(options: ParsedMdxAdapterOptions): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    type: options.type,
    targetKind: mdxBlock.targetKind,
    label: mdxBlock.label,
    agentDescription: `${mdxBlock.agentDescription} ${options.bodyHint}`,
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const body = deltaToMarkdown(block.text);
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(block.props)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          attrs[key] = String(value);
        }
      }
      attrs.id = block.id;
      const parsed = mdxBlock.parse({ tag: mdxBlock.tag, attrs, body, source: body });
      if (!parsed) {
        return invalidBlockPlaceholder(block, ctx, mdxBlock.label);
      }
      const rendered = mdxBlock.render(parsed, { renderMarkdown: ctx.renderMarkdown });
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        rendered,
        ctx.renderChildren(block),
      );
    },
  };
}

const FILE_TREE_CHANGES = ["added", "removed", "modified", "renamed"] as const;

/**
 * `file-tree` props guard: entries need a string `path`; the optional v2
 * fields (`note`, `change`, `from`) pass through only when well-typed —
 * malformed entries are dropped and malformed optional fields stripped
 * rather than failing the block.
 */
function fileTreeEntries(block: DocBlock): Array<Record<string, unknown>> {
  const raw = block.props.entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string",
    )
    .map((entry) => ({
      path: entry.path,
      ...(typeof entry.note === "string" && entry.note.trim() ? { note: entry.note } : {}),
      ...(FILE_TREE_CHANGES.includes(entry.change as (typeof FILE_TREE_CHANGES)[number])
        ? { change: entry.change }
        : {}),
      ...(typeof entry.from === "string" && entry.from.trim() ? { from: entry.from } : {}),
    }));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * `code` annotation props guard: `props.annotations` entries need a string
 * `lines` ("4", "4-9", "1,4-6") and a string `note`; `label` is optional.
 * Malformed entries are skipped rather than failing the block; returns null
 * when nothing valid remains, which keeps the plain `<pre>` path in charge.
 */
function codeAnnotations(block: DocBlock): CodeAnnotation[] | null {
  const raw = block.props.annotations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const annotations: CodeAnnotation[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) continue;
    const { lines, label, note } = entry;
    if (typeof lines !== "string" || !lines.trim()) continue;
    if (typeof note !== "string" || !note.trim()) continue;
    annotations.push({ lines, note, ...(typeof label === "string" && label ? { label } : {}) });
  }
  return annotations.length > 0 ? annotations : null;
}

type StructuredTableData = {
  title?: string;
  density?: StructuredTableDensity;
  columns: string[];
  rows: string[][];
};

/**
 * `structured-table` props guard: `columns` must be a non-empty all-string
 * array and `rows` an array of all-string arrays (the component pads ragged
 * rows itself). Null -> the invalid-block placeholder.
 */
function structuredTableData(block: DocBlock): StructuredTableData | null {
  const { columns, rows } = block.props;
  if (!Array.isArray(columns) || columns.length === 0) return null;
  if (!columns.every((column): column is string => typeof column === "string")) return null;
  if (!Array.isArray(rows)) return null;
  if (
    !rows.every(
      (row): row is string[] =>
        Array.isArray(row) && row.every((cell) => typeof cell === "string"),
    )
  ) {
    return null;
  }
  const density = stringProp(block, "density");
  return {
    title: stringProp(block, "title"),
    density:
      density === "compact" || density === "normal" || density === "relaxed"
        ? density
        : undefined,
    columns,
    rows,
  };
}

const INTERACTION_SURFACE_KINDS = ["action", "query", "event"] as const;

/**
 * `interaction-surface` props guard: `operations` must be a non-empty array
 * of `{ name: string, description?, params?: [{ name, type?, required?,
 * description? }], returns?, kind?: "action" | "query" | "event" }`.
 * Any malformed operation/param invalidates the block (null -> the
 * invalid-block placeholder) — a silently half-rendered surface is worse for
 * review than a visible "fix your props" card.
 */
function interactionSurfaceOperations(block: DocBlock): InteractionSurfaceOperation[] | null {
  const raw = block.props.operations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const operations: InteractionSurfaceOperation[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) return null;
    const { name, description, params, returns, kind } = entry;
    if (typeof name !== "string" || !name.trim()) return null;
    if (description !== undefined && typeof description !== "string") return null;
    if (returns !== undefined && typeof returns !== "string") return null;
    if (
      kind !== undefined &&
      !INTERACTION_SURFACE_KINDS.includes(kind as (typeof INTERACTION_SURFACE_KINDS)[number])
    ) {
      return null;
    }
    let operationParams: InteractionSurfaceOperation["params"];
    if (params !== undefined) {
      if (!Array.isArray(params)) return null;
      operationParams = [];
      for (const param of params) {
        if (!isPlainRecord(param)) return null;
        if (typeof param.name !== "string" || !param.name.trim()) return null;
        if (param.type !== undefined && typeof param.type !== "string") return null;
        if (param.required !== undefined && typeof param.required !== "boolean") return null;
        if (param.description !== undefined && typeof param.description !== "string") return null;
        operationParams.push({
          name: param.name,
          ...(param.type !== undefined ? { type: param.type } : {}),
          ...(param.required !== undefined ? { required: param.required } : {}),
          ...(param.description !== undefined ? { description: param.description } : {}),
        });
      }
    }
    operations.push({
      name,
      ...(description !== undefined ? { description } : {}),
      ...(operationParams !== undefined ? { params: operationParams } : {}),
      ...(returns !== undefined ? { returns } : {}),
      ...(kind !== undefined ? { kind: kind as InteractionSurfaceOperation["kind"] } : {}),
    });
  }
  return operations;
}

function buildRegistry(): Map<DocBlockType, DocBlockDescriptor> {
  const registry = new Map<DocBlockType, DocBlockDescriptor>();
  const add = (descriptor: DocBlockDescriptor) => registry.set(descriptor.type, descriptor);

  // ---- core block types (minimal tracer descriptors) -------------------------
  add({
    type: "paragraph",
    targetKind: "paragraph",
    label: "Paragraph",
    agentDescription: "A paragraph of rich text (delta spans).",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el("p", { className: PARAGRAPH_CLASSES }, ctx.renderText(block.text)),
        ctx.renderChildren(block),
      ),
  });

  add({
    type: "heading",
    targetKind: "heading",
    label: "Heading",
    agentDescription: "A section heading; props.level selects h1-h6.",
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const rawLevel = block.props.level;
      const level =
        typeof rawLevel === "number" && Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6
          ? rawLevel
          : 2;
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          `h${level}`,
          { className: HEADING_CLASSES },
          ctx.renderText(block.text),
        ),
        ctx.renderChildren(block),
      );
    },
  });

  add({
    type: "list-item",
    targetKind: "list-item",
    label: "List Item",
    agentDescription: "A list item; nesting via child list-item blocks (D25 normalized tree).",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        {
          key: block.id,
          ...blockAttrs(block),
          role: "listitem",
          className: LIST_ITEM_CLASSES,
        },
        el("span", { className: LIST_ITEM_BULLET_CLASSES, "aria-hidden": "true" }, "•"),
        el(
          "div",
          { className: LIST_ITEM_CONTENT_CLASSES },
          ctx.renderText(block.text),
          el("div", { className: LIST_ITEM_CHILDREN_CLASSES }, ctx.renderChildren(block)),
        ),
      ),
  });

  add({
    type: "code",
    targetKind: "code",
    label: "Code",
    agentDescription:
      "A code block; props.language for syntax hint, text is the source. Optional props.annotations — [{ lines, label?, note }] with 1-indexed lines like \"4\", \"4-9\", or \"1,4-6\" — render as click-pairable side notes next to the code.",
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const annotations = codeAnnotations(block);
      if (annotations) {
        return el(
          "div",
          { key: block.id, ...blockAttrs(block) },
          createElement(AnnotatedCodeBlock, {
            id: block.id,
            language: stringProp(block, "language"),
            code: deltaToPlainText(block.text),
            annotations,
          }),
          ctx.renderChildren(block),
        );
      }
      // Plain (annotation-free) path: display-only JSON pretty-print + real
      // syntax highlighting (docs-blocks/code/highlight.ts). The highlighted
      // HTML is hljs-generated token spans over escaped text (or fully
      // escaped plain text when no grammar matches) — safe for
      // dangerouslySetInnerHTML; stored block text is never mutated.
      const language = stringProp(block, "language");
      const displayCode = prettyPrintIfJson(deltaToPlainText(block.text), language);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "pre",
          {
            className: CODE_BLOCK_CLASSES,
            "data-language": language,
          },
          el("code", {
            className: "hljs",
            dangerouslySetInnerHTML: { __html: highlightCode(displayCode, language).join("\n") },
          }),
        ),
        ctx.renderChildren(block),
      );
    },
  });

  add({
    type: "quote",
    targetKind: "quote",
    label: "Quote",
    agentDescription: "A block quote of rich text.",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "blockquote",
          {
            className: QUOTE_CLASSES,
          },
          ctx.renderText(block.text),
        ),
        ctx.renderChildren(block),
      ),
  });

  add({
    type: "divider",
    targetKind: "divider",
    label: "Divider",
    agentDescription: "A horizontal rule separating sections.",
    patchOps: STRUCTURAL_OPS,
    render: (block) => el("hr", { key: block.id, ...blockAttrs(block), className: "my-6 border-border" }),
  });

  add({
    type: "image",
    targetKind: "image",
    label: "Image",
    agentDescription:
      "An image from the doc bundle's assets/images/ (D30); props: src, alt, caption.",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const src = stringProp(block, "src");
      const resolvedSrc = src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined;
      const caption = stringProp(block, "caption");
      return el(
        "figure",
        { key: block.id, ...blockAttrs(block), className: "not-prose my-4" },
        resolvedSrc
          ? el("img", {
              src: resolvedSrc,
              alt: stringProp(block, "alt") ?? caption ?? "",
              className: "max-w-full rounded-md border",
            })
          : el(
              "div",
              {
                className:
                  "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
              },
              "Image block is missing a src.",
            ),
        caption
          ? el(
              "figcaption",
              { className: "mt-1 text-xs text-muted-foreground" },
              caption,
            )
          : null,
        ctx.renderChildren(block),
      );
    },
  });

  add({
    type: "video",
    targetKind: "video",
    label: VIDEO_LABEL,
    agentDescription: VIDEO_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const src = stringProp(block, "src");
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(VideoBlock, {
          id: block.id,
          src,
          // Same optional plumbing as the image descriptor above: the host
          // decides HOW a bundle-relative src resolves; raw src otherwise.
          resolvedSrc: src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined,
          url: stringProp(block, "url"),
          title: stringProp(block, "title"),
          caption: stringProp(block, "caption"),
        }),
        ctx.renderChildren(block),
      );
    },
  });

  add({
    type: "canvas",
    targetKind: "canvas",
    label: "Canvas",
    agentDescription:
      "An embedded interactive canvas; props: canvasId (central canvas id) or src (legacy sidecar path), view (optional container id crop, D4).",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const canvasId = stringProp(block, "canvasId");
      const src = stringProp(block, "src");
      const view = stringProp(block, "view");
      const title = stringProp(block, "title");
      const embed =
        (canvasId || src) && ctx.renderCanvas
          ? ctx.renderCanvas({ id: block.id, canvasId, src, view, title })
          : el(
              "div",
              {
                className:
                  "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
              },
              canvasId || src
                ? `Canvas embed: ${canvasId ?? src}`
                : "Canvas block is missing a canvasId or src.",
            );
      return el(
        "div",
        {
          key: block.id,
          ...blockAttrs(block),
          "data-canvas-id": canvasId,
          "data-canvas-src": src,
          "data-canvas-view": view,
          className: "not-prose my-4",
        },
        embed,
        ctx.renderChildren(block),
      );
    },
  });

  // ---- block types adapted from existing docs-blocks (D28) -------------------
  add(
    mdxAdapterDescriptor({
      type: "callout",
      block: new CalloutDocsBlock(),
      data: (block, body) => ({
        id: block.id,
        tone: stringProp(block, "tone") ?? "info",
        kind: stringProp(block, "kind"),
        title: stringProp(block, "title"),
        body,
      }),
    }),
  );

  add(
    mdxAdapterDescriptor({
      type: "file-tree",
      block: new FileTreeDocsBlock(),
      data: (block) => ({
        id: block.id,
        title: stringProp(block, "title"),
        entries: fileTreeEntries(block),
      }),
    }),
  );

  // ---- structured block types rendered straight from typed props -------------
  add({
    type: "structured-table",
    targetKind: "structured-table",
    label: STRUCTURED_TABLE_LABEL,
    agentDescription: STRUCTURED_TABLE_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const data = structuredTableData(block);
      if (!data) return invalidBlockPlaceholder(block, ctx, STRUCTURED_TABLE_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(StructuredTableBlock, { id: block.id, ...data }),
        ctx.renderChildren(block),
      );
    },
  });

  add({
    type: "interaction-surface",
    targetKind: "interaction-surface",
    label: INTERACTION_SURFACE_LABEL,
    agentDescription: INTERACTION_SURFACE_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const operations = interactionSurfaceOperations(block);
      if (!operations) return invalidBlockPlaceholder(block, ctx, INTERACTION_SURFACE_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(InteractionSurfaceBlock, {
          id: block.id,
          title: stringProp(block, "title"),
          operations,
        }),
        ctx.renderChildren(block),
      );
    },
  });

  // ---- parse-reuse adapters (body grammar lives in `text` delta spans) -------
  add(
    parsedMdxAdapterDescriptor({
      type: "mermaid",
      block: new MermaidDocsBlock(),
      bodyHint:
        "Body is the non-blank Mermaid diagram source (e.g. starting `flowchart LR`); props: title, caption, diagramType (defaults to the source's first word).",
    }),
  );

  return registry;
}

const BLOCK_REGISTRY = buildRegistry();

export function getDocBlockDescriptor(type: string): DocBlockDescriptor | null {
  return BLOCK_REGISTRY.get(type as DocBlockType) ?? null;
}

/** @deprecated Use getDocBlockDescriptor. */
export const getDocFlavourDescriptor = getDocBlockDescriptor;

export function describeDocBlocksForAgent(): Array<{
  type: DocBlockType;
  targetKind: string;
  label: string;
  description: string;
  patchOps: readonly string[];
}> {
  return DOC_BLOCK_TYPES.map((type) => {
    const descriptor = BLOCK_REGISTRY.get(type) as DocBlockDescriptor;
    return {
      type,
      targetKind: descriptor.targetKind,
      label: descriptor.label,
      description: descriptor.agentDescription,
      patchOps: descriptor.patchOps,
    };
  });
}

/** @deprecated Use describeDocBlocksForAgent. */
export const describeDocFlavoursForAgent = describeDocBlocksForAgent;
