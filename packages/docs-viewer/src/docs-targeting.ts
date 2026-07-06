import type { DocsAnchor, DocsSourceRange, DocsTarget } from "./annotations";

/**
 * The canonical "what counts as a targetable rendered block" selector —
 * shared with DocsViewer's rendered-target scan so the two can't drift.
 */
export const TARGET_SELECTOR = [
  "[data-docs-target]",
  "[data-mdx-block]",
  "[data-docs-block-type]",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "pre",
  "table",
].join(",");

const SKIP_SELECTOR = [
  "button",
  "textarea",
  "input",
  "select",
  "[contenteditable='true']",
  "[data-docs-target-chrome]",
].join(",");

export type ResolvedDocsTarget = {
  element: HTMLElement;
  anchor: DocsAnchor;
  label: string;
};

type BuildAnchorInput = {
  content: string;
  documentPath: string;
  contentHash: string;
};

export type DocsInteractionMode = "select" | "pinpoint" | "add";

function truncate(text: string, max = 64): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function findSourceRange(content: string, quote: string): DocsSourceRange | null {
  if (!quote) return null;
  const directIndex = content.indexOf(quote);
  if (directIndex >= 0) {
    return { start_offset: directIndex, end_offset: directIndex + quote.length };
  }

  const compactQuote = quote.replace(/\s+/g, " ").trim();
  if (!compactQuote) return null;
  const compactContent = content.replace(/\s+/g, " ");
  const compactIndex = compactContent.indexOf(compactQuote);
  if (compactIndex < 0) return null;
  return {
    start_offset: compactIndex,
    end_offset: compactIndex + compactQuote.length,
  };
}

function contextForRange(content: string, range: DocsSourceRange | null) {
  if (!range) return { context_before: "", context_after: "" };
  return {
    context_before: content
      .slice(Math.max(0, range.start_offset - 160), range.start_offset)
      .trim(),
    context_after: content.slice(range.end_offset, range.end_offset + 160).trim(),
  };
}

function textForElement(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Canonical block-type classification for a rendered element (shared with DocsViewer). */
export function blockTypeForElement(element: HTMLElement): string {
  const docsTargetType = element.dataset.docsTargetType;
  if (docsTargetType) return docsTargetType;
  const mdxType = element.dataset.docsBlockType;
  if (mdxType) return mdxType;
  const mdxTag = element.dataset.mdxBlock;
  if (mdxTag) return mdxTag.toLowerCase();

  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "p") return "paragraph";
  if (tag === "li") return "list-item";
  if (tag === "blockquote") return "blockquote";
  if (tag === "pre") return "code";
  if (tag === "table") return "table";
  return tag;
}

function labelForElement(element: HTMLElement, blockType: string): string {
  const text = truncate(textForElement(element), 42);
  if (element.dataset.docsTargetLabel) return element.dataset.docsTargetLabel;
  if (element.dataset.mdxBlock) {
    return text ? `${element.dataset.mdxBlock}: ${text}` : `${element.dataset.mdxBlock} block`;
  }
  if (blockType === "heading") return text ? `heading: ${text}` : "heading";
  if (blockType === "paragraph") return text ? `paragraph: ${text}` : "paragraph";
  if (blockType === "list-item") return text ? `list item: ${text}` : "list item";
  if (blockType === "code") return "code block";
  return text ? `${blockType}: ${text}` : blockType;
}

function blockIdForElement(
  element: HTMLElement,
  blockType: string,
  quote: string,
  range: DocsSourceRange | null,
): string {
  const sourceId = element.dataset.sourceId?.trim();
  if (sourceId) return sourceId;
  const sourceStart = element.dataset.sourceStart;
  if (sourceStart) return `${blockType}:${sourceStart}`;
  if (range) return `${blockType}:${range.start_offset}`;
  return `${blockType}:${stableHash(quote)}`;
}

export function resolveDocsTargetElement(
  rawTarget: EventTarget | null,
  root: HTMLElement,
): HTMLElement | null {
  if (!(rawTarget instanceof HTMLElement)) return null;
  if (rawTarget.closest(SKIP_SELECTOR)) return null;
  if (!root.contains(rawTarget)) return null;

  const inlineCode = rawTarget.closest("code");
  if (inlineCode instanceof HTMLElement && !inlineCode.closest("pre")) {
    return inlineCode;
  }

  const stampedTarget = rawTarget.closest("[data-docs-target]");
  if (stampedTarget instanceof HTMLElement && root.contains(stampedTarget)) {
    return stampedTarget;
  }

  const mdxBlock = rawTarget.closest("[data-mdx-block],[data-docs-block-type]");
  if (mdxBlock instanceof HTMLElement && root.contains(mdxBlock)) {
    return mdxBlock;
  }

  const target = rawTarget.closest(TARGET_SELECTOR);
  if (!(target instanceof HTMLElement) || !root.contains(target)) return null;
  return target === root ? null : target;
}

export function buildBlockDocsTarget(
  element: HTMLElement,
  input: BuildAnchorInput,
): ResolvedDocsTarget | null {
  const quote = textForElement(element);
  if (!quote) return null;
  const range = findSourceRange(input.content, quote);
  const blockType = blockTypeForElement(element);
  const label = labelForElement(element, blockType);
  const blockId = blockIdForElement(element, blockType, quote, range);
  const target: DocsTarget = {
    kind: "block",
    label,
    block_id: blockId,
    block_type: blockType,
    text_quote: quote.slice(0, 2000),
    source_range: range,
  };

  return {
    element,
    label,
    anchor: {
      document_path: input.documentPath,
      content_hash: input.contentHash,
      block_id: blockId,
      source_range: range,
      text_quote: quote.slice(0, 2000),
      ...contextForRange(input.content, range),
      target_kind: target.kind,
      target,
    },
  };
}

export function buildTextRangeDocsTarget(
  selection: Selection,
  range: Range,
  input: BuildAnchorInput & { root: HTMLElement },
): ResolvedDocsTarget | null {
  const quote = selection.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;
  const commonElement =
    range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const containingBlock = commonElement
    ? resolveDocsTargetElement(commonElement, input.root)
    : null;
  const rangeElement = containingBlock ?? input.root;
  const sourceRange = findSourceRange(input.content, quote);
  const blockType = containingBlock ? blockTypeForElement(containingBlock) : "text";
  const blockId = containingBlock
    ? blockIdForElement(containingBlock, blockType, textForElement(containingBlock), sourceRange)
    : null;
  const label = `selected text: ${truncate(quote, 42)}`;
  const target: DocsTarget = {
    kind: "text_range",
    label,
    block_id: blockId,
    block_type: blockType,
    text_quote: quote.slice(0, 2000),
    source_range: sourceRange,
  };

  return {
    element: rangeElement,
    label,
    anchor: {
      document_path: input.documentPath,
      content_hash: input.contentHash,
      block_id: blockId,
      source_range: sourceRange,
      text_quote: quote.slice(0, 2000),
      ...contextForRange(input.content, sourceRange),
      target_kind: target.kind,
      target,
    },
  };
}

export function buildVisualPointDocsTarget(
  event: Pick<MouseEvent, "clientX" | "clientY" | "target">,
  input: BuildAnchorInput & { root: HTMLElement },
): ResolvedDocsTarget | null {
  if (!(event.target instanceof HTMLElement)) return null;
  if (!input.root.contains(event.target)) return null;
  if (event.target.closest(SKIP_SELECTOR)) return null;

  const rootRect = input.root.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0) return null;

  const x = Number(
    (
      Math.min(1, Math.max(0, (event.clientX - rootRect.left) / rootRect.width)) *
      100
    ).toFixed(2),
  );
  const y = Number(
    (
      Math.min(1, Math.max(0, (event.clientY - rootRect.top) / rootRect.height)) *
      100
    ).toFixed(2),
  );
  const pointQuote = `Visual point at ${x}%, ${y}%`;
  const blockElement = resolveDocsTargetElement(event.target, input.root);
  const blockTarget = blockElement ? buildBlockDocsTarget(blockElement, input) : null;
  const blockType = blockTarget?.anchor.target?.block_type ?? "document";
  const blockId = blockTarget?.anchor.block_id ?? null;
  const label = blockTarget
    ? `pinpoint on ${blockTarget.label}`
    : pointQuote;
  const target: DocsTarget = {
    kind: "visual_point",
    label,
    block_id: blockId,
    block_type: blockType,
    text_quote: blockTarget?.anchor.text_quote ?? pointQuote,
    source_range: blockTarget?.anchor.source_range ?? null,
    x,
    y,
    element_id: blockId ?? undefined,
    element_type: blockType,
  };

  return {
    element: blockTarget?.element ?? input.root,
    label,
    anchor: {
      document_path: input.documentPath,
      content_hash: input.contentHash,
      block_id: blockId,
      source_range: blockTarget?.anchor.source_range ?? null,
      text_quote: blockTarget?.anchor.text_quote ?? pointQuote,
      context_before: blockTarget?.anchor.context_before ?? "",
      context_after: blockTarget?.anchor.context_after ?? "",
      target_kind: target.kind,
      target,
    },
  };
}

export function composerPositionFromRect(rect: DOMRect) {
  const width = 340;
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - width / 2),
    Math.max(12, window.innerWidth - width - 12),
  );
  const top =
    rect.bottom + 10 + 260 < window.innerHeight
      ? rect.bottom + 10
      : Math.max(12, rect.top - 260);

  return { top, left };
}
