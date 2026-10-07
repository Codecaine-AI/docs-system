import type { ApiError } from "../../data/api";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { AnnotationTarget } from "@codecaine-ai/docs-model/annotations-schema";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocEditTarget } from "@codecaine-ai/docs-viewer/lab";
import { resolveBundleCanvasSrc } from "@codecaine-ai/docs-viewer/bundle-src";

/** Keep server-side op/schema refusal details visible at the editing surface. */
export function docSaveApiErrorMessage(error: ApiError): string {
  const rawIssues = error.payload?.issues;
  if (!Array.isArray(rawIssues)) return error.message;
  const issues = rawIssues
    .flatMap((issue) => {
      if (!issue || typeof issue !== "object") return [];
      const path = "path" in issue && typeof issue.path === "string" ? issue.path : null;
      const message =
        "message" in issue && typeof issue.message === "string" ? issue.message : null;
      return path && message ? [`${path}: ${message}`] : [];
    });
  if (issues.length === 0) return error.message;
  const visible = issues.slice(0, 3);
  const remainder = issues.length - visible.length;
  return `${error.message}: ${visible.join("; ")}${remainder > 0 ? `; +${remainder} more` : ""}`;
}

/** Hover-chip text preview: whitespace-collapsed, truncated like the old layer's. */
export function truncateLabelText(text: string, max = 42): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

/** The pinned selection as the annotation target it submits. */
export function selectionToTarget(selection: PlannotatorSelection): AnnotationTarget {
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

export function selectionToDocEditTarget(
  selection: PlannotatorSelection,
): DocEditTarget | null {
  if (selection.kind === "block") {
    return { kind: "block", blockId: selection.blockId };
  }
  if (selection.kind === "text-range") {
    return {
      kind: "text-range",
      blockId: selection.blockId,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
    };
  }
  return null;
}

/** Ids of canvas blocks in `doc` whose resolved src equals `canvasSrc`. */
export function canvasBlockIdsForSrc(
  doc: DocDocument,
  bundlePath: string,
  canvasSrc: string,
): string[] {
  const ids: string[] = [];
  for (const block of Object.values(doc.blocks)) {
    if (
      block.type === "canvas" &&
      typeof block.props?.src === "string" &&
      resolveBundleCanvasSrc(bundlePath, block.props.src) === canvasSrc
    ) {
      ids.push(block.id);
    }
  }
  return ids;
}

