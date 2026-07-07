"use client";

import { createElement, type ReactNode } from "react";
import type { DocsMdxBlock, DocsMdxParsedBlock } from "../docs-blocks/base";
import { AgentContractDocsBlock } from "../docs-blocks/agent-contract/AgentContractDocsBlock";
import { CalloutDocsBlock } from "../docs-blocks/callout/CalloutDocsBlock";
import { DecisionDocsBlock } from "../docs-blocks/decision/DecisionDocsBlock";
import { FileTreeDocsBlock } from "../docs-blocks/file-tree/FileTreeDocsBlock";
import {
  AnnotatedCodeDocsBlock,
  ApiEndpointDocsBlock,
  ApiSurfaceDocsBlock,
  DataModelDocsBlock,
  DiffDocsBlock,
  ImplementationMapDocsBlock,
  JsonExplorerDocsBlock,
} from "../docs-blocks/engineering/EngineeringDocsBlocks";
import { MermaidDocsBlock } from "../docs-blocks/mermaid/MermaidDocsBlock";
import {
  assumptionDocsBlock,
  constraintDocsBlock,
} from "../docs-blocks/semantic/SemanticDocsBlocks";
import {
  ChecklistDocsBlock,
  ColumnsDocsBlock,
  StructuredTableDocsBlock,
  TabsDocsBlock,
} from "../docs-blocks/support/SupportDocsBlocks";
import type { DeltaSpan, DocBlock, DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import { deltaToPlainTextInline, wrapMarkdownMarks } from "@codecaine-ai/docs-model/delta-markdown";
import {
  CARD_BODY_TEXT_CLASSES,
  CODE_BLOCK_CLASSES,
  HEADING_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CHILDREN_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
  PARAGRAPH_CLASSES,
  QUOTE_CLASSES,
  SEMANTIC_CARD_CLASSES,
} from "./block-classes";

/**
 * Flavour registry (D28): maps every doc.json flavour to a render/agent
 * descriptor. Where a doc.json flavour aligns with a docs-block component
 * implementation the descriptor delegates to that block's render — via
 * `mdxAdapterDescriptor` (decision, callout, agent-contract, file-tree,
 * constraint, assumption: `data` built by hand from props) or
 * `parsedMdxAdapterDescriptor` (the restored engineering/support/mermaid
 * flavours: `data` built by REUSING the component's MDX-era parse() over a
 * delta->markdown body projection). The blocks are imported directly; the
 * MDX-era tag registry and MdxDocumentRenderer are gone. The remaining
 * flavours get minimal tracer descriptors here. DocBlockRenderer supplies
 * the concrete render context (delta spans -> inline React, recursive
 * children, canvas embeds, markdown projection).
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
   * Resolves an `image`/`attachment` block's raw `src` prop (often a
   * bundle-relative `./assets/images/...` or `./assets/attachments/...`
   * path) to a fetchable URL — analogous to `renderCanvas` above, this is
   * purely optional plumbing: the host decides HOW to resolve (e.g. via the
   * `/docs/asset` GET route + `resolveBundleAssetSrc`), the flavour
   * descriptors below just call it if present. When omitted, `image`/
   * `attachment` fall back to using the raw `src` unchanged (non-breaking
   * for existing callers that don't pass this prop).
   */
  resolveAssetSrc?: (src: string) => string;
};

export type DocBlockDescriptor = {
  flavour: DocBlockType;
  targetKind: string;
  label: string;
  agentDescription: string;
  /** Typed doc ops applicable to this flavour (see doc-ops.ts DocOp union). */
  patchOps: readonly string[];
  render: (block: DocBlock, ctx: DocBlockRenderContext) => ReactNode;
};

const STRUCTURAL_OPS = ["insertBlock", "updateBlock", "deleteBlock", "moveBlock"] as const;
const TEXT_OPS = [...STRUCTURAL_OPS, "splitBlock", "mergeBlocks"] as const;

function stringProp(block: DocBlock, key: string): string | undefined {
  const value = block.props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberProp(block: DocBlock, key: string): number | undefined {
  const value = block.props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Human-readable byte size (e.g. `142 KB`) for the attachment card (D35). */
function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

/** Uppercase extension badge for the attachment card (e.g. "PDF", "ZIP"). */
function fileExtensionBadge(name: string): string | undefined {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1]!.toUpperCase() : undefined;
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

type SimpleCardOptions = {
  flavour: DocBlockType;
  label: string;
  agentDescription: string;
  targetKind?: string;
};

function el(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  return createElement(tag, props, ...children);
}

function blockAttrs(block: DocBlock): Record<string, unknown> {
  return {
    "data-doc-block": block.flavour,
    "data-block-id": block.id,
    "data-docs-target": "true",
    "data-docs-target-type": block.flavour,
  };
}

/**
 * Minimal labeled card for semantic/engineering flavours that have no
 * aligned MDX implementation yet (observation, outcome, requirement,
 * implementation, testing). Mirrors the semantic docs-block chrome.
 */
function simpleCardDescriptor(options: SimpleCardOptions): DocBlockDescriptor {
  return {
    flavour: options.flavour,
    targetKind: options.targetKind ?? options.flavour,
    label: options.label,
    agentDescription: options.agentDescription,
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const title = stringProp(block, "title");
      return el(
        "section",
        {
          key: block.id,
          ...blockAttrs(block),
          className: SEMANTIC_CARD_CLASSES,
        },
        el(
          "div",
          { className: "mb-2 flex flex-wrap items-center gap-2" },
          el(
            "span",
            {
              className:
                "font-display text-xs font-medium uppercase tracking-wider text-muted-foreground",
            },
            options.label,
          ),
          el("span", { className: "font-mono text-[11px] text-muted-foreground" }, block.id),
        ),
        title
          ? el(
              "h3",
              { className: "mb-2 font-display text-sm font-semibold text-foreground" },
              title,
            )
          : null,
        block.text && block.text.length > 0
          ? el(
              "div",
              { className: CARD_BODY_TEXT_CLASSES },
              ctx.renderText(block.text),
            )
          : null,
        ctx.renderChildren(block),
      );
    },
  };
}

type MdxAdapterOptions = {
  flavour: DocBlockType;
  /** The docs-block component implementation the flavour delegates to. */
  block: DocsMdxBlock<any>;
  /** Builds the block component's parsed `data` from the doc block + markdown body. */
  data: (block: DocBlock, body: string) => Record<string, unknown>;
};

/**
 * Adapts a docs-block component implementation (D28 — "the existing
 * docs-blocks registry becomes the flavour registry"): constructs the parsed
 * block the component expects from doc.json props + a delta->markdown body
 * projection, and reuses its render + agentDescription verbatim.
 */
function mdxAdapterDescriptor(options: MdxAdapterOptions): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    flavour: options.flavour,
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
 * `parse()` (the restored engineering/support/mermaid blocks). The adapter
 * below reuses that parser instead of hand-building `data`.
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
  flavour: DocBlockType;
  /** The docs-block component implementation the flavour delegates to. */
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
 * Adapts a restored docs-block component by REUSING its MDX-era parser
 * (parse-reuse adapter): the doc.json convention for these flavours is that
 * the old MDX attrs live in `props` (scalars, stringified) and the old MDX
 * body lives in the block's `text` delta spans (projected to markdown via
 * `deltaToMarkdown`, exactly like `mdxAdapterDescriptor`). `attrs.id` is
 * always the block's own id — every restored parser requires it. On a null
 * parse (body doesn't match the grammar) the flavour renders a muted
 * dashed-border placeholder card instead of throwing, still wrapped with
 * `blockAttrs` so targeting attributes exist.
 */
function parsedMdxAdapterDescriptor(options: ParsedMdxAdapterOptions): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    flavour: options.flavour,
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
        return el(
          "div",
          { key: block.id, ...blockAttrs(block) },
          el(
            "div",
            {
              className:
                "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
            },
            `Invalid ${mdxBlock.label} block — see agent description for the expected body format.`,
          ),
          ctx.renderChildren(block),
        );
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

function fileTreeEntries(block: DocBlock): Array<Record<string, unknown>> {
  const raw = block.props.entries;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string",
  );
}

function buildRegistry(): Map<DocBlockType, DocBlockDescriptor> {
  const registry = new Map<DocBlockType, DocBlockDescriptor>();
  const add = (descriptor: DocBlockDescriptor) => registry.set(descriptor.flavour, descriptor);

  // ---- core flavours (minimal tracer descriptors) -------------------------
  add({
    flavour: "paragraph",
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
    flavour: "heading",
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
    flavour: "list-item",
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
    flavour: "code",
    targetKind: "code",
    label: "Code",
    agentDescription: "A code block; props.language for syntax hint, text is the source.",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "pre",
          {
            className: CODE_BLOCK_CLASSES,
            "data-language": stringProp(block, "language"),
          },
          el("code", null, deltaToPlainText(block.text)),
        ),
        ctx.renderChildren(block),
      ),
  });

  add({
    flavour: "quote",
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
    flavour: "divider",
    targetKind: "divider",
    label: "Divider",
    agentDescription: "A horizontal rule separating sections.",
    patchOps: STRUCTURAL_OPS,
    render: (block) => el("hr", { key: block.id, ...blockAttrs(block), className: "my-6 border-border" }),
  });

  add({
    flavour: "image",
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
    flavour: "attachment",
    targetKind: "attachment",
    label: "Attachment",
    agentDescription:
      "A file attachment card (D30/D35 — PDFs get NO inline viewer in v1, just a download card); props: src, name, size (bytes).",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const src = stringProp(block, "src");
      const name = stringProp(block, "name") ?? src ?? "attachment";
      const size = numberProp(block, "size");
      const extBadge = fileExtensionBadge(name) ?? "FILE";
      const href = src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined;
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(
          "a",
          {
            className:
              "not-prose my-4 flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm text-foreground",
            href,
            download: true,
          },
          el(
            "span",
            {
              className:
                "font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground",
            },
            extBadge,
          ),
          el("span", { className: "min-w-0 flex-1 break-all" }, name),
          size !== undefined
            ? el(
                "span",
                { className: "shrink-0 text-xs text-muted-foreground" },
                formatByteSize(size),
              )
            : null,
        ),
        ctx.renderChildren(block),
      );
    },
  });

  add({
    flavour: "canvas",
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

  // ---- flavours adapted from existing docs-blocks (D28) -------------------
  add(
    mdxAdapterDescriptor({
      flavour: "decision",
      block: new DecisionDocsBlock(),
      data: (block, body) => ({
        id: block.id,
        status: stringProp(block, "status") ?? "proposed",
        title: stringProp(block, "title"),
        body,
      }),
    }),
  );

  add(
    mdxAdapterDescriptor({
      flavour: "callout",
      block: new CalloutDocsBlock(),
      data: (block, body) => ({
        id: block.id,
        tone: stringProp(block, "tone") ?? "info",
        title: stringProp(block, "title"),
        body,
      }),
    }),
  );

  add(
    mdxAdapterDescriptor({
      flavour: "agent-contract",
      block: new AgentContractDocsBlock(),
      data: (block, body) => ({
        id: block.id,
        agent: stringProp(block, "agent"),
        title: stringProp(block, "title"),
        tools: stringProp(block, "tools"),
        approvals: stringProp(block, "approvals"),
        body,
      }),
    }),
  );

  add(
    mdxAdapterDescriptor({
      flavour: "file-tree",
      block: new FileTreeDocsBlock(),
      data: (block) => ({
        id: block.id,
        title: stringProp(block, "title"),
        entries: fileTreeEntries(block),
      }),
    }),
  );

  add(
    mdxAdapterDescriptor({
      flavour: "constraint",
      block: constraintDocsBlock,
      data: (block, body) => {
        const owner = stringProp(block, "owner");
        return {
          id: block.id,
          title: stringProp(block, "title"),
          body,
          primary: { label: "Severity", value: stringProp(block, "severity") ?? "hard" },
          meta: owner ? [{ label: "Owner", value: owner }] : [],
        };
      },
    }),
  );

  add(
    mdxAdapterDescriptor({
      flavour: "assumption",
      block: assumptionDocsBlock,
      data: (block, body) => {
        const owner = stringProp(block, "owner");
        return {
          id: block.id,
          title: stringProp(block, "title"),
          body,
          primary: { label: "Confidence", value: stringProp(block, "confidence") ?? "medium" },
          meta: owner ? [{ label: "Owner", value: owner }] : [],
        };
      },
    }),
  );

  // ---- semantic/engineering flavours without an aligned MDX block ---------
  add(
    simpleCardDescriptor({
      flavour: "observation",
      label: "Observation",
      agentDescription: "A recorded observation about system or user behavior.",
    }),
  );
  add(
    simpleCardDescriptor({
      flavour: "outcome",
      label: "Outcome",
      agentDescription: "An outcome or result worth preserving as review context.",
    }),
  );
  add(
    simpleCardDescriptor({
      flavour: "requirement",
      label: "Requirement",
      agentDescription: "A product or engineering requirement with an explicit id.",
    }),
  );
  add(
    simpleCardDescriptor({
      flavour: "implementation",
      label: "Implementation",
      agentDescription: "Implementation notes tied to source paths and symbols.",
    }),
  );
  add(
    simpleCardDescriptor({
      flavour: "testing",
      label: "Testing",
      agentDescription: "Testing notes: coverage, harnesses, and verification steps.",
    }),
  );

  // ---- restored flavours — parse-reuse adapters over the restored
  // ---- engineering/support/mermaid docs-block components -------------------
  add(
    parsedMdxAdapterDescriptor({
      flavour: "annotated-code",
      block: new AnnotatedCodeDocsBlock(),
      bodyHint:
        "Body is the code itself, or `--- code ---` / `--- annotations ---` sections whose annotation bullets are `- 4-9|Label -- note` (line range, optional label, note); props: filename, language.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "api-endpoint",
      block: new ApiEndpointDocsBlock(),
      bodyHint:
        "Props method (HTTP verb) and path are REQUIRED (optional: summary, auth, deprecated, change); body is freeform markdown plus `- param <in> <name> [type] [required|optional] :: desc` and `- response <status> :: desc` bullets, and may be empty.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "api-surface",
      block: new ApiSurfaceDocsBlock(),
      bodyHint:
        "Body is one `- METHOD /path -- summary` bullet per endpoint (at least one); optional prop: title.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "data-model",
      block: new DataModelDocsBlock(),
      bodyHint:
        "Body is `--- EntityName ---` sections of `- field: type [pk] [nullable] [fk=Other.field] -- note` bullets (at least one entity with one field); optional prop: title.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "diff",
      block: new DiffDocsBlock(),
      bodyHint:
        "Body requires BOTH a `--- before ---` and an `--- after ---` section; props: filename, language, mode (split|unified).",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "implementation-map",
      block: new ImplementationMapDocsBlock(),
      bodyHint:
        "Body is `- [added|modified|removed|renamed] `path` (lang) -- note` bullets (at least one; change prefix and lang optional, note required); optional prop: title.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "json-explorer",
      block: new JsonExplorerDocsBlock(),
      bodyHint:
        "Body is the non-empty JSON text itself (invalid JSON still renders, with an error banner); props: title, collapsedDepth.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "checklist",
      block: new ChecklistDocsBlock(),
      bodyHint:
        "Body is markdown task-list rows `- [x] label -- note` (at least one; note optional); optional prop: title.",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "columns",
      block: new ColumnsDocsBlock(),
      bodyHint:
        "Body splits into columns on `--- Label ---` delimiters or ##/### headings (at least one section); props: title, columns (2-3).",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "structured-table",
      block: new StructuredTableDocsBlock(),
      bodyHint:
        "Body is a markdown pipe table: header row, `| --- |` separator row, and at least one data row; props: title, density (compact|normal|relaxed).",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "tabs",
      block: new TabsDocsBlock(),
      bodyHint:
        "Body splits into tabs on `--- Label ---` delimiters or ##/### headings (at least one section); props: title, orientation (horizontal|vertical).",
    }),
  );
  add(
    parsedMdxAdapterDescriptor({
      flavour: "mermaid",
      block: new MermaidDocsBlock(),
      bodyHint:
        "Body is the non-blank Mermaid diagram source (e.g. starting `flowchart LR`); props: title, caption, diagramType (defaults to the source's first word).",
    }),
  );

  return registry;
}

const BLOCK_REGISTRY = buildRegistry();

export function getDocBlockDescriptor(flavour: string): DocBlockDescriptor | null {
  return BLOCK_REGISTRY.get(flavour as DocBlockType) ?? null;
}

export function describeDocBlocksForAgent(): Array<{
  flavour: DocBlockType;
  targetKind: string;
  label: string;
  description: string;
  patchOps: readonly string[];
}> {
  return DOC_BLOCK_TYPES.map((flavour) => {
    const descriptor = BLOCK_REGISTRY.get(flavour) as DocBlockDescriptor;
    return {
      flavour,
      targetKind: descriptor.targetKind,
      label: descriptor.label,
      description: descriptor.agentDescription,
      patchOps: descriptor.patchOps,
    };
  });
}
