import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocEditorSaveState } from "@codecaine-ai/docs-viewer/editor/doc-editor";
import { projectStorage } from "../../data/project-storage";
import type { WorkbenchMode } from "./types";

export function useModeChange({ setLabPanelHidden, setSelection, setPaneError, setSaveState }: { setLabPanelHidden: Dispatch<SetStateAction<boolean>>; setSelection: Dispatch<SetStateAction<PlannotatorSelection | null>>; setPaneError: Dispatch<SetStateAction<string | null>>; setSaveState: Dispatch<SetStateAction<DocEditorSaveState>> }) {
  const handleModeChange = useCallback((next: WorkbenchMode) => {
    const hidden = next !== "annotate";
    setLabPanelHidden(hidden);
    try {
      projectStorage.setItem("docs-lab-panel-hidden", String(hidden));
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
    if (next !== "annotate") setSelection(null);
    setPaneError(null);
    // Leaving edit mode unmounts DocEditor (its unmount flush saves any
    // pending edits); entering it mounts a clean editor that re-reports.
    // Either way the stale indicator value must not linger.
    setSaveState("saved");
  }, []);
 return { handleModeChange };
}
