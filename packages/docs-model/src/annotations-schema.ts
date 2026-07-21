"use client";

/**
 * Annotations sidecar schema — an annotation marks a spot in a doc (a block,
 * or an object on an embedded canvas) and requests a change; agents process
 * them. Annotations are workflow state and live ONLY in the bundle's
 * `annotations.json` sidecar, never inside doc.json/.canvas.json. The
 * top-level array key is `annotations` — there is no other accepted shape.
 */

import type { DocDocument } from "./doc-schema";

export type AnnotationTarget =
  | { kind: "block"; blockId: string }
  | {
      kind: "canvas-object";
      canvasSrc: string;
      objectId?: string;
      connectionId?: string;
      region?: { x: number; y: number; width: number; height: number };
    };

export type AnnotationIntent = "note" | "agent-request";
export type AnnotationStatus = "open" | "resolved";

// `changedIds` (CP9, TG9.2/TG9.3) is optional/additive so bundles written by
// pre-CP9 code (no `changedIds`) still validate — it lists the block ids or
// canvas-object ids the agent run actually touched, letting the UI flash/
// highlight exactly those targets in an open viewer without re-diffing.
export type AnnotationAgentRun = { sessionId: string; patchId: string; summary: string; changedIds?: string[] };

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
};

export type AnnotationsDocument = { schemaVersion: 1; annotations: DocAnnotation[] };

export type AnnotationsValidationIssue = { path: string; message: string };
export type AnnotationsValidationResult =
  | { ok: true; document: AnnotationsDocument }
  | { ok: false; issues: AnnotationsValidationIssue[] };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validateTarget(
  value: unknown,
  path: string,
  issues: AnnotationsValidationIssue[],
): AnnotationTarget | null {
  if (!isRecord(value)) {
    issues.push({ path, message: "Annotation target must be an object." });
    return null;
  }

  if (value.kind === "block") {
    if (!isId(value.blockId)) {
      issues.push({ path: `${path}.blockId`, message: "Block target requires a valid blockId." });
      return null;
    }
    return { kind: "block", blockId: value.blockId };
  }

  if (value.kind !== "canvas-object") {
    issues.push({ path: `${path}.kind`, message: "Annotation target kind must be block or canvas-object." });
    return null;
  }

  if (typeof value.canvasSrc !== "string" || value.canvasSrc.length === 0) {
    issues.push({
      path: `${path}.canvasSrc`,
      message: "Canvas object target requires a non-empty canvasSrc.",
    });
  }

  const hasObjectId = value.objectId !== undefined;
  const hasConnectionId = value.connectionId !== undefined;
  const hasRegion = value.region !== undefined;
  const selectorCount = [hasObjectId, hasConnectionId, hasRegion].filter(Boolean).length;
  if (selectorCount !== 1) {
    issues.push({
      path,
      message: "Canvas object target requires exactly one selector.",
    });
  }

  let objectId: string | undefined;
  if (hasObjectId) {
    if (typeof value.objectId !== "string") {
      issues.push({ path: `${path}.objectId`, message: "Canvas objectId must be a string." });
    } else {
      objectId = value.objectId;
    }
  }

  let connectionId: string | undefined;
  if (hasConnectionId) {
    if (typeof value.connectionId !== "string") {
      issues.push({ path: `${path}.connectionId`, message: "Canvas connectionId must be a string." });
    } else {
      connectionId = value.connectionId;
    }
  }

  let region: { x: number; y: number; width: number; height: number } | undefined;
  if (hasRegion) {
    if (!isRecord(value.region)) {
      issues.push({ path: `${path}.region`, message: "Canvas region must be an object." });
    } else {
      const rawRegion = value.region;
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
    return { kind: "canvas-object", canvasSrc: value.canvasSrc as string, objectId };
  }
  if (connectionId !== undefined) {
    return { kind: "canvas-object", canvasSrc: value.canvasSrc as string, connectionId };
  }
  if (region !== undefined) {
    return { kind: "canvas-object", canvasSrc: value.canvasSrc as string, region };
  }
  return null;
}

export function validateAnnotationsDocument(value: unknown): AnnotationsValidationResult {
  const issues: AnnotationsValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Annotations document must be an object." }] };
  }
  if (value.schemaVersion !== 1) {
    issues.push({ path: "$.schemaVersion", message: "Annotations schemaVersion must be 1." });
  }

  if (!Array.isArray(value.annotations)) {
    issues.push({ path: "$.annotations", message: "Annotations must be an array." });
    return { ok: false, issues };
  }
  const rawAnnotations = value.annotations;

  const seenIds = new Set<string>();
  const annotations: DocAnnotation[] = [];
  for (const [index, rawAnnotation] of rawAnnotations.entries()) {
    const path = `$.annotations[${index}]`;
    if (!isRecord(rawAnnotation)) {
      issues.push({ path, message: "Annotation must be an object." });
      continue;
    }

    if (!isId(rawAnnotation.id)) {
      issues.push({ path: `${path}.id`, message: "Annotation requires a valid id." });
    } else if (seenIds.has(rawAnnotation.id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate annotation id "${rawAnnotation.id}".` });
    } else {
      seenIds.add(rawAnnotation.id);
    }

    const target = validateTarget(rawAnnotation.target, `${path}.target`, issues);

    if (typeof rawAnnotation.body !== "string") {
      issues.push({ path: `${path}.body`, message: "Annotation body must be a string." });
    }
    if (rawAnnotation.intent !== "note" && rawAnnotation.intent !== "agent-request") {
      issues.push({ path: `${path}.intent`, message: "Annotation intent must be note or agent-request." });
    }
    if (typeof rawAnnotation.author !== "string" || rawAnnotation.author.length === 0) {
      issues.push({ path: `${path}.author`, message: "Annotation author must be a non-empty string." });
    }
    if (rawAnnotation.status !== "open" && rawAnnotation.status !== "resolved") {
      issues.push({ path: `${path}.status`, message: "Annotation status must be open or resolved." });
    }
    if (typeof rawAnnotation.createdAt !== "string") {
      issues.push({ path: `${path}.createdAt`, message: "Annotation createdAt must be a string." });
    }

    let agentRun: AnnotationAgentRun | undefined;
    if (rawAnnotation.agentRun !== undefined) {
      if (!isRecord(rawAnnotation.agentRun)) {
        issues.push({ path: `${path}.agentRun`, message: "Annotation agentRun must be an object." });
      } else {
        const rawAgentRun = rawAnnotation.agentRun;
        if (typeof rawAgentRun.sessionId !== "string") {
          issues.push({ path: `${path}.agentRun.sessionId`, message: "Annotation agentRun sessionId must be a string." });
        }
        if (typeof rawAgentRun.patchId !== "string") {
          issues.push({ path: `${path}.agentRun.patchId`, message: "Annotation agentRun patchId must be a string." });
        }
        if (typeof rawAgentRun.summary !== "string") {
          issues.push({ path: `${path}.agentRun.summary`, message: "Annotation agentRun summary must be a string." });
        }
        let changedIds: string[] | undefined;
        let changedIdsValid = true;
        if (rawAgentRun.changedIds !== undefined) {
          if (!Array.isArray(rawAgentRun.changedIds) || !rawAgentRun.changedIds.every((v) => typeof v === "string")) {
            changedIdsValid = false;
            issues.push({
              path: `${path}.agentRun.changedIds`,
              message: "Annotation agentRun changedIds must be an array of strings.",
            });
          } else {
            changedIds = rawAgentRun.changedIds;
          }
        }
        if (
          typeof rawAgentRun.sessionId === "string" &&
          typeof rawAgentRun.patchId === "string" &&
          typeof rawAgentRun.summary === "string" &&
          changedIdsValid
        ) {
          agentRun = {
            sessionId: rawAgentRun.sessionId,
            patchId: rawAgentRun.patchId,
            summary: rawAgentRun.summary,
            ...(changedIds ? { changedIds } : {}),
          };
        }
      }
    }

    let resolutionValid = true;
    if (rawAnnotation.resolution !== undefined && typeof rawAnnotation.resolution !== "string") {
      resolutionValid = false;
      issues.push({
        path: `${path}.resolution`,
        message: "Annotation resolution must be a string when present.",
      });
    }

    if (
      isId(rawAnnotation.id) &&
      target &&
      typeof rawAnnotation.body === "string" &&
      (rawAnnotation.intent === "note" || rawAnnotation.intent === "agent-request") &&
      typeof rawAnnotation.author === "string" &&
      rawAnnotation.author.length > 0 &&
      (rawAnnotation.status === "open" || rawAnnotation.status === "resolved") &&
      typeof rawAnnotation.createdAt === "string" &&
      (rawAnnotation.agentRun === undefined || agentRun) &&
      resolutionValid
    ) {
      annotations.push({
        id: rawAnnotation.id,
        target,
        body: rawAnnotation.body,
        intent: rawAnnotation.intent,
        author: rawAnnotation.author,
        status: rawAnnotation.status,
        createdAt: rawAnnotation.createdAt,
        ...(agentRun ? { agentRun } : {}),
        ...(typeof rawAnnotation.resolution === "string" ? { resolution: rawAnnotation.resolution } : {}),
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: { schemaVersion: 1, annotations } };
}

export type DanglingTarget = { annotationId: string; reason: string };

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
  canvases:
    | Record<string, { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }>
    | null
    | undefined,
): DanglingTarget[] {
  const dangling: DanglingTarget[] = [];
  for (const annotation of annotations.annotations) {
    if (annotation.target.kind === "block") {
      if (!doc || !doc.blocks[annotation.target.blockId]) {
        dangling.push({
          annotationId: annotation.id,
          reason: `Block "${annotation.target.blockId}" no longer exists.`,
        });
      }
      continue;
    }

    // Canvas index not loaded yet — can't tell dangling from in-flight.
    if (!canvases) continue;

    const canvas = canvases[annotation.target.canvasSrc];
    if (!canvas) {
      dangling.push({
        annotationId: annotation.id,
        reason: `Canvas "${annotation.target.canvasSrc}" not loaded or missing.`,
      });
      continue;
    }
    if (annotation.target.objectId !== undefined && !canvas.objectIds.has(annotation.target.objectId)) {
      dangling.push({
        annotationId: annotation.id,
        reason: `Canvas object "${annotation.target.objectId}" no longer exists.`,
      });
    }
    if (annotation.target.connectionId !== undefined && !canvas.connectionIds.has(annotation.target.connectionId)) {
      dangling.push({
        annotationId: annotation.id,
        reason: `Canvas connection "${annotation.target.connectionId}" no longer exists.`,
      });
    }
  }
  return dangling;
}
