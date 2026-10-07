import { Sparkles, Undo2Icon } from "lucide-react";
import type { DocEditorSaveState } from "@codecaine-ai/docs-viewer/editor/doc-editor";
import type { WorkbenchMode } from "../../types";

export type PageActionsProps = {
 mode: WorkbenchMode; saveState: DocEditorSaveState; undoNotice: string | null;
 lastPatch: { patchId: string; changedIds: string[] } | null; isUndoing: boolean;
 handleUndo: () => Promise<void>; labPanelHidden: boolean; sidePeekOpen: boolean;
 labPanelVisible: boolean; handleModeChange: (next: WorkbenchMode) => void;
};

export function PageActions({ mode, saveState, undoNotice, lastPatch, isUndoing, handleUndo, labPanelHidden, sidePeekOpen, labPanelVisible, handleModeChange }: PageActionsProps) {
 return (
          <>
            {mode === "edit" && (
              <span
                data-docs-save-state={saveState}
                className="whitespace-nowrap text-ui-xs text-muted-foreground"
                aria-live="polite"
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved"
                    : "Not saved"}
              </span>
            )}
            {undoNotice && (
              <span data-docs-undo-notice="" className="whitespace-nowrap text-ui-xs text-muted-foreground">
                {undoNotice}
              </span>
            )}
            {lastPatch && (
              <button
                type="button"
                data-docs-undo=""
                disabled={isUndoing}
                onClick={() => void handleUndo()}
                className="ds-shell-button"
              >
                <Undo2Icon aria-hidden="true" />
                {isUndoing ? "Undoing..." : "Undo last save"}
              </button>
            )}
            <button
              type="button"
              data-docs-lab-toggle=""
              aria-label={labPanelHidden ? "Show AI panel" : "Hide AI panel"}
              title={sidePeekOpen ? "Close the document preview to use the AI panel" : labPanelHidden ? "Show AI panel" : "Hide AI panel"}
              aria-expanded={labPanelVisible}
              aria-pressed={labPanelVisible}
              disabled={sidePeekOpen}
              onClick={() => handleModeChange(labPanelHidden ? "annotate" : "edit")}
              className="ds-shell-icon-button"
            >
              <Sparkles aria-hidden="true" />
            </button>
          </>
 );
}
