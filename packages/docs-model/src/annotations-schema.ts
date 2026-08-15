"use client";

/**
 * Annotations sidecar schema — an annotation marks a spot in a doc (a block,
 * a text range inside a block, or an object on an embedded canvas) and
 * requests a change; agents process them. Annotations are workflow state and live ONLY in the bundle's
 * `annotations.json` sidecar, never inside doc.json/.canvas.json. The
 * top-level array key is `annotations` — there is no other accepted shape.
 *
 * The validation/dangling engine lives in `@codecaine-ai/annotations/core`;
 * this module supplies the docs-specific target adapters (`block`,
 * `canvas-object`, `text-range`) and re-exports the docs-shaped API
 * unchanged.
 */

import {
  createAnnotationSchema,
  isId,
  isRecord,
  type TargetAdapter,
  type ValidationIssue,
} from "@codecaine-ai/annotations/core";

import type { DocDocument } from "./doc-schema";
import { deltaToPlainTextInline } from "./delta-markdown";

export type { AnnotationAgentRun, DanglingTarget } from "@codecaine-ai/annotations/core";
import type { AnnotationAgentRun, DanglingTarget } from "@codecaine-ai/annotations/core";

/** A message in an annotation's optional conversation thread. */
export type DocAnnotationReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type AnnotationTarget =
  | { kind: "block"; blockId: string; fingerprint?: string }
  | {
      kind: "canvas-object";
      canvasSrc: string;
      objectId?: string;
      connectionId?: string;
      region?: { x: number; y: number; width: number; height: number };
    }
  | {
      /**
       * A contiguous text range inside one block.
       *
       * Offset convention: `start`/`end` are UTF-16 code-unit offsets into the
       * `textContent` of the block's rendered element (the `[data-block-id]`
       * wrapper), with whitespace exactly as rendered — no trimming, no
       * collapsing. `end` is exclusive, so at creation time
       * `quote === renderedTextContent.slice(start, end)`. `quote` is the
       * exact selected text captured at creation, kept for drift detection
       * and display (the model cannot re-render the block to recover it).
       */
      kind: "text-range";
      blockId: string;
      start: number;
      end: number;
      quote: string;
      fingerprint?: string;
    };

export type AnnotationIntent = "note" | "agent-request";
export type AnnotationStatus = "open" | "resolved";

// `changedIds` (CP9, TG9.2/TG9.3) is optional/additive so bundles written by
// pre-CP9 code (no `changedIds`) still validate — it lists the block ids or
// canvas-object ids the agent run actually touched, letting the UI flash/
// highlight exactly those targets in an open viewer without re-diffing.
// (Carried by `AnnotationAgentRun`, re-exported from the engine above.)

export type DocAnnotation = {
  id: string;
  target: AnnotationTarget;
  body: string;
  intent: AnnotationIntent;
  author: string;
  status: AnnotationStatus;
  createdAt: string;
  agentRun?: AnnotationAgentRun;
  /**
   * Optional resolution note persisted when the annotation is resolved with a
   * response (CP9 `annotation_resolve(..., response)` — the design's tool
   * signature). Optional/additive like `changedIds` so pre-CP9 bundles
   * still validate.
   */
  resolution?: string;
  /** Optional conversation thread. Kept in the annotations sidecar. */
  replies?: DocAnnotationReply[];
};

export type AnnotationsDocument = { schemaVersion: 1; annotations: DocAnnotation[] };

export type AnnotationsValidationIssue = { path: string; message: string };
export type AnnotationsValidationResult =
  | { ok: true; document: AnnotationsDocument }
  | { ok: false; issues: AnnotationsValidationIssue[] };

type BlockTarget = Extract<AnnotationTarget, { kind: "block" }>;
type CanvasObjectTarget = Extract<AnnotationTarget, { kind: "canvas-object" }>;
type TextRangeTarget = Extract<AnnotationTarget, { kind: "text-range" }>;
type CanvasIndex = Record<string, { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }>;

const INVALID_FINGERPRINT = Symbol("invalid-fingerprint");

/** Optional/additive target drift evidence. It is never part of target identity. */
function validateFingerprint(
  raw: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): string | undefined | typeof INVALID_FINGERPRINT {
  if (raw.fingerprint === undefined) return undefined;
  if (typeof raw.fingerprint !== "string" || raw.fingerprint.length === 0) {
    issues.push({
      path: `${path}.fingerprint`,
      message: "Annotation target fingerprint must be a non-empty string.",
    });
    return INVALID_FINGERPRINT;
  }
  return raw.fingerprint;
}

export const blockTargetAdapter: TargetAdapter<BlockTarget, DocDocument | null> = {
  kind: "block",
  validateTarget(raw, path, issues: ValidationIssue[]) {
    const fingerprint = validateFingerprint(raw, path, issues);
    if (!isId(raw.blockId)) {
      issues.push({ path: `${path}.blockId`, message: "Block target requires a valid blockId." });
      return null;
    }
    if (fingerprint === INVALID_FINGERPRINT) return null;
    return {
      kind: "block",
      blockId: raw.blockId,
      ...(typeof fingerprint === "string" ? { fingerprint } : {}),
    };
  },
  key: (target) => `block:${target.blockId}`,
  label: (target) => `Block ${target.blockId}`,
  dangling(target, doc) {
    if (!doc || !doc.blocks[target.blockId]) {
      return `Block "${target.blockId}" no longer exists.`;
    }
    return null;
  },
};

export const canvasObjectTargetAdapter: TargetAdapter<CanvasObjectTarget, CanvasIndex | null | undefined> = {
  kind: "canvas-object",
  validateTarget(raw, path, issues: ValidationIssue[]) {
    if (typeof raw.canvasSrc !== "string" || raw.canvasSrc.length === 0) {
      issues.push({
        path: `${path}.canvasSrc`,
        message: "Canvas object target requires a non-empty canvasSrc.",
      });
    }

    const hasObjectId = raw.objectId !== undefined;
    const hasConnectionId = raw.connectionId !== undefined;
    const hasRegion = raw.region !== undefined;
    const selectorCount = [hasObjectId, hasConnectionId, hasRegion].filter(Boolean).length;
    if (selectorCount !== 1) {
      issues.push({
        path,
        message: "Canvas object target requires exactly one selector.",
      });
    }

    let objectId: string | undefined;
    if (hasObjectId) {
      if (typeof raw.objectId !== "string") {
        issues.push({ path: `${path}.objectId`, message: "Canvas objectId must be a string." });
      } else {
        objectId = raw.objectId;
      }
    }

    let connectionId: string | undefined;
    if (hasConnectionId) {
      if (typeof raw.connectionId !== "string") {
        issues.push({ path: `${path}.connectionId`, message: "Canvas connectionId must be a string." });
      } else {
        connectionId = raw.connectionId;
      }
    }

    let region: { x: number; y: number; width: number; height: number } | undefined;
    if (hasRegion) {
      if (!isRecord(raw.region)) {
        issues.push({ path: `${path}.region`, message: "Canvas region must be an object." });
      } else {
        const rawRegion = raw.region;
        for (const key of ["x", "y", "width", "height"] as const) {
          if (typeof rawRegion[key] !== "number" || !Number.isFinite(rawRegion[key])) {
            issues.push({ path: `${path}.region.${key}`, message: "Canvas region values must be finite numbers." });
          }
        }
        if (typeof rawRegion.width === "number" && Number.isFinite(rawRegion.width) && rawRegion.width <= 0) {
          issues.push({ path: `${path}.region.width`, message: "Canvas region width must be greater than 0." });
        }
        if (typeof rawRegion.height === "number" && Number.isFinite(rawRegion.height) && rawRegion.height <= 0) {
          issues.push({ path: `${path}.region.height`, message: "Canvas region height must be greater than 0." });
        }
        if (
          typeof rawRegion.x === "number" &&
          Number.isFinite(rawRegion.x) &&
          typeof rawRegion.y === "number" &&
          Number.isFinite(rawRegion.y) &&
          typeof rawRegion.width === "number" &&
          Number.isFinite(rawRegion.width) &&
          rawRegion.width > 0 &&
          typeof rawRegion.height === "number" &&
          Number.isFinite(rawRegion.height) &&
          rawRegion.height > 0
        ) {
          region = {
            x: rawRegion.x,
            y: rawRegion.y,
            width: rawRegion.width,
            height: rawRegion.height,
          };
        }
      }
    }

    if (issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`))) {
      return null;
    }

    if (objectId !== undefined) {
      return { kind: "canvas-object", canvasSrc: raw.canvasSrc as string, objectId };
    }
    if (connectionId !== undefined) {
      return { kind: "canvas-object", canvasSrc: raw.canvasSrc as string, connectionId };
    }
    if (region !== undefined) {
      return { kind: "canvas-object", canvasSrc: raw.canvasSrc as string, region };
    }
    return null;
  },
  key: (target) =>
    target.objectId !== undefined
      ? `canvas-object:${target.canvasSrc}:object:${target.objectId}`
      : target.connectionId !== undefined
        ? `canvas-object:${target.canvasSrc}:connection:${target.connectionId}`
        : `canvas-object:${target.canvasSrc}:region:${target.region?.x},${target.region?.y},${target.region?.width},${target.region?.height}`,
  label: (target) =>
    target.objectId !== undefined
      ? `Canvas object ${target.objectId}`
      : target.connectionId !== undefined
        ? `Canvas connection ${target.connectionId}`
        : `Canvas region on ${target.canvasSrc}`,
  dangling(target, canvases) {
    // Canvas index not loaded yet — can't tell dangling from in-flight.
    if (!canvases) return "skip";
    const canvas = canvases[target.canvasSrc];
    if (!canvas) {
      return `Canvas "${target.canvasSrc}" not loaded or missing.`;
    }
    if (target.objectId !== undefined && !canvas.objectIds.has(target.objectId)) {
      return `Canvas object "${target.objectId}" no longer exists.`;
    }
    if (target.connectionId !== undefined && !canvas.connectionIds.has(target.connectionId)) {
      return `Canvas connection "${target.connectionId}" no longer exists.`;
    }
    return null;
  },
};

/** Collapse whitespace runs and trim — the drift check's comparison form. */
function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const QUOTE_LABEL_MAX = 40;

function truncateQuote(text: string): string {
  return text.length > QUOTE_LABEL_MAX ? `${text.slice(0, QUOTE_LABEL_MAX - 1)}…` : text;
}

export const textRangeTargetAdapter: TargetAdapter<TextRangeTarget, DocDocument | null> = {
  kind: "text-range",
  validateTarget(raw, path, issues: ValidationIssue[]) {
    let ok = true;
    if (!isId(raw.blockId)) {
      issues.push({
        path: `${path}.blockId`,
        message: "Text range target requires a valid blockId.",
      });
      ok = false;
    }
    const startValid = typeof raw.start === "number" && Number.isInteger(raw.start) && raw.start >= 0;
    if (!startValid) {
      issues.push({
        path: `${path}.start`,
        message: "Text range start must be an integer >= 0.",
      });
      ok = false;
    }
    const endValid = typeof raw.end === "number" && Number.isInteger(raw.end);
    if (!endValid) {
      issues.push({ path: `${path}.end`, message: "Text range end must be an integer." });
      ok = false;
    }
    if (startValid && endValid && (raw.end as number) <= (raw.start as number)) {
      issues.push({
        path: `${path}.end`,
        message: "Text range end must be greater than start.",
      });
      ok = false;
    }
    if (typeof raw.quote !== "string" || raw.quote.length === 0) {
      issues.push({
        path: `${path}.quote`,
        message: "Text range target requires a non-empty quote.",
      });
      ok = false;
    }
    const fingerprint = validateFingerprint(raw, path, issues);
    if (fingerprint === INVALID_FINGERPRINT) ok = false;
    if (!ok) return null;
    return {
      kind: "text-range",
      blockId: raw.blockId as string,
      start: raw.start as number,
      end: raw.end as number,
      quote: raw.quote as string,
      ...(typeof fingerprint === "string" ? { fingerprint } : {}),
    };
  },
  key: (target) => `text-range:${target.blockId}:${target.start}-${target.end}`,
  label: (target) => `Text "${truncateQuote(normalizeQuote(target.quote))}"`,
  /**
   * Dangling policy: a missing block reports the same reason as the block
   * adapter. When the block EXISTS, exact offset re-validation would need the
   * block's rendered `textContent`, which the model cannot produce — but the
   * model CAN cheaply derive the block's own inline plain text via
   * `deltaToPlainTextInline(block.text)`. So the drift check is a
   * whitespace-NORMALIZED quote-containment test against that projection:
   * normalization absorbs rendering-only whitespace differences while still
   * catching real content drift. Blocks that carry no inline text spans
   * (canvas, image, code whose content lives in props, …) fall back to the
   * block-existence-only check — their rendered text is not derivable here.
   */
  dangling(target, doc) {
    if (!doc || !doc.blocks[target.blockId]) {
      return `Block "${target.blockId}" no longer exists.`;
    }
    const block = doc.blocks[target.blockId];
    if (!block.text || block.text.length === 0) return null;
    const plain = normalizeQuote(deltaToPlainTextInline(block.text));
    if (plain.length === 0) return null;
    if (!plain.includes(normalizeQuote(target.quote))) {
      return `Quoted text no longer appears in block "${target.blockId}".`;
    }
    return null;
  },
};

export const docsAnnotationSchema = createAnnotationSchema<AnnotationTarget>({
  adapters: [blockTargetAdapter, canvasObjectTargetAdapter, textRangeTargetAdapter],
  intents: ["note", "agent-request"],
  statuses: ["open", "resolved"],
});

export function validateAnnotationsDocument(value: unknown): AnnotationsValidationResult {
  const result = docsAnnotationSchema.validateDocument(value);
  if (!result.ok) return result;
  // The schema is configured with the docs intents/statuses, so the wide
  // engine strings are guaranteed to be the narrow docs unions.
  return { ok: true, document: result.document as AnnotationsDocument };
}

/* ------------------------------------------------------------------ */
/* Target fingerprints — drift evidence, not identity                  */
/* ------------------------------------------------------------------ */

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The target's current content fingerprint, or null when the target cannot
 * be represented as document text (canvas targets, or a missing block).
 */
export function docTargetFingerprint(
  doc: DocDocument,
  target: AnnotationTarget,
): string | null {
  if (target.kind === "canvas-object") return null;
  const block = doc.blocks[target.blockId];
  if (!block) return null;
  const text = target.kind === "text-range"
    ? target.quote
    : deltaToPlainTextInline(block.text);
  return hashText(normalizeQuote(text));
}

/**
 * Whether an annotation's filed target fingerprint differs from its current
 * text. Unstamped annotations and targets that no longer resolve are not
 * reported here; dangling-target handling owns the latter case.
 */
export function docTargetFingerprintChanged(doc: DocDocument, annotation: DocAnnotation): boolean {
  const fingerprint = annotation.target.kind === "canvas-object"
    ? undefined
    : annotation.target.fingerprint;
  if (fingerprint === undefined) return false;
  const current = docTargetFingerprint(doc, annotation.target);
  return current !== null && current !== fingerprint;
}

/**
 * Flags annotations whose targets no longer resolve.
 *
 * `canvases` distinguishes "not loaded yet" from "loaded and absent":
 * pass `null`/`undefined` while the canvas index is still loading and
 * canvas-target checks are SKIPPED entirely (block-target checks still
 * run) — otherwise every canvas-object annotation would flash "target
 * removed" during the load. Once loaded, an src missing from the map is
 * genuinely dangling.
 */
export function detectDanglingTargets(
  annotations: AnnotationsDocument,
  doc: DocDocument | null,
  canvases: CanvasIndex | null | undefined,
): DanglingTarget[] {
  return docsAnnotationSchema.detectDanglingTargets(annotations, {
    block: doc,
    "canvas-object": canvases,
    "text-range": doc,
  });
}
