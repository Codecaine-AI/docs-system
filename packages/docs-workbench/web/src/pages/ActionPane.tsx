import Plannotator, { type PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type {
  AnnotationIntent,
  AnnotationTarget,
  DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";

/**
 * Annotate-mode side pane (the standalone counterpart of Spectre's
 * DocsActionPane annotations tab): a header with the open-annotation count,
 * a selection hint, and Plannotator (composer + grouped annotation list with
 * resolve + dangling-target handling). All mutation wiring lives in DocPage.
 */
export function ActionPane({
  annotations,
  document,
  canvases,
  selection,
  onClearSelection,
  onAddAnnotation,
  onResolveAnnotation,
  onFocusTarget,
  isSubmitting,
  error,
}: {
  annotations: DocAnnotation[];
  document: DocDocument | null;
  canvases?: Record<
    string,
    { objectIds: ReadonlySet<string>; connectionIds: ReadonlySet<string> }
  > | null;
  selection: PlannotatorSelection | null;
  onClearSelection: () => void;
  onAddAnnotation: (input: {
    target: AnnotationTarget;
    body: string;
    intent: AnnotationIntent;
  }) => Promise<void>;
  onResolveAnnotation: (annotationId: string) => Promise<void>;
  onFocusTarget: (target: AnnotationTarget) => void;
  isSubmitting?: boolean;
  error?: string | null;
}) {
  const openCount = annotations.filter((annotation) => annotation.status === "open").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Annotations
        </h2>
        {openCount > 0 && (
          <span
            data-docs-open-annotation-count=""
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {openCount} open
          </span>
        )}
      </div>

      {!selection && (
        <p className="text-xs text-muted-foreground">
          Click a block in the document (or an object on an embedded canvas) to annotate it.
        </p>
      )}

      {error && (
        <div data-docs-pane-error="" className="text-xs text-destructive">
          {error}
        </div>
      )}

      <Plannotator
        annotations={annotations}
        document={document}
        canvases={canvases}
        selection={selection}
        onClearSelection={onClearSelection}
        onAddAnnotation={onAddAnnotation}
        onResolveAnnotation={onResolveAnnotation}
        onFocusTarget={onFocusTarget}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
