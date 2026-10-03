/**
 * The staging contract. The `ops` on a sweep's changes are a preview in sweep order. A stage step
 * rebuilds ops from each approved change's `produced` blocks instead, against the page as it is
 * then, so rejecting one change never shifts another.
 */
import { createHash } from "node:crypto";
import { applyOps, serializeDocDocument, type DocDocument, type DocOp } from "@codecaine-ai/docs-model";
import { rewriteToOps } from "../rewrite";
import type { BlockChange, PageResult } from "../types";

/**
 * The content hash docs-server stores as a proposal's baseHash: SHA-256 hex of the canonical
 * serialization (serializeDocDocument) of the validated page, as docs-server/src/bundle.ts computes
 * docHash. It is computed here so that docs-style does not depend on docs-server.
 */
export function docHash(doc: DocDocument): string {
  return createHash("sha256").update(serializeDocDocument(doc)).digest("hex");
}

/**
 * The review key of a change: "page#blockId" for a rewrite and "page#blockId@autofix" for an
 * autofix, so the two changes one block can get are reviewed apart.
 */
export function changeKey(pagePath: string, change: Pick<BlockChange, "blockId" | "kind">): string {
  return `${pagePath}#${change.blockId}${change.kind === "autofix" ? "@autofix" : ""}`;
}

/** The IDs of the bullets a rewrite of `blockId` inserts. The sweep and the stage step must agree. */
export function rewriteIdsFor(blockId: string): (n: number) => string {
  return (n) => `${blockId}-r${n}`;
}

/**
 * The ops one change stages against `doc`. An autofix replaces its block's text, and a rewrite
 * rebuilds its lead and bullets from `produced`. Empty when the change has nothing to stage.
 */
export function changeOps(doc: DocDocument, change: BlockChange): DocOp[] {
  const produced = change.produced ?? [];
  if (change.kind === "autofix") return produced[0] ? [{ type: "updateBlock", blockId: change.blockId, text: produced[0].spans }] : [];
  return rewriteToOps(structuredClone(doc), change.blockId, produced, rewriteIdsFor(change.blockId));
}

export interface StagePlan {
  ops: DocOp[];
  /** The keys of the changes the ops stage, in order. */
  staged: string[];
  /** Approved changes that are not staged, with the reason. */
  held: { key: string; reason: string }[];
}

/**
 * Plans the ops that stage the approved changes of one page, rebuilt one change at a time against
 * `doc`, the page as it is now. Pure.
 * - Compare `page.baseHash` with docHash(doc) first: a change that no longer applies throws.
 * - A rewrite's text includes its block's autofix, so a rewrite stages only when that autofix is
 *   approved too. Otherwise a rejected autofix would land inside the rewrite.
 */
export function planStage(doc: DocDocument, page: PageResult, approved: ReadonlySet<string>): StagePlan {
  const autofixed = new Map(
    page.changes.filter((change) => change.kind === "autofix" && change.status === "accepted").map((change) => [change.blockId, change]),
  );
  let working = doc;
  const plan: StagePlan = { ops: [], staged: [], held: [] };
  for (const change of page.changes) {
    const key = changeKey(page.path, change);
    if (change.status !== "accepted" || !approved.has(key)) continue;
    if (!change.produced) {
      plan.held.push({ key, reason: "the change has no produced text to stage" });
      continue;
    }
    const autofix = change.kind === "rewrite" ? autofixed.get(change.blockId) : undefined;
    if (autofix && !approved.has(changeKey(page.path, autofix))) {
      plan.held.push({ key, reason: "its block's autofix is not approved, and the rewrite text includes it" });
      continue;
    }
    const ops = changeOps(working, change);
    const applied = ops.length ? applyOps(working, ops) : undefined;
    if (!applied?.ok) throw new Error(`The ${change.kind} of block "${change.blockId}" no longer applies to ${page.path}.`);
    working = applied.doc;
    plan.ops.push(...ops);
    plan.staged.push(key);
  }
  return plan;
}

/** The ops of planStage alone. */
export function stageOps(doc: DocDocument, page: PageResult, approved: ReadonlySet<string>): DocOp[] {
  return planStage(doc, page, approved).ops;
}
