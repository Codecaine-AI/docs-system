"use client";

/**
 * Plannotator v1 (M2 Checkpoint 5, TG5.3).
 *
 * A comment/annotation surface over a doc's `comments.json` (D_comments —
 * comments are workflow state and live ONLY in the bundle's comments.json,
 * never inside doc.json/.canvas.json). Supports two target kinds, matching
 * `CommentTarget` in `docs-model/comments-schema.ts`:
 *  - `block`: a doc block, selected by clicking through DocBlockRenderer's
 *    block wrappers (each block renders with `data-block-id`).
 *  - `canvas-object`: an object/connection/region on an embedded canvas,
 *    selected via the canvas viewer's object-click surface.
 *
 * This component is intentionally decoupled from the exact backend HTTP
 * contract (still being finalized as of this writing) — callers supply
 * `comments` + async `onAddComment`/`onResolveComment` callbacks, so the
 * host (DocsActionPane) owns the fetch/mutation wiring and can adapt to
 * whatever the comments routes end up shaped like without Plannotator
 * itself changing.
 *
 * Dangling targets (block deleted, canvas object removed) never crash —
 * `detectDanglingTargets` is used to compute a per-comment "target removed"
 * flag, and such comments render a clearly-marked inert state instead of
 * throwing or silently disappearing.
 */

import { useMemo, useState } from "react";
import { AlertTriangleIcon, CheckIcon, MessageSquarePlusIcon, SparklesIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "./ui/cn";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
  detectDanglingTargets,
  type CommentIntent,
  type CommentTarget,
  type DocComment,
} from "@codecaine-ai/docs-model/comments-schema";

/** What's currently selected as a comment target, before it's submitted. */
export type PlannotatorSelection =
  | { kind: "block"; blockId: string; label?: string }
  | {
      kind: "canvas-object";
      canvasSrc: string;
      objectId?: string;
      connectionId?: string;
      region?: { x: number; y: number; width: number; height: number };
      label?: string;
    };

export interface PlannotatorProps {
  /** All comments for the current doc bundle (raw, unfiltered by status). */
  comments: DocComment[];
  /** The doc being commented on, for dangling block-target detection. Null while loading. */
  document: DocDocument | null;
  /**
   * Canvas object/connection id sets keyed by canvas src, for dangling
   * canvas-object-target detection. Pass undefined/null while the index is
   * still LOADING — canvas-target checks are then skipped entirely (see
   * `detectDanglingTargets`). Once loaded, omit entries for srcs that
   * failed to resolve and those comments surface as dangling.
   */
  canvases?: Record<string, { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }> | null;
  /** Current pending selection (set by the host in response to a block/canvas-object click). */
  selection: PlannotatorSelection | null;
  /** Clears the pending selection (e.g. composer cancel). */
  onClearSelection: () => void;
  /** Submits a new comment against `selection`. Host performs the actual API call. */
  onAddComment: (input: { target: CommentTarget; body: string; intent: CommentIntent }) => Promise<void>;
  /** Marks a comment resolved. Host performs the actual API call. */
  onResolveComment: (commentId: string) => Promise<void>;
  /** Jumps the viewer to a comment's target (scroll to block / focus canvas object). */
  onFocusTarget?: (target: CommentTarget) => void;
  /**
   * Kicks off an agent run for an `agent-request` comment. Host performs the
   * actual API call (runDocAgentRequest). Optional — omit to not render the
   * Run-agent button at all.
   */
  onRunAgent?: (commentId: string) => Promise<
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
}

const INTENT_OPTIONS: Array<{ value: CommentIntent; label: string; hint: string }> = [
  { value: "note", label: "Note", hint: "Just a comment — no action requested." },
  { value: "agent-request", label: "Agent request", hint: "Ask an agent to act on this." },
];

function targetKey(target: CommentTarget): string {
  if (target.kind === "block") return `block:${target.blockId}`;
  if (target.objectId) return `canvas-object:${target.canvasSrc}:obj:${target.objectId}`;
  if (target.connectionId) return `canvas-object:${target.canvasSrc}:conn:${target.connectionId}`;
  if (target.region) {
    return `canvas-object:${target.canvasSrc}:region:${target.region.x},${target.region.y}`;
  }
  return `canvas-object:${target.canvasSrc}`;
}

function selectionToTarget(selection: PlannotatorSelection): CommentTarget {
  if (selection.kind === "block") return { kind: "block", blockId: selection.blockId };
  return {
    kind: "canvas-object",
    canvasSrc: selection.canvasSrc,
    objectId: selection.objectId,
    connectionId: selection.connectionId,
    region: selection.region,
  };
}

function targetLabel(target: CommentTarget): string {
  if (target.kind === "block") return `Block ${target.blockId}`;
  if (target.objectId) return `Canvas object ${target.objectId}`;
  if (target.connectionId) return `Canvas connection ${target.connectionId}`;
  if (target.region) return `Canvas region @ (${target.region.x}, ${target.region.y})`;
  return `Canvas ${target.canvasSrc}`;
}

/** Groups comments by target so the marker list can show one entry with an open-count per target. */
function groupByTarget(comments: DocComment[]): Map<string, DocComment[]> {
  const groups = new Map<string, DocComment[]>();
  for (const comment of comments) {
    const key = targetKey(comment.target);
    const existing = groups.get(key);
    if (existing) existing.push(comment);
    else groups.set(key, [comment]);
  }
  return groups;
}

export default function Plannotator({
  comments,
  document,
  canvases,
  selection,
  onClearSelection,
  onAddComment,
  onResolveComment,
  onFocusTarget,
  onRunAgent,
  onUndoPatch,
  isSubmitting,
  className,
}: PlannotatorProps) {
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState<CommentIntent>("note");
  const [error, setError] = useState<string | null>(null);
  const [runningAgentIds, setRunningAgentIds] = useState<Set<string>>(new Set());
  const [undoingPatchIds, setUndoingPatchIds] = useState<Set<string>>(new Set());
  const [undonePatchIds, setUndonePatchIds] = useState<Set<string>>(new Set());
  const [agentErrors, setAgentErrors] = useState<Record<string, string>>({});

  const danglingIds = useMemo(() => {
    const dangling = detectDanglingTargets({ schemaVersion: 1, comments }, document, canvases);
    return new Map(dangling.map((entry) => [entry.commentId, entry.reason]));
  }, [comments, document, canvases]);

  const groups = useMemo(() => groupByTarget(comments), [comments]);

  const submit = async () => {
    if (!selection || !body.trim()) return;
    setError(null);
    try {
      await onAddComment({ target: selectionToTarget(selection), body: body.trim(), intent });
      setBody("");
      setIntent("note");
      onClearSelection();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add comment.");
    }
  };

  const runAgent = async (commentId: string) => {
    if (!onRunAgent) return;
    setRunningAgentIds((prev) => new Set(prev).add(commentId));
    setAgentErrors((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
    try {
      const result = await onRunAgent(commentId);
      if (!result.ok) {
        setAgentErrors((prev) => ({ ...prev, [commentId]: result.detail }));
      }
    } catch (runError) {
      setAgentErrors((prev) => ({
        ...prev,
        [commentId]: runError instanceof Error ? runError.message : "Failed to run agent.",
      }));
    } finally {
      setRunningAgentIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };

  const undoPatch = async (commentId: string, patchId: string, changedIds?: string[]) => {
    if (!onUndoPatch) return;
    setUndoingPatchIds((prev) => new Set(prev).add(commentId));
    setAgentErrors((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
    try {
      const result = await onUndoPatch(patchId, changedIds);
      if (result.ok) {
        setUndonePatchIds((prev) => new Set(prev).add(commentId));
      } else {
        setAgentErrors((prev) => ({ ...prev, [commentId]: result.detail }));
      }
    } catch (undoError) {
      setAgentErrors((prev) => ({
        ...prev,
        [commentId]: undoError instanceof Error ? undoError.message : "Failed to undo patch.",
      }));
    } finally {
      setUndoingPatchIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)} data-plannotator="root">
      {selection && (
        <div
          className="flex flex-col gap-2 rounded-md border bg-popover p-3 shadow-sm"
          data-plannotator="composer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Commenting on: {selection.label ?? targetLabel(selectionToTarget(selection))}
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={onClearSelection}>
              Cancel
            </Button>
          </div>

          <div className="flex gap-1">
            {INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-plannotator-intent={option.value}
                aria-pressed={intent === option.value}
                title={option.hint}
                onClick={() => setIntent(option.value)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  intent === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {option.value === "agent-request" && <SparklesIcon className="h-3 w-3" />}
                {option.label}
              </button>
            ))}
          </div>

          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            rows={3}
            placeholder={
              intent === "agent-request"
                ? "Describe what you want an agent to do..."
                : "Add a comment..."
            }
            className="min-h-20 resize-none text-sm"
          />

          {error && <div className="text-xs text-destructive">{error}</div>}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!body.trim() || isSubmitting}
              onClick={() => void submit()}
            >
              <MessageSquarePlusIcon className="h-3.5 w-3.5" />
              {isSubmitting ? "Posting..." : "Post comment"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3" data-plannotator="list">
        {groups.size === 0 && (
          <div className="text-sm text-muted-foreground">
            No comments yet. Select a block or canvas object to start one.
          </div>
        )}

        {Array.from(groups.entries()).map(([key, group]) => {
          const openCount = group.filter((c) => c.status === "open").length;
          const target = group[0].target;
          const dangling = group.find((c) => danglingIds.has(c.id));

          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-md border p-3"
              data-plannotator-target={key}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => onFocusTarget?.(target)}
                  disabled={!onFocusTarget || Boolean(dangling)}
                >
                  {targetLabel(target)}
                </button>
                <div className="flex items-center gap-1">
                  {dangling && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangleIcon className="h-3 w-3" />
                      Target removed
                    </Badge>
                  )}
                  {openCount > 0 && <Badge variant="secondary">{openCount} open</Badge>}
                </div>
              </div>

              {dangling && (
                <div className="text-xs text-muted-foreground" data-plannotator-dangling-reason="">
                  {danglingIds.get(dangling.id)}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {group.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex flex-col gap-1 rounded border bg-muted/20 p-2"
                    data-plannotator-comment-id={comment.id}
                    data-plannotator-comment-status={comment.status}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{comment.author}</span>
                        {comment.intent === "agent-request" && (
                          <Badge variant="outline" className="gap-1">
                            <SparklesIcon className="h-3 w-3" />
                            Agent request
                          </Badge>
                        )}
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      {comment.status === "open" && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => void onResolveComment(comment.id)}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          Resolve
                        </Button>
                      )}
                      {comment.status === "resolved" && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckIcon className="h-3 w-3" />
                          Resolved
                        </Badge>
                      )}
                      {comment.intent === "agent-request" &&
                        comment.status === "open" &&
                        !comment.agentRun &&
                        onRunAgent && (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={runningAgentIds.has(comment.id)}
                            onClick={() => void runAgent(comment.id)}
                          >
                            <SparklesIcon className="h-3.5 w-3.5" />
                            {runningAgentIds.has(comment.id) ? "Running..." : "Run agent"}
                          </Button>
                        )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                    {comment.agentRun && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          Agent run: {comment.agentRun.summary}
                        </div>
                        {onUndoPatch && (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={
                              undoingPatchIds.has(comment.id) || undonePatchIds.has(comment.id)
                            }
                            onClick={() =>
                              void undoPatch(
                                comment.id,
                                comment.agentRun!.patchId,
                                comment.agentRun!.changedIds,
                              )
                            }
                          >
                            {undonePatchIds.has(comment.id)
                              ? "Undone"
                              : undoingPatchIds.has(comment.id)
                                ? "Undoing..."
                                : "Undo"}
                          </Button>
                        )}
                      </div>
                    )}
                    {agentErrors[comment.id] && (
                      <div className="text-xs text-destructive" data-plannotator-agent-error="">
                        {agentErrors[comment.id]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
