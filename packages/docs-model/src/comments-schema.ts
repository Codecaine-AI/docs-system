"use client";

import type { DocDocument } from "./doc-schema";

export type CommentTarget =
  | { kind: "block"; blockId: string }
  | {
      kind: "canvas-object";
      canvasSrc: string;
      objectId?: string;
      connectionId?: string;
      region?: { x: number; y: number; width: number; height: number };
    };

export type CommentIntent = "note" | "agent-request";
export type CommentStatus = "open" | "resolved";

// `changedIds` (CP9, TG9.2/TG9.3) is optional/additive so bundles written by
// pre-CP9 code (no `changedIds`) still validate — it lists the block ids or
// canvas-object ids the agent run actually touched, letting the UI flash/
// highlight exactly those targets in an open viewer without re-diffing.
export type CommentAgentRun = { sessionId: string; patchId: string; summary: string; changedIds?: string[] };

export type DocComment = {
  id: string;
  target: CommentTarget;
  body: string;
  intent: CommentIntent;
  author: string;
  status: CommentStatus;
  createdAt: string;
  agentRun?: CommentAgentRun;
  /**
   * Optional resolution note persisted when the comment is resolved with a
   * response (CP9 `comment_resolve(..., response)` — the design's tool
   * signature). Optional/additive like `changedIds` so pre-CP9 bundles
   * still validate.
   */
  resolution?: string;
};

export type CommentsDocument = { schemaVersion: 1; comments: DocComment[] };

export type CommentsValidationIssue = { path: string; message: string };
export type CommentsValidationResult =
  | { ok: true; document: CommentsDocument }
  | { ok: false; issues: CommentsValidationIssue[] };

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
  issues: CommentsValidationIssue[],
): CommentTarget | null {
  if (!isRecord(value)) {
    issues.push({ path, message: "Comment target must be an object." });
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
    issues.push({ path: `${path}.kind`, message: "Comment target kind must be block or canvas-object." });
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

export function validateCommentsDocument(value: unknown): CommentsValidationResult {
  const issues: CommentsValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Comments document must be an object." }] };
  }
  if (value.schemaVersion !== 1) {
    issues.push({ path: "$.schemaVersion", message: "Comments schemaVersion must be 1." });
  }
  if (!Array.isArray(value.comments)) {
    issues.push({ path: "$.comments", message: "Comments must be an array." });
    return { ok: false, issues };
  }

  const seenIds = new Set<string>();
  const comments: DocComment[] = [];
  for (const [index, rawComment] of value.comments.entries()) {
    const path = `$.comments[${index}]`;
    if (!isRecord(rawComment)) {
      issues.push({ path, message: "Comment must be an object." });
      continue;
    }

    if (!isId(rawComment.id)) {
      issues.push({ path: `${path}.id`, message: "Comment requires a valid id." });
    } else if (seenIds.has(rawComment.id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate comment id "${rawComment.id}".` });
    } else {
      seenIds.add(rawComment.id);
    }

    const target = validateTarget(rawComment.target, `${path}.target`, issues);

    if (typeof rawComment.body !== "string") {
      issues.push({ path: `${path}.body`, message: "Comment body must be a string." });
    }
    if (rawComment.intent !== "note" && rawComment.intent !== "agent-request") {
      issues.push({ path: `${path}.intent`, message: "Comment intent must be note or agent-request." });
    }
    if (typeof rawComment.author !== "string" || rawComment.author.length === 0) {
      issues.push({ path: `${path}.author`, message: "Comment author must be a non-empty string." });
    }
    if (rawComment.status !== "open" && rawComment.status !== "resolved") {
      issues.push({ path: `${path}.status`, message: "Comment status must be open or resolved." });
    }
    if (typeof rawComment.createdAt !== "string") {
      issues.push({ path: `${path}.createdAt`, message: "Comment createdAt must be a string." });
    }

    let agentRun: CommentAgentRun | undefined;
    if (rawComment.agentRun !== undefined) {
      if (!isRecord(rawComment.agentRun)) {
        issues.push({ path: `${path}.agentRun`, message: "Comment agentRun must be an object." });
      } else {
        const rawAgentRun = rawComment.agentRun;
        if (typeof rawAgentRun.sessionId !== "string") {
          issues.push({ path: `${path}.agentRun.sessionId`, message: "Comment agentRun sessionId must be a string." });
        }
        if (typeof rawAgentRun.patchId !== "string") {
          issues.push({ path: `${path}.agentRun.patchId`, message: "Comment agentRun patchId must be a string." });
        }
        if (typeof rawAgentRun.summary !== "string") {
          issues.push({ path: `${path}.agentRun.summary`, message: "Comment agentRun summary must be a string." });
        }
        let changedIds: string[] | undefined;
        let changedIdsValid = true;
        if (rawAgentRun.changedIds !== undefined) {
          if (!Array.isArray(rawAgentRun.changedIds) || !rawAgentRun.changedIds.every((v) => typeof v === "string")) {
            changedIdsValid = false;
            issues.push({
              path: `${path}.agentRun.changedIds`,
              message: "Comment agentRun changedIds must be an array of strings.",
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
    if (rawComment.resolution !== undefined && typeof rawComment.resolution !== "string") {
      resolutionValid = false;
      issues.push({
        path: `${path}.resolution`,
        message: "Comment resolution must be a string when present.",
      });
    }

    if (
      isId(rawComment.id) &&
      target &&
      typeof rawComment.body === "string" &&
      (rawComment.intent === "note" || rawComment.intent === "agent-request") &&
      typeof rawComment.author === "string" &&
      rawComment.author.length > 0 &&
      (rawComment.status === "open" || rawComment.status === "resolved") &&
      typeof rawComment.createdAt === "string" &&
      (rawComment.agentRun === undefined || agentRun) &&
      resolutionValid
    ) {
      comments.push({
        id: rawComment.id,
        target,
        body: rawComment.body,
        intent: rawComment.intent,
        author: rawComment.author,
        status: rawComment.status,
        createdAt: rawComment.createdAt,
        ...(agentRun ? { agentRun } : {}),
        ...(typeof rawComment.resolution === "string" ? { resolution: rawComment.resolution } : {}),
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: { schemaVersion: 1, comments } };
}

export type DanglingTarget = { commentId: string; reason: string };

/**
 * Flags comments whose targets no longer resolve.
 *
 * `canvases` distinguishes "not loaded yet" from "loaded and absent":
 * pass `null`/`undefined` while the canvas index is still loading and
 * canvas-target checks are SKIPPED entirely (block-target checks still
 * run) — otherwise every canvas-object comment would flash "target
 * removed" during the load. Once loaded, an src missing from the map is
 * genuinely dangling.
 */
export function detectDanglingTargets(
  comments: CommentsDocument,
  doc: DocDocument | null,
  canvases:
    | Record<string, { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }>
    | null
    | undefined,
): DanglingTarget[] {
  const dangling: DanglingTarget[] = [];
  for (const comment of comments.comments) {
    if (comment.target.kind === "block") {
      if (!doc || !doc.blocks[comment.target.blockId]) {
        dangling.push({
          commentId: comment.id,
          reason: `Block "${comment.target.blockId}" no longer exists.`,
        });
      }
      continue;
    }

    // Canvas index not loaded yet — can't tell dangling from in-flight.
    if (!canvases) continue;

    const canvas = canvases[comment.target.canvasSrc];
    if (!canvas) {
      dangling.push({
        commentId: comment.id,
        reason: `Canvas "${comment.target.canvasSrc}" not loaded or missing.`,
      });
      continue;
    }
    if (comment.target.objectId !== undefined && !canvas.objectIds.has(comment.target.objectId)) {
      dangling.push({
        commentId: comment.id,
        reason: `Canvas object "${comment.target.objectId}" no longer exists.`,
      });
    }
    if (comment.target.connectionId !== undefined && !canvas.connectionIds.has(comment.target.connectionId)) {
      dangling.push({
        commentId: comment.id,
        reason: `Canvas connection "${comment.target.connectionId}" no longer exists.`,
      });
    }
  }
  return dangling;
}
