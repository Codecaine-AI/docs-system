"use client";

/**
 * Doc targeting layer — the Plannotator hover/pinpoint/selection UX extracted
 * from Spectre's app-level DocsViewer so every host gets it from the
 * framework (architecture rule: the docs framework owns the FULL docs UX;
 * hosts only wire clients/embeds).
 *
 * What it owns, verbatim from the Spectre implementation:
 *  - hover targeting: moving the pointer over a rendered block (anything
 *    matched by `TARGET_SELECTOR`) outlines it (`docs-target-hovered`) and
 *    shows a floating chip with the resolved target's type + label,
 *  - pinpoint mode: click resolves the block into a `ResolvedDocsTarget`
 *    (either reported to the host via `onTargetSelect`, or handled by the
 *    built-in annotation toolbar -> comment/delete popover flow),
 *  - add mode: click opens the canvas-insert popover (`onInsertCanvas`),
 *  - select mode: text selections become `text_range` targets,
 *  - the selected-target ring overlay (uncontrolled after a click, or
 *    controlled through `selectedTargetId` for hosts that keep their own
 *    selection state, e.g. the workbench's Plannotator pane),
 *  - annotation highlight marks over queued annotations (with the full
 *    dangling-anchor fallback chain — unresolvable anchors simply render no
 *    mark, they never crash),
 *  - the CSS for all of the above (`DOC_TARGETING_CSS`, injected by the
 *    layer itself).
 *
 * Bundle-mode awareness: pass `document` (the doc.json `DocDocument`) and the
 * layer resolves `[data-block-id]` wrappers against it — chip labels come
 * from the block registry's descriptors ("Paragraph", "Decision", ...) and
 * anchors carry the real block id. Canvas objects (`[data-canvas-object-id]`
 * inside an embedded canvas) get hover chips too; the optional `canvasIndex`
 * marks hovered objects that no longer exist in any known canvas as removed.
 * Canvas-object CLICKS are intentionally left to the canvas embed's own
 * object-select surface (DocBlockRenderer's `onCanvasObjectSelect`) so the
 * host receives a properly resolved `canvasSrc`.
 *
 * Exported as a component/hook pair: `DocTargetingLayer` wraps rendered
 * children in the targeting container; `useDocTargeting` exposes the same
 * state machine for hosts that need custom composition.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  CopyIcon,
  MessageSquareIcon,
  PanelsTopLeftIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/cn";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocsAnchor, DocsTarget } from "./annotations";
import { getDocBlockDescriptor } from "../render/block-registry";
import {
  blockTypeForElement,
  buildBlockDocsTarget,
  buildTextRangeDocsTarget,
  resolveDocsTargetElement,
  TARGET_SELECTOR,
  type DocsInteractionMode,
  type ResolvedDocsTarget,
} from "./docs-targeting";

/**
 * The targeting/annotation CSS previously inlined in Spectre's DocsViewer —
 * injected by the layer itself (a `<style>` inside the container), exported
 * for hosts that render the container through `useDocTargeting` manually.
 */
export const DOC_TARGETING_CSS = `
  .docs-markdown [data-docs-target],
  .docs-markdown [data-mdx-block],
  .docs-markdown [data-docs-block-type] {
    border-radius: 6px;
  }
  .docs-markdown.docs-mode-select [data-docs-target],
  .docs-markdown.docs-mode-select [data-mdx-block],
  .docs-markdown.docs-mode-select [data-docs-block-type] {
    cursor: text;
  }
  .docs-markdown.docs-mode-pinpoint [data-docs-target],
  .docs-markdown.docs-mode-pinpoint [data-mdx-block],
  .docs-markdown.docs-mode-pinpoint [data-docs-block-type] {
    cursor: crosshair;
  }
  .docs-markdown.docs-mode-add [data-docs-target],
  .docs-markdown.docs-mode-add [data-mdx-block],
  .docs-markdown.docs-mode-add [data-docs-block-type] {
    cursor: copy;
  }
  .docs-target-hovered {
    background: color-mix(in oklab, var(--primary) 3%, transparent);
  }
  .docs-target-selected {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
    border-radius: 6px;
    background: color-mix(in oklab, var(--primary) 5%, transparent);
  }
  .docs-annotation-mark {
    border-radius: 3px;
    cursor: pointer;
    padding: 0.05em 0.12em;
  }
  .docs-annotation-comment {
    background: color-mix(in oklab, var(--primary) 18%, transparent);
    box-shadow: inset 0 -2px 0 color-mix(in oklab, var(--primary) 55%, transparent);
  }
  .docs-annotation-delete {
    background: color-mix(in oklab, var(--destructive) 16%, transparent);
    color: var(--destructive);
    text-decoration-line: line-through;
    text-decoration-thickness: 2px;
    text-decoration-color: color-mix(in oklab, var(--destructive) 70%, transparent);
  }
  .docs-annotation-mark:hover,
  .docs-annotation-focused {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

/**
 * The minimal annotation shape the layer needs to paint highlight marks —
 * hosts' richer annotation records (Spectre's `DocsAnnotation`) are
 * structurally assignable.
 */
export interface DocsAnnotationView {
  id: string;
  /** `"delete"` renders the strikethrough treatment; anything else the comment treatment. */
  intent: string;
  /** Only `"queued"` (or the currently selected id) renders a mark. */
  status: string;
  document_path: string;
  anchor: DocsAnchor;
}

/** Payload for the built-in toolbar's create-annotation actions. */
export interface DocTargetingCreateAnnotationInput {
  intent: "delete" | "change_request";
  body: string;
  anchor: DocsAnchor;
  resolution_target: "agent";
}

export type DocTargetingCanvasIndex = Record<
  string,
  { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }
>;

export interface DocTargetingOptions<
  A extends DocsAnnotationView = DocsAnnotationView,
> {
  /** Interaction mode driving hover/click affordances. Defaults to "select". */
  mode?: DocsInteractionMode;
  /** Raw source content (markdown/MDX) for source-range anchor resolution. */
  content?: string | null;
  /** Content/doc hash stamped into anchors. Targeting is inert without it. */
  contentHash?: string | null;
  documentPath: string;
  /**
   * Bundle mode: the rendered doc.json document. Enables `[data-block-id]`
   * wrapper resolution (real block ids in anchors, block-registry labels
   * in chips) and `[data-canvas-object-id]` hover chips.
   */
  document?: DocDocument | null;
  /** Canvas object/connection id sets (dangling hints for canvas-object chips). */
  canvasIndex?: DocTargetingCanvasIndex | null;
  /**
   * External selection: when provided, resolved targets are reported here
   * instead of opening the built-in annotation toolbar (the host owns the
   * composer, e.g. the workbench's Plannotator pane).
   */
  onTargetSelect?: (target: ResolvedDocsTarget) => void;
  /**
   * Controlled selected-ring id, matched against `[data-block-id]` /
   * `[data-canvas-object-id]` inside the container. Pass `null` to clear.
   * Omit (undefined) for internal, click-driven selection.
   */
  selectedTargetId?: string | null;
  annotations?: readonly A[];
  selectedAnnotationId?: string | null;
  onSelectionChange?: (anchor: DocsAnchor | null) => void;
  onSelectAnnotation?: (annotation: A) => void;
  onCreateAnnotation?: (input: DocTargetingCreateAnnotationInput) => void;
  onInsertCanvas?: (title: string, anchor?: DocsAnchor | null) => void;
  isAnnotationLoading?: boolean;
  isCanvasInserting?: boolean;
  /** Change this value to imperatively clear transient targeting state (toolbar, popovers, selection, hover). */
  resetToken?: unknown;
}

export interface DocTargeting {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Event handlers to spread onto the targeting container. */
  containerProps: {
    onMouseUp: () => void;
    onKeyUp: () => void;
    onMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
    onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  };
  /** Mode-variant classes for the container (cursor + `.docs-mode-*` hooks). */
  containerClassName: string;
  hoverTarget: ResolvedDocsTarget | null;
  selectedTarget: ResolvedDocsTarget | null;
  /** Absolutely-positioned overlays (hover chip + selected ring); the container must be `position: relative`. */
  overlays: ReactNode;
  /** Fixed-position chrome (annotation toolbar, comment + canvas-insert popovers). */
  chrome: ReactNode;
  /** The layer's `<style>` element (`DOC_TARGETING_CSS`). */
  styles: ReactNode;
}

type DocsTargetOverlayPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type TargetToolbarState = {
  anchor: DocsAnchor;
  element: HTMLElement;
  label: string;
};

type CommentPopoverState = {
  anchor: DocsAnchor;
  element: HTMLElement;
  contextText: string;
};

type CanvasInsertPopoverState = {
  anchor: DocsAnchor;
  element: HTMLElement;
  title: string;
};

function normalizedText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

function getRenderedTargets(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
}

function rangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const length = node.textContent?.length ?? 0;
    if (!startNode && charCount + length > start) {
      startNode = node;
      startOffset = start - charCount;
    }
    if (startNode && charCount + length >= end) {
      endNode = node;
      endOffset = end - charCount;
      break;
    }
    charCount += length;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function normalizedTextWithMap(value: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let inWhitespace = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        text += " ";
        map.push(index);
        inWhitespace = true;
      }
      continue;
    }
    text += char;
    map.push(index);
    inWhitespace = false;
  }

  let start = 0;
  let end = text.length;
  while (start < end && text[start] === " ") start++;
  while (end > start && text[end - 1] === " ") end--;

  return {
    text: text.slice(start, end),
    map: map.slice(start, end),
  };
}

function findTextRange(root: HTMLElement, quote: string): Range | null {
  if (!quote) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    const index = text.indexOf(quote);
    if (index >= 0) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + quote.length);
      return range;
    }
  }

  const fullText = root.textContent ?? "";
  const directIndex = fullText.indexOf(quote);
  if (directIndex >= 0) {
    return rangeFromTextOffsets(root, directIndex, directIndex + quote.length);
  }

  const haystack = normalizedTextWithMap(fullText);
  const needle = normalizedTextWithMap(quote).text;
  const normalizedIndex = haystack.text.indexOf(needle);
  if (!needle || normalizedIndex < 0) return null;
  const originalStart = haystack.map[normalizedIndex];
  const originalEnd = haystack.map[normalizedIndex + needle.length - 1] + 1;
  return rangeFromTextOffsets(root, originalStart, originalEnd);
}

function createTextRange(element: HTMLElement): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let firstNode: Text | null = null;
  let lastNode: Text | null = null;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    if (!firstNode) firstNode = node;
    lastNode = node;
  }

  if (!firstNode || !lastNode) return null;
  const range = document.createRange();
  range.setStart(firstNode, 0);
  range.setEnd(lastNode, lastNode.length);
  return range;
}

function unwrapAnnotationMarks(root: HTMLElement) {
  root.querySelectorAll("mark[data-docs-annotation-id]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

function wrapRangeWithAnnotation(
  range: Range,
  annotation: DocsAnnotationView,
  isFocused: boolean,
): HTMLElement[] {
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const ancestor =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!ancestor) return [];

  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  let inRange = false;

  while ((node = walker.nextNode() as Text | null)) {
    if (node === range.startContainer) {
      inRange = true;
      const start = range.startOffset;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end > start) textNodes.push({ node, start, end });
      if (node === range.endContainer) break;
      continue;
    }

    if (node === range.endContainer) {
      if (inRange && range.endOffset > 0) {
        textNodes.push({ node, start: 0, end: range.endOffset });
      }
      break;
    }

    if (inRange && node.length > 0) {
      textNodes.push({ node, start: 0, end: node.length });
    }
  }

  const marks: HTMLElement[] = [];
  textNodes.reverse().forEach(({ node, start, end }) => {
    const nodeRange = document.createRange();
    nodeRange.setStart(node, start);
    nodeRange.setEnd(node, end);
    const mark = document.createElement("mark");
    mark.dataset.docsAnnotationId = annotation.id;
    mark.dataset.docsAnnotationPrimaryId = annotation.id;
    mark.className = cn(
      "docs-annotation-mark",
      annotation.intent === "delete"
        ? "docs-annotation-delete"
        : "docs-annotation-comment",
      isFocused && "docs-annotation-focused",
    );
    try {
      nodeRange.surroundContents(mark);
      marks.push(mark);
    } catch {
      // Ignore DOM ranges that cannot be safely wrapped.
    }
  });

  return marks;
}

function resolveAnnotationElement(
  annotation: DocsAnnotationView,
  root: HTMLElement,
): HTMLElement | null {
  const anchor = annotation.anchor;
  const target = anchor.target;
  const targets = getRenderedTargets(root);
  const blockIds = [
    anchor.block_id,
    target?.block_id,
    target?.element_id,
  ].filter((value): value is string => !!value);

  for (const blockId of blockIds) {
    const bySourceId = targets.find((element) => element.dataset.sourceId === blockId);
    if (bySourceId) return bySourceId;
    const byBlockId = targets.find((element) => element.dataset.blockId === blockId);
    if (byBlockId) return byBlockId;
  }

  const sourceRange = target?.source_range ?? anchor.source_range;
  if (sourceRange) {
    const exactSourceStart = targets.find(
      (element) => element.dataset.sourceStart === String(sourceRange.start_offset),
    );
    if (exactSourceStart) return exactSourceStart;

    const containingSourceRange = targets.find((element) => {
      const start = Number(element.dataset.sourceStart);
      const end = Number(element.dataset.sourceEnd);
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= sourceRange.start_offset &&
        end >= sourceRange.end_offset
      );
    });
    if (containingSourceRange) return containingSourceRange;
  }

  const quote = normalizedText(target?.text_quote ?? anchor.text_quote);
  if (!quote) return null;
  const blockType = target?.block_type ?? anchor.target_kind;
  const typedTargets = blockType
    ? targets.filter((element) => blockTypeForElement(element) === blockType)
    : targets;
  const exactQuote = typedTargets.find(
    (element) => normalizedText(element.textContent) === quote,
  );
  if (exactQuote) return exactQuote;
  const containingQuote = typedTargets.find((element) =>
    normalizedText(element.textContent).includes(quote),
  );
  if (containingQuote) return containingQuote;
  return targets.find((element) => normalizedText(element.textContent).includes(quote)) ?? null;
}

function rangeForAnnotation(
  annotation: DocsAnnotationView,
  root: HTMLElement,
): Range | null {
  const element = resolveAnnotationElement(annotation, root);
  if (annotation.anchor.target?.kind === "block" && element) {
    return createTextRange(element);
  }
  const quote = annotation.anchor.target?.text_quote ?? annotation.anchor.text_quote;
  const scopedRange = element ? findTextRange(element, quote) : null;
  return scopedRange ?? findTextRange(root, quote);
}

function titleCaseTargetKind(raw: string): string {
  return raw
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function targetKindLabel(
  target: ResolvedDocsTarget,
  doc?: DocDocument | null,
): string {
  const raw =
    target.anchor.target?.block_type ??
    target.anchor.target_kind ??
    target.label.split(":")[0] ??
    "Target";
  if (doc) {
    // Bundle mode: prefer the block registry descriptor's human label
    // ("Paragraph", "Agent Contract", ...) when the block type is a block type.
    const descriptor = getDocBlockDescriptor(raw);
    if (descriptor) return descriptor.label;
  }
  return titleCaseTargetKind(raw);
}

function defaultCanvasTitle(anchor: DocsAnchor): string {
  const raw =
    anchor.target?.label ??
    anchor.text_quote ??
    "New Diagram";
  const cleaned = raw
    .replace(/^(heading|paragraph|list item|selected text|canvas|wireframe-region):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "New Diagram";
  const title = cleaned.length > 42 ? cleaned.slice(0, 39).trimEnd() : cleaned;
  return /diagram|flow|canvas/i.test(title) ? title : `${title} Diagram`;
}

function truncateLabelText(text: string, max = 42): string {
  const normalized = normalizedText(text);
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

/**
 * Bundle-mode decoration: when the resolved element is a `[data-block-id]`
 * block type wrapper whose block exists in the doc, rewrite the target's label
 * with the block registry descriptor ("Paragraph: ...") and carry the real
 * block id in the anchor. Blocks missing from the doc (dangling wrappers)
 * pass through undecorated.
 */
function decorateBundleTarget(
  target: ResolvedDocsTarget,
  doc: DocDocument,
): ResolvedDocsTarget {
  const wrapper = target.element.closest("[data-block-id]");
  const blockId =
    wrapper instanceof HTMLElement ? (wrapper.dataset.blockId ?? null) : null;
  const block = blockId ? doc.blocks[blockId] : undefined;
  if (!blockId || !block) return target;

  const descriptor = getDocBlockDescriptor(block.type);
  const typeLabel = descriptor?.label ?? block.type;
  const text = truncateLabelText(target.element.textContent ?? "");
  const label = text ? `${typeLabel}: ${text}` : typeLabel;

  return {
    ...target,
    label,
    anchor: {
      ...target.anchor,
      block_id: blockId,
      target: target.anchor.target
        ? {
            ...target.anchor.target,
            label,
            block_id: blockId,
            block_type: block.type,
          }
        : target.anchor.target,
    },
  };
}

function resolveCanvasObjectElement(
  rawTarget: EventTarget | null,
  root: HTMLElement,
): HTMLElement | null {
  if (!(rawTarget instanceof Element)) return null;
  const element = rawTarget.closest("[data-canvas-object-id]");
  if (!element || !root.contains(element)) return null;
  return element as HTMLElement;
}

export function useDocTargeting<A extends DocsAnnotationView = DocsAnnotationView>({
  mode = "select",
  content,
  contentHash,
  documentPath,
  document: doc,
  canvasIndex,
  onTargetSelect,
  selectedTargetId,
  annotations = [],
  selectedAnnotationId,
  onSelectionChange,
  onSelectAnnotation,
  onCreateAnnotation,
  onInsertCanvas,
  isAnnotationLoading,
  isCanvasInserting,
  resetToken,
}: DocTargetingOptions<A>): DocTargeting {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [targetToolbar, setTargetToolbar] = useState<TargetToolbarState | null>(null);
  const [commentPopover, setCommentPopover] = useState<CommentPopoverState | null>(null);
  const [canvasInsertPopover, setCanvasInsertPopover] =
    useState<CanvasInsertPopoverState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<ResolvedDocsTarget | null>(null);
  const [internalSelectedTarget, setInternalSelectedTarget] =
    useState<ResolvedDocsTarget | null>(null);
  const [controlledSelectedTarget, setControlledSelectedTarget] =
    useState<ResolvedDocsTarget | null>(null);

  const isControlledSelection = selectedTargetId !== undefined;
  const selectedTarget = isControlledSelection
    ? controlledSelectedTarget
    : internalSelectedTarget;

  // Anchor-building is active once a content hash exists and there is either
  // raw source content (MDX mode) or a bundle document to resolve against.
  const sourceContent = content ?? "";
  const canTarget = contentHash != null && (content != null || doc != null);

  const buildTargetForElement = useCallback(
    (element: HTMLElement): ResolvedDocsTarget | null => {
      const base = buildBlockDocsTarget(element, {
        content: sourceContent,
        documentPath,
        contentHash: contentHash ?? "",
      });
      if (!base) return null;
      return doc ? decorateBundleTarget(base, doc) : base;
    },
    [sourceContent, documentPath, contentHash, doc],
  );

  const buildCanvasObjectTarget = useCallback(
    (objectElement: HTMLElement): ResolvedDocsTarget | null => {
      if (!doc) return null;
      const objectId = objectElement.getAttribute("data-canvas-object-id");
      if (!objectId) return null;
      const wrapper = objectElement.closest("[data-block-id]");
      const blockId =
        wrapper instanceof HTMLElement ? (wrapper.dataset.blockId ?? null) : null;

      // Dangling hint: only when the index is loaded and the object appears
      // in NO known canvas do we flag it as removed.
      let removed = false;
      if (canvasIndex) {
        const entries = Object.values(canvasIndex);
        removed =
          entries.length > 0 &&
          !entries.some(
            (sets) => sets.objectIds.has(objectId) || sets.connectionIds.has(objectId),
          );
      }

      const label = `canvas object: ${objectId}${removed ? " (removed)" : ""}`;
      const target: DocsTarget = {
        kind: "custom_element",
        label,
        block_id: blockId,
        block_type: "canvas-object",
        text_quote: label,
        source_range: null,
        element_id: objectId,
        element_type: "canvas-object",
      };
      return {
        element: objectElement,
        label,
        anchor: {
          document_path: documentPath,
          content_hash: contentHash ?? "",
          block_id: blockId,
          source_range: null,
          text_quote: label,
          context_before: "",
          context_after: "",
          target_kind: target.kind,
          target,
        },
      };
    },
    [doc, canvasIndex, documentPath, contentHash],
  );

  const openTargetToolbar = useCallback(
    (target: ResolvedDocsTarget) => {
      onSelectionChange?.(target.anchor);
      setHoverTarget(null);
      if (onTargetSelect) {
        if (!isControlledSelection) setInternalSelectedTarget(target);
        setTargetToolbar(null);
        setCommentPopover(null);
        setCanvasInsertPopover(null);
        onTargetSelect(target);
        return;
      }
      setInternalSelectedTarget(target);
      setCommentPopover(null);
      setCanvasInsertPopover(null);
      setTargetToolbar({
        anchor: target.anchor,
        element: target.element,
        label: target.label,
      });
    },
    [isControlledSelection, onSelectionChange, onTargetSelect],
  );

  const openCanvasInsertPopover = useCallback(
    (target: ResolvedDocsTarget) => {
      if (!onInsertCanvas) return;
      onSelectionChange?.(target.anchor);
      setHoverTarget(null);
      setInternalSelectedTarget(target);
      setTargetToolbar(null);
      setCommentPopover(null);
      setCanvasInsertPopover({
        anchor: target.anchor,
        element: target.element,
        title: defaultCanvasTitle(target.anchor),
      });
    },
    [onInsertCanvas, onSelectionChange],
  );

  const handleAnnotationHighlightClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return false;
      if (!onSelectAnnotation) return false;
      const root = containerRef.current;
      if (!root || !(event.target instanceof HTMLElement)) return false;
      const element = event.target.closest("[data-docs-annotation-primary-id]");
      if (!(element instanceof HTMLElement) || !root.contains(element)) return false;
      const annotationId = element.dataset.docsAnnotationPrimaryId;
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation) return false;

      event.preventDefault();
      event.stopPropagation();
      setTargetToolbar(null);
      setCommentPopover(null);
      setCanvasInsertPopover(null);
      setHoverTarget(null);
      setInternalSelectedTarget(null);
      onSelectionChange?.(annotation.anchor);
      onSelectAnnotation(annotation);
      return true;
    },
    [annotations, onSelectAnnotation, onSelectionChange],
  );

  const captureSelection = useCallback(() => {
    if (mode !== "select") return;
    if (!canTarget || content == null) return;
    const root = containerRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      onSelectionChange?.(null);
      setTargetToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    if (!root.contains(startNode) || !root.contains(endNode)) {
      onSelectionChange?.(null);
      setTargetToolbar(null);
      return;
    }

    const target = buildTextRangeDocsTarget(selection, range, {
      content,
      root,
      documentPath,
      contentHash: contentHash ?? "",
    });
    if (!target) {
      onSelectionChange?.(null);
      setTargetToolbar(null);
      return;
    }

    openTargetToolbar(target);
  }, [
    canTarget,
    content,
    contentHash,
    documentPath,
    mode,
    onSelectionChange,
    openTargetToolbar,
  ]);

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (mode !== "pinpoint" && mode !== "add") {
        setHoverTarget(null);
        return;
      }
      if (!canTarget || targetToolbar || commentPopover) return;
      if (canvasInsertPopover) return;
      const root = containerRef.current;
      if (!root) return;
      if (doc) {
        const objectElement = resolveCanvasObjectElement(event.target, root);
        if (objectElement) {
          const objectTarget = buildCanvasObjectTarget(objectElement);
          setHoverTarget((current) =>
            objectTarget && current?.element === objectTarget.element
              ? current
              : objectTarget,
          );
          return;
        }
      }
      const element = resolveDocsTargetElement(event.target, root);
      if (!element) {
        setHoverTarget(null);
        return;
      }
      const target = buildTargetForElement(element);
      setHoverTarget((current) =>
        target && current?.element === target.element ? current : target,
      );
    },
    [
      targetToolbar,
      commentPopover,
      canvasInsertPopover,
      canTarget,
      doc,
      buildCanvasObjectTarget,
      buildTargetForElement,
      mode,
    ],
  );

  const handleTargetClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canTarget) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      const root = containerRef.current;
      if (!root) return;
      // Canvas objects have their own object-select click surface (the
      // canvas embed reports a properly resolved canvasSrc) — never override
      // it with the embedding block.
      if (doc && resolveCanvasObjectElement(event.target, root)) return;
      const element = resolveDocsTargetElement(event.target, root);
      if (!element) return;
      const target = buildTargetForElement(element);
      if (!target) return;
      event.preventDefault();
      openTargetToolbar(target);
    },
    [canTarget, doc, buildTargetForElement, openTargetToolbar],
  );

  const handleAddClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!canTarget || !onInsertCanvas) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      const root = containerRef.current;
      if (!root) return;
      const element = resolveDocsTargetElement(event.target, root);
      if (!element) return;
      const target = buildTargetForElement(element);
      if (!target) return;
      event.preventDefault();
      openCanvasInsertPopover(target);
    },
    [canTarget, buildTargetForElement, onInsertCanvas, openCanvasInsertPopover],
  );

  const handleDocumentClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (handleAnnotationHighlightClick(event)) return;
      if (mode === "pinpoint") {
        handleTargetClick(event);
        return;
      }
      if (mode === "add") {
        handleAddClick(event);
      }
    },
    [mode, handleAddClick, handleAnnotationHighlightClick, handleTargetClick],
  );

  const closeTargetToolbar = () => {
    setTargetToolbar(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  const submitDeleteAnnotation = () => {
    if (!targetToolbar || !onCreateAnnotation) return;
    onCreateAnnotation({
      intent: "delete",
      body: "Delete this selection.",
      anchor: targetToolbar.anchor,
      resolution_target: "agent",
    });
    setTargetToolbar(null);
    setCommentPopover(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  const requestComment = () => {
    if (!targetToolbar) return;
    setCommentPopover({
      anchor: targetToolbar.anchor,
      element: targetToolbar.element,
      contextText: targetToolbar.anchor.text_quote,
    });
    setCanvasInsertPopover(null);
    setTargetToolbar(null);
  };

  const submitCanvasInsert = (title: string) => {
    if (!canvasInsertPopover || !title.trim()) return;
    onInsertCanvas?.(title.trim(), canvasInsertPopover.anchor);
    setCanvasInsertPopover(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  const submitCommentAnnotation = (body: string) => {
    const trimmed = body.trim();
    if (!commentPopover || !trimmed || !onCreateAnnotation) return;
    onCreateAnnotation({
      intent: "change_request",
      body: trimmed,
      anchor: commentPopover.anchor,
      resolution_target: "agent",
    });
    setCommentPopover(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  const closeCommentPopover = () => {
    setCommentPopover(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  const closeCanvasInsertPopover = () => {
    setCanvasInsertPopover(null);
    setInternalSelectedTarget(null);
    window.getSelection()?.removeAllRanges();
  };

  // Controlled selected-ring resolution: match the id against block wrappers
  // and canvas objects inside the container. Ids that no longer resolve
  // (dangling) simply render no ring.
  useLayoutEffect(() => {
    if (!isControlledSelection) return;
    const root = containerRef.current;
    if (!selectedTargetId || !root) {
      setControlledSelectedTarget(null);
      return;
    }
    const escaped = cssEscape(selectedTargetId);
    const element = root.querySelector(
      `[data-block-id="${escaped}"], [data-canvas-object-id="${escaped}"]`,
    );
    if (!(element instanceof Element)) {
      setControlledSelectedTarget(null);
      return;
    }
    const htmlElement = element as HTMLElement;
    const target =
      element.getAttribute("data-canvas-object-id") === selectedTargetId
        ? buildCanvasObjectTarget(htmlElement)
        : buildTargetForElement(htmlElement);
    setControlledSelectedTarget(target);
  }, [
    isControlledSelection,
    selectedTargetId,
    buildCanvasObjectTarget,
    buildTargetForElement,
  ]);

  useEffect(() => {
    const element = hoverTarget?.element;
    if (!element || element === selectedTarget?.element) return;
    element.classList.add("docs-target-hovered");
    return () => element.classList.remove("docs-target-hovered");
  }, [hoverTarget, selectedTarget?.element]);

  // Annotation highlight marks (queued + focused annotations for this doc).
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !content) return;

    unwrapAnnotationMarks(root);

    const activeAnnotations = annotations.filter((annotation) => {
      const isVisible =
        annotation.status === "queued" || annotation.id === selectedAnnotationId;
      const matchesDocument =
        annotation.document_path === documentPath ||
        annotation.anchor.document_path === documentPath;
      return isVisible && matchesDocument;
    });

    const marks = activeAnnotations.flatMap((annotation) => {
      const range = rangeForAnnotation(annotation, root);
      return range
        ? wrapRangeWithAnnotation(range, annotation, annotation.id === selectedAnnotationId)
        : [];
    });

    const focusedMark = marks.find(
      (mark) => mark.dataset.docsAnnotationId === selectedAnnotationId,
    );
    focusedMark?.scrollIntoView?.({ block: "center", behavior: "smooth" });

    return () => {
      unwrapAnnotationMarks(root);
    };
  }, [annotations, content, documentPath, selectedAnnotationId]);

  // Doc switch: drop all transient targeting state.
  useEffect(() => {
    setTargetToolbar(null);
    setCommentPopover(null);
    setCanvasInsertPopover(null);
    setHoverTarget(null);
    setInternalSelectedTarget(null);
  }, [content, documentPath]);

  useEffect(() => {
    setHoverTarget(null);
  }, [mode]);

  // Host-driven reset (e.g. Spectre's interaction-mode toolbar clears the
  // toolbar/popovers even when re-selecting the active mode).
  useEffect(() => {
    if (resetToken === undefined) return;
    setTargetToolbar(null);
    setCommentPopover(null);
    setCanvasInsertPopover(null);
    setHoverTarget(null);
    setInternalSelectedTarget(null);
  }, [resetToken]);

  const overlaysActive = mode === "pinpoint" || mode === "add";

  const overlays = (
    <>
      <DocsTargetOverlay
        target={
          overlaysActive && hoverTarget?.element !== selectedTarget?.element
            ? hoverTarget
            : null
        }
        containerRef={containerRef}
        variant="hover"
        document={doc}
      />
      <DocsTargetOverlay
        target={overlaysActive ? selectedTarget : null}
        containerRef={containerRef}
        variant="selected"
        document={doc}
      />
    </>
  );

  const chrome = (
    <>
      {targetToolbar && (
        <DocsAnnotationToolbar
          target={targetToolbar}
          isLoading={isAnnotationLoading}
          onDelete={submitDeleteAnnotation}
          onRequestComment={requestComment}
          onClose={closeTargetToolbar}
        />
      )}
      {commentPopover && (
        <DocsCommentPopover
          state={commentPopover}
          isLoading={isAnnotationLoading}
          onSubmit={submitCommentAnnotation}
          onClose={closeCommentPopover}
        />
      )}
      {canvasInsertPopover && (
        <DocsCanvasInsertPopover
          state={canvasInsertPopover}
          isLoading={isCanvasInserting}
          onSubmit={submitCanvasInsert}
          onClose={closeCanvasInsertPopover}
        />
      )}
    </>
  );

  return {
    containerRef,
    containerProps: {
      onMouseUp: captureSelection,
      onKeyUp: captureSelection,
      onMouseMove: handleMouseMove,
      onMouseLeave: () => setHoverTarget(null),
      onClick: handleDocumentClick,
    },
    containerClassName: cn(
      overlaysActive
        ? "docs-mode-pinpoint cursor-crosshair"
        : "docs-mode-select cursor-text",
      mode === "add" && "docs-mode-add cursor-copy",
    ),
    hoverTarget,
    selectedTarget,
    overlays,
    chrome,
    styles: <style>{DOC_TARGETING_CSS}</style>,
  };
}

export interface DocTargetingLayerProps<
  A extends DocsAnnotationView = DocsAnnotationView,
> extends DocTargetingOptions<A> {
  /** Classes for the targeting container (must establish `position: relative`). */
  className?: string;
  children: ReactNode;
}

/**
 * The default composition: a `position: relative` container wrapping the
 * host's rendered doc surface, with the targeting styles, hover/selected
 * overlays, and (when the built-in flow is active) the annotation toolbar +
 * popovers.
 */
export default function DocTargetingLayer<
  A extends DocsAnnotationView = DocsAnnotationView,
>({ className, children, ...options }: DocTargetingLayerProps<A>) {
  const targeting = useDocTargeting(options);

  return (
    <>
      <div
        ref={targeting.containerRef}
        {...targeting.containerProps}
        className={cn(className, targeting.containerClassName)}
      >
        {targeting.styles}
        {children}
        {targeting.overlays}
      </div>
      {targeting.chrome}
    </>
  );
}

function DocsAnnotationToolbar({
  target,
  isLoading,
  onDelete,
  onRequestComment,
  onClose,
}: {
  target: TargetToolbarState;
  isLoading?: boolean;
  onDelete: () => void;
  onRequestComment: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const rect = target.element.getBoundingClientRect();
      setPosition({
        top: Math.max(12, rect.top - 48),
        left: rect.left + rect.width / 2,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [target.element]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const rawTarget = event.target as Node | null;
      if (toolbarRef.current && rawTarget && toolbarRef.current.contains(rawTarget)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!position) return null;

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(target.anchor.text_quote);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 rounded-md border bg-popover p-1 shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copied ? "Copied" : "Copy selected text"}
          title={copied ? "Copied" : "Copy selected text"}
          onClick={handleCopy}
        >
          <CopyIcon className="h-4 w-4" />
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Mark for deletion"
          title="Mark for deletion"
          className="text-destructive hover:text-destructive"
          disabled={isLoading}
          onClick={onDelete}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Add comment"
          title="Add comment"
          disabled={isLoading}
          onClick={onRequestComment}
        >
          <MessageSquareIcon className="h-4 w-4" />
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close annotation toolbar"
          title="Close"
          onClick={onClose}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DocsCommentPopover({
  state,
  isLoading,
  onSubmit,
  onClose,
}: {
  state: CommentPopoverState;
  isLoading?: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    flipAbove: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const rect = state.element.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 32);
      const flipAbove = window.innerHeight - rect.bottom < 260;
      setPosition({
        top: flipAbove ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 16)),
        width,
        flipAbove,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [state.element]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const rawTarget = event.target as Node | null;
      if (containerRef.current && rawTarget && containerRef.current.contains(rawTarget)) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
  };

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      className="fixed z-50 flex flex-col gap-2 rounded-md border bg-popover p-3 shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        transform: position.flipAbove ? "translateY(-100%)" : undefined,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        rows={4}
        placeholder="Add a comment..."
        className="min-h-24 resize-none text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!text.trim() || isLoading}
          onClick={submit}
        >
          {isLoading ? "Queuing" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

function DocsCanvasInsertPopover({
  state,
  isLoading,
  onSubmit,
  onClose,
}: {
  state: CanvasInsertPopoverState;
  isLoading?: boolean;
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(state.title);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    flipAbove: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const rect = state.element.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const flipAbove = window.innerHeight - rect.bottom < 180;
      setPosition({
        top: flipAbove ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 16)),
        width,
        flipAbove,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [state.element]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const rawTarget = event.target as Node | null;
      if (containerRef.current && rawTarget && containerRef.current.contains(rawTarget)) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const submit = () => {
    if (!title.trim()) return;
    onSubmit(title);
  };

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      className="fixed z-50 flex flex-col gap-3 rounded-md border bg-popover p-3 shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        transform: position.flipAbove ? "translateY(-100%)" : undefined,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Diagram title</span>
        <Input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          disabled={isLoading}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!title.trim() || isLoading}
          onClick={submit}
        >
          <PanelsTopLeftIcon className="h-3.5 w-3.5" />
          {isLoading ? "Inserting" : "Insert diagram"}
        </Button>
      </div>
    </div>
  );
}

function DocsTargetOverlay({
  target,
  containerRef,
  variant,
  document: doc,
}: {
  target: ResolvedDocsTarget | null;
  containerRef: RefObject<HTMLElement | null>;
  variant: "hover" | "selected";
  document?: DocDocument | null;
}) {
  const [position, setPosition] = useState<DocsTargetOverlayPosition | null>(null);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    if (!target || !containerRef.current) {
      setPosition(null);
      return;
    }

    const container = containerRef.current;
    const updatePosition = () => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.element.getBoundingClientRect();
      setPosition({
        top: targetRect.top - containerRect.top + container.scrollTop,
        left: targetRect.left - containerRect.left + container.scrollLeft,
        width: targetRect.width,
        height: targetRect.height,
      });
    };

    updatePosition();

    const handleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    const scrollParent = container.parentElement;
    window.addEventListener("resize", handleUpdate, { passive: true });
    scrollParent?.addEventListener("scroll", handleUpdate, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleUpdate);
      scrollParent?.removeEventListener("scroll", handleUpdate);
    };
  }, [containerRef, target]);

  if (!position || !target) return null;
  const isSelected = variant === "selected";

  return (
    <>
      <div
        data-docs-target-chrome
        data-docs-target-overlay={variant}
        className={cn(
          "pointer-events-none rounded-sm border-2",
          isSelected
            ? "border-primary bg-primary/10 ring-4 ring-primary/10"
            : "border-dashed border-primary/50 bg-primary/5",
        )}
        style={{
          position: "absolute",
          top: position.top - 3,
          left: position.left - 3,
          width: position.width + 6,
          height: position.height + 6,
          zIndex: 20,
          transition: "all 100ms ease-out",
        }}
      />
      <div
        data-docs-target-chrome
        data-docs-target-overlay-label={variant}
        className="pointer-events-none"
        style={{
          position: "absolute",
          top: Math.max(0, position.top - 24),
          left: position.left - 3,
          zIndex: 21,
          transition: "all 100ms ease-out",
        }}
      >
        <span
          className={cn(
            "inline-block overflow-hidden text-ellipsis whitespace-nowrap rounded-sm px-1.5 font-mono text-[10px] leading-4 text-primary-foreground",
            isSelected ? "bg-primary" : "max-w-[260px] bg-primary",
          )}
        >
          {isSelected ? targetKindLabel(target, doc) : target.label}
        </span>
      </div>
    </>
  );
}
