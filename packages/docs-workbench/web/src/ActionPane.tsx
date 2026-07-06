import Plannotator, { type PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
  CommentIntent,
  CommentTarget,
  DocComment,
} from "@codecaine-ai/docs-model/comments-schema";

/**
 * Annotate-mode side pane (the standalone counterpart of Spectre's
 * DocsActionPane comments tab): a header with the open-comment count, a
 * selection hint, and Plannotator (composer + grouped comment list with
 * resolve + dangling-target handling). All mutation wiring lives in DocPage.
 */
export function ActionPane({
  comments,
  document,
  canvases,
  selection,
  onClearSelection,
  onAddComment,
  onResolveComment,
  onFocusTarget,
  isSubmitting,
  error,
}: {
  comments: DocComment[];
  document: DocDocument | null;
  canvases?: Record<
    string,
    { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }
  > | null;
  selection: PlannotatorSelection | null;
  onClearSelection: () => void;
  onAddComment: (input: {
    target: CommentTarget;
    body: string;
    intent: CommentIntent;
  }) => Promise<void>;
  onResolveComment: (commentId: string) => Promise<void>;
  onFocusTarget: (target: CommentTarget) => void;
  isSubmitting?: boolean;
  error?: string | null;
}) {
  const openCount = comments.filter((comment) => comment.status === "open").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Comments
        </h2>
        {openCount > 0 && (
          <span
            data-docs-open-comment-count=""
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {openCount} open
          </span>
        )}
      </div>

      {!selection && (
        <p className="text-xs text-muted-foreground">
          Click a block in the document (or an object on an embedded canvas) to comment on it.
        </p>
      )}

      {error && (
        <div data-docs-pane-error="" className="text-xs text-destructive">
          {error}
        </div>
      )}

      <Plannotator
        comments={comments}
        document={document}
        canvases={canvases}
        selection={selection}
        onClearSelection={onClearSelection}
        onAddComment={onAddComment}
        onResolveComment={onResolveComment}
        onFocusTarget={onFocusTarget}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
