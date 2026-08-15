"use client";

/**
 * Plannotator v1 (M2 Checkpoint 5, TG5.3).
 *
 * An annotation surface over a doc's `annotations.json` (annotations are
 * workflow state and live ONLY in the bundle's annotations.json, never
 * inside doc.json/.canvas.json). An annotation marks a spot in the doc and
 * requests a change; agents process them.
 *
 * The panel UI/state lives in `@codecaine-ai/annotations/react`
 * (`AnnotationPanel`); this module is the docs-shaped compat wrapper. It
 * keeps the historical public surface (`PlannotatorProps`,
 * `PlannotatorSelection`) and supplies the docs-specific pieces: the
 * `targetKey`/`targetLabel` grouping functions (whose exact strings are a
 * DOM/test contract via `data-plannotator-target` and visible labels) and
 * the dangling-target detection over the doc + canvas index.
 */

import { useMemo, type ReactNode } from "react";
import { AnnotationPanel } from "@codecaine-ai/annotations/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
  detectDanglingTargets,
  type AnnotationIntent,
  type AnnotationTarget,
  type DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";

/** What's currently selected as an annotation target, before it's submitted. */
export type PlannotatorSelection =
  | { kind: "block"; blockId: string; label?: string }
  | {
      kind: "canvas-object";
      canvasSrc: string;
      objectId?: string;
      connectionId?: string;
      region?: { x: number; y: number; width: number; height: number };
      label?: string;
    }
  | {
      /** See docs-model's text-range target for the offset convention. */
      kind: "text-range";
      blockId: string;
      start: number;
      end: number;
      quote: string;
      label?: string;
    };

export interface PlannotatorProps {
  /** All annotations for the current doc bundle (raw, unfiltered by status). */
  annotations: DocAnnotation[];
  /** The doc being annotated, for dangling block-target detection. Null while loading. */
  document: DocDocument | null;
  /**
   * Canvas object/connection id sets keyed by canvas src, for dangling
   * canvas-object-target detection. Pass undefined/null while the index is
   * still LOADING — canvas-target checks are then skipped entirely (see
   * `detectDanglingTargets`). Once loaded, omit entries for srcs that
   * failed to resolve and those annotations surface as dangling.
   */
  canvases?: Record<string, { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }> | null;
  /** Current pending selection (set by the host in response to a block/canvas-object click). */
  selection: PlannotatorSelection | null;
  /** Clears the pending selection (e.g. composer cancel). */
  onClearSelection: () => void;
  /** Submits a new annotation against `selection`. Host performs the actual API call. */
  onAddAnnotation: (input: { target: AnnotationTarget; body: string; intent: AnnotationIntent }) => Promise<void>;
  /** Marks an annotation resolved. Host performs the actual API call. */
  onResolveAnnotation: (annotationId: string) => Promise<void>;
  /** Adds a reply to an annotation thread. Optional — omit for read-only threads. */
  onAddReply?: (annotationId: string, body: string) => Promise<void>;
  /** Jumps the viewer to an annotation's target (scroll to block / focus canvas object). */
  onFocusTarget?: (target: AnnotationTarget) => void;
  /**
   * Kicks off an agent run for an `agent-request` annotation. Host performs
   * the actual API call (runDocAgentRequest). Optional — omit to not render
   * the Run-agent button at all.
   */
  onRunAgent?: (annotationId: string) => Promise<
    | { ok: true; summary: string; patchId: string; changedIds: string[] }
    | { ok: false; detail: string }
  >;
  /**
   * Undoes a previously-applied agent patch. Host performs the actual API
   * call (undoDocPatch). Optional — omit to not render the Undo button at
   * all. `changedIds` is the run's recorded `agentRun.changedIds`, passed
   * back so the host can flash the reverted targets (D12 changed-id
   * highlights) — hosts that don't highlight can ignore it.
   */
  onUndoPatch?: (
    patchId: string,
    changedIds?: string[],
  ) => Promise<{ ok: true } | { ok: false; detail: string }>;
  isSubmitting?: boolean;
  className?: string;
  /**
   * Render the inline composer for the pending selection (AnnotationPanel
   * passthrough). Hosts using the anchored composer popover pass false — the
   * panel then renders the annotation list only.
   */
  showComposer?: boolean;
  /** Empty-list content (AnnotationPanel passthrough). */
  emptyState?: ReactNode;
}

/** Collapse whitespace + truncate — the text-range label's quote form. */
function quoteLabelText(quote: string): string {
  const normalized = quote.replace(/\s+/g, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 39)}…` : normalized;
}

// NOTE: these strings are a compat contract (data-plannotator-target attrs and
// visible labels) and intentionally differ from docsAnnotationSchema's adapter
// key/label format — do not swap them for the schema's targetKey/targetLabel.
// (text-range is new with the anchored-composer UX and matches the schema's
// format — it has no divergent historical contract.)
function targetKey(target: AnnotationTarget): string {
  if (target.kind === "block") return `block:${target.blockId}`;
  if (target.kind === "text-range") {
    return `text-range:${target.blockId}:${target.start}-${target.end}`;
  }
  if (target.objectId) return `canvas-object:${target.canvasSrc}:obj:${target.objectId}`;
  if (target.connectionId) return `canvas-object:${target.canvasSrc}:conn:${target.connectionId}`;
  if (target.region) {
    return `canvas-object:${target.canvasSrc}:region:${target.region.x},${target.region.y}`;
  }
  return `canvas-object:${target.canvasSrc}`;
}

function targetLabel(target: AnnotationTarget): string {
  if (target.kind === "block") return `Block ${target.blockId}`;
  if (target.kind === "text-range") return `Text "${quoteLabelText(target.quote)}"`;
  if (target.objectId) return `Canvas object ${target.objectId}`;
  if (target.connectionId) return `Canvas connection ${target.connectionId}`;
  if (target.region) return `Canvas region @ (${target.region.x}, ${target.region.y})`;
  return `Canvas ${target.canvasSrc}`;
}

function selectionToTarget(selection: PlannotatorSelection): AnnotationTarget {
  if (selection.kind === "block") return { kind: "block", blockId: selection.blockId };
  if (selection.kind === "text-range") {
    return {
      kind: "text-range",
      blockId: selection.blockId,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
    };
  }
  return {
    kind: "canvas-object",
    canvasSrc: selection.canvasSrc,
    objectId: selection.objectId,
    connectionId: selection.connectionId,
    region: selection.region,
  };
}

export default function Plannotator({
  annotations,
  document,
  canvases,
  selection,
  onClearSelection,
  onAddAnnotation,
  onResolveAnnotation,
  onAddReply,
  onFocusTarget,
  onRunAgent,
  onUndoPatch,
  isSubmitting,
  className,
  showComposer,
  emptyState,
}: PlannotatorProps) {
  const danglingReasons = useMemo(() => {
    const dangling = detectDanglingTargets({ schemaVersion: 1, annotations }, document, canvases);
    return new Map(dangling.map((entry) => [entry.annotationId, entry.reason]));
  }, [annotations, document, canvases]);

  const panelSelection = useMemo(
    () => (selection ? { target: selectionToTarget(selection), label: selection.label } : null),
    [selection],
  );

  return (
    <AnnotationPanel<AnnotationTarget>
      annotations={annotations}
      selection={panelSelection}
      targetKey={targetKey}
      targetLabel={targetLabel}
      danglingReasons={danglingReasons}
      onClearSelection={onClearSelection}
      onAddAnnotation={({ target, body, intent }) =>
        // The panel's intents come from its default note/agent-request
        // options, so the wide engine string is the narrow docs union.
        onAddAnnotation({ target, body, intent: intent as AnnotationIntent })
      }
      onAddReply={onAddReply}
      onResolveAnnotation={onResolveAnnotation}
      onFocusTarget={onFocusTarget}
      onRunAgent={onRunAgent}
      onUndoPatch={onUndoPatch}
      isSubmitting={isSubmitting}
      className={className}
      showComposer={showComposer}
      emptyState={emptyState}
    />
  );
}
