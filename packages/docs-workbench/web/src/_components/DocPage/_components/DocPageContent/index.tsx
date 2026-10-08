import type { ComponentProps, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer, { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import DocEditor from "@codecaine-ai/docs-viewer/editor/doc-editor";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { useTargeting } from "@codecaine-ai/annotations/react";
import { AliasChip } from "@codecaine-ai/docs-viewer/lab";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import type { BacklinkRow } from "../../../../data/api";
import type { WorkbenchMode } from "../../types";
import { ANNOTATE_CURSOR_CSS } from "../../constants";
import type { DocLabSessionResult } from "../../lab";
import { PageTitle } from "./_components/PageTitle";
import { Backlinks } from "./_components/Backlinks";

export type DocPageContentProps = {
  isLoading: boolean;
  path: string;
  error: string | null;
  doc: DocDocument | null;
  mode: WorkbenchMode;
  canvasEpoch: number;
  contentRef: RefObject<HTMLDivElement | null>;
  labPanelVisible: boolean;
  labPanelWidth: number;
  titleRef: RefObject<HTMLHeadingElement | null>;
  isStatic: boolean;
  revertTitleRef: RefObject<boolean>;
  commitTitleEdit: () => Promise<void>;
  resolveAssetSrc: ComponentProps<typeof DocEditor>["resolveAssetSrc"];
  renderEditorCanvas: ComponentProps<typeof DocEditor>["renderCanvas"];
  renderEditorSequence: ComponentProps<typeof DocEditor>["renderSequence"];
  handleUploadAsset: ComponentProps<typeof DocEditor>["uploadAsset"];
  handleApplyOps: ComponentProps<typeof DocEditor>["onApplyOps"];
  handleReloadDoc: ComponentProps<typeof DocEditor>["onReloadDoc"];
  onEditorReady: ComponentProps<typeof DocEditor>["onEditorReady"];
  autoSaveDelayMs: number | undefined;
  setSaveState: ComponentProps<typeof DocEditor>["onSaveStateChange"];
  highlightedIds: ComponentProps<typeof DocEditor>["changedBlockIds"];
  annotateContainerRef: RefObject<HTMLDivElement | null>;
  targeting: ReturnType<typeof useTargeting<PlannotatorSelection>>;
  selectionRef: RefObject<PlannotatorSelection | null>;
  setSelection: Dispatch<SetStateAction<PlannotatorSelection | null>>;
  lab: DocLabSessionResult;
  aiDocumentFlow: ReactNode;
  labPanel: ReactNode;
  backlinks: BacklinkRow[];
  sidePeekOpen: boolean;
  /** Centered page column (layout.alignment = "centered" with no right-side panel open). */
  centered: boolean;
};

export function DocPageContent({
  isLoading,
  path,
  error,
  doc,
  mode,
  canvasEpoch,
  contentRef,
  labPanelVisible,
  labPanelWidth,
  titleRef,
  isStatic,
  revertTitleRef,
  commitTitleEdit,
  resolveAssetSrc,
  renderEditorCanvas,
  renderEditorSequence,
  handleUploadAsset,
  handleApplyOps,
  handleReloadDoc,
  onEditorReady,
  autoSaveDelayMs,
  setSaveState,
  highlightedIds,
  annotateContainerRef,
  targeting,
  selectionRef,
  setSelection,
  lab,
  aiDocumentFlow,
  labPanel,
  backlinks,
  sidePeekOpen,
  centered,
}: DocPageContentProps) {
  if (isLoading) {
    return <div className="p-8 text-ui-lg text-muted-foreground">Loading {path}...</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-ui-lg">
        <div className="font-medium text-destructive">Failed to load doc bundle</div>
        <div className="mt-1 text-muted-foreground">
          {path}: {error}
        </div>
      </div>
    );
  }
  if (!doc) return null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-docs-mode={mode}>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1">
          <div data-docs-scroller="" className="h-full min-h-0 overflow-y-auto">
            {/* Left-anchored FULL-WIDTH page. There is deliberately no
                `mx-auto max-w-…` column here any more: the page is the whole
                padded viewport and each BLOCK claims its own lane inside it
                (docs-viewer render/block-layout.ts). That way every
                left-justified block shares one left rail — the eye tracks
                straight down a single left edge — while a wide table or
                state-shape spends the extra room instead of bulging the whole
                page out around itself. `--style-content-width` still sizes the
                text lane, it just applies per block now, not to the column.

                The `88px` fallback MUST track the style rail's stock
                `layout.contentMargin` (StyleRail.tsx). A knob sitting at stock
                emits NO var — that is how "let the stylesheet answer" works —
                so this literal is what actually renders by default, and a
                mismatch here silently ignores the rail's stated default.
                `--docs-page-margin` is the shell's page margin (theme/app-shell.css): the content-margin knob above 800px, the shell's narrow padding at 800px and below. */}
            {/* Prompt-lab geometry: the content wrapper reserves the lab
                panel's footprint as RIGHT PADDING (inline, animated in step
                with the panel's width transition) while the scroller behind
                it spans the full region — so the scrollbar lives at the
                region's far right edge, past the floating panel. The inline
                paddingRight replaces the `px-` class's right half, so it must
                re-add the content margin itself. */}
            <div
              key={canvasEpoch}
              ref={contentRef}
              data-docs-content=""
              data-docs-lab-reserved={labPanelVisible ? "" : undefined}
              data-docs-annotation-wash={mode === "annotate" ? "" : undefined}
              data-docs-alignment={centered ? "centered" : "left"}
              className="w-full px-[var(--docs-page-margin,var(--style-content-margin,88px))] pt-[var(--style-content-top,var(--ds-space-6))] pb-[var(--style-content-bottom,var(--ds-space-6))]"
              style={
                centered
                  ? {
                      // Centered column: max-width is width + both margins
                      // (border-box), so the content box is exactly
                      // --style-centered-width; blocks stay left-justified
                      // inside it on one shared left edge.
                      maxWidth:
                        "calc(var(--style-centered-width, var(--ds-layout-lane-wide)) + 2 * var(--style-centered-margin, var(--ds-space-12)))",
                      marginInline: "auto",
                      paddingInline: "var(--style-centered-margin, var(--ds-space-12))",
                    }
                  : labPanelVisible
                  ? {
                      paddingRight: `calc(var(--docs-page-margin, var(--style-content-margin, 88px)) + ${labPanelWidth + 36}px)`,
                      transition:
                        "padding-right var(--ds-motion-duration-slow) var(--ds-motion-easing-emphasized)",
                    }
                  : undefined
              }
            >
            {/* Fixed page furniture, not a block: mirrors the sidebar name
                so page and tree read as one thing (R2-D11). Lives outside
                the editor/renderer, so it can't be selected or dragged.
                Click to rename (R2-D12): Enter/blur commits — the bundle
                folder re-slugs (numeric prefix kept) and the sidebar
                follows; Escape reverts. Keyed by path so a rename or
                navigation always remounts with clean text.

                The wrapper is the title's LANE: it gives the h1 the same text
                measure a paragraph block gets, so the title wraps on the same
                right edge as the prose beneath it. It carries the body
                font-size (`--style-font-size`, stock 18px) because the measure
                is expressed in `ch` and `ch` resolves against the font-size of
                the element the cap sits on — putting the cap straight on the
                2.25rem h1 would make `60ch` ~1300px instead of the ~650px an
                18px paragraph gets. The h1's own size is set in `rem`, so the
                wrapper's font-size never reaches it. */}
            <PageTitle path={path} titleRef={titleRef} isStatic={isStatic} revertTitleRef={revertTitleRef} commitTitleEdit={commitTitleEdit} />
            {isStatic ? (
              // Static-export degradation: no write routes, so no editor —
              // the plain read-only renderer.
              <div className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
                <DocBlockRenderer
                  document={doc}
                  projectId="local"
                  documentPath={`docs/${path}`}
                  bundlePath={path}
                  resolveAssetSrc={resolveAssetSrc}
                />
              </div>
            ) : mode === "edit" ? (
              <div className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
                <DocEditor
                  // Keyed by path so navigating away UNMOUNTS this instance
                  // while its onApplyOps still closes over the old path —
                  // the unmount flush must save the doc it was editing, not
                  // the doc being navigated to.
                  key={path}
                  document={doc}
                  projectId="local"
                  documentPath={path}
                  renderCanvas={renderEditorCanvas}
                  renderSequence={renderEditorSequence}
                  resolveAssetSrc={resolveAssetSrc}
                  uploadAsset={handleUploadAsset}
                  onApplyOps={handleApplyOps}
                  onReloadDoc={handleReloadDoc}
                  onEditorReady={onEditorReady}
                  autoSave
                  autoSaveDelayMs={autoSaveDelayMs}
                  onSaveStateChange={setSaveState}
                  changedBlockIds={highlightedIds}
                />
              </div>
            ) : (
              /* Shared targeting container: targeting overlays, staged
                 review regions, waiting threads, and the inline composer. */
              <div
                ref={(element) => {
                  annotateContainerRef.current = element;
                  targeting.containerRef.current = element;
                }}
                {...targeting.containerProps}
                // Escape closes the anchored composer and drops the pinned
                // target (the popover itself has no Escape handling).
                onKeyDown={(event) => {
                  if (event.key === "Escape" && selectionRef.current) {
                    event.stopPropagation();
                    setSelection(null);
                  }
                }}
                className={cn("relative", DOC_SURFACE_TYPOGRAPHY_CLASSES)}
              >
                {lab.staleProposals.length > 0 && (
                  <div
                    data-docs-stale-proposals=""
                    className="mb-3 space-y-1 rounded border p-2"
                  >
                    {lab.staleProposals.map((proposal) => {
                      const alias =
                        proposal.alias ??
                        lab.session.requests.find(
                          (request) => request.annotationId === proposal.annotationId,
                        )?.alias ??
                        proposal.id.slice(0, 8);
                      return (
                        <div
                          key={proposal.id}
                          data-docs-stale-proposal={alias}
                          className="flex items-center gap-2 text-ui-xs"
                        >
                          <AliasChip alias={alias} />
                          <span className="min-w-0 flex-1 truncate">
                            {proposal.summary}
                          </span>
                          <span
                            className="rounded border px-1 py-0.5 text-micro"
                            style={{
                              color: "var(--docs-annotation-del)",
                              background: "var(--docs-annotation-del-bg)",
                              borderColor: "var(--docs-annotation-del)",
                            }}
                          >
                            stale
                          </span>
                          <button
                            type="button"
                            aria-label={`Reject ${alias}`}
                            className="rounded border px-2 py-0.5"
                            onClick={() => void lab.session.onReject?.(alias)}
                          >
                            Reject
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {aiDocumentFlow}
                {targeting.overlays}
                <style>{ANNOTATE_CURSOR_CSS}</style>
              </div>
            )}

            <Backlinks isStatic={isStatic} mode={mode} backlinks={backlinks} />
          </div>
          </div>
          {!isStatic && !sidePeekOpen && (
            /* The GlassPanel positions absolutely (top-right) against this
               `relative` region and floats over the padding the content
               wrapper reserves (paddingRight above = panel width + 24px
               right gutter + 12px breathing gap). Content is pushed left of
               the panel — no overlap — while the scroller underneath keeps
               the full region width. */
            labPanel
          )}
        </div>
      </div>
    </div>
  );
}
