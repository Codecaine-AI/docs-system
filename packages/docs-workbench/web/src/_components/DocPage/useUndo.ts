import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useEffect } from "react";
import { undoPatch } from "../../data/api";

export function useUndo({
  lastPatch,
  isUndoing,
  undoNotice,
  flash,
  fetchBundleRef,
  setIsUndoing,
  setUndoNotice,
  setLastPatch
}: {
  lastPatch: { patchId: string; changedIds: string[] } | null;
  isUndoing: boolean;
  undoNotice: string | null;
  flash: (ids: string[]) => void;
  fetchBundleRef: RefObject<(options?: { showLoading?: boolean }) => Promise<void>>;
  setIsUndoing: Dispatch<SetStateAction<boolean>>;
  setUndoNotice: Dispatch<SetStateAction<string | null>>;
  setLastPatch: Dispatch<SetStateAction<{ patchId: string; changedIds: string[] } | null>>;
}) {
  // ---------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------

  const handleUndo = useCallback(async () => {
    if (!lastPatch || isUndoing) return;
    setIsUndoing(true);
    setUndoNotice(null);
    try {
      const result = await undoPatch(lastPatch.patchId);
      if (result.ok) {
        setUndoNotice("Undo applied.");
        flash(lastPatch.changedIds);
        void fetchBundleRef.current();
      } else {
        setUndoNotice(result.alreadyUndone ? "Already undone." : result.detail);
      }
    } finally {
      // Single-use either way: success consumed it, 404 means it was
      // already consumed, other failures keep the server authoritative.
      setLastPatch(null);
      setIsUndoing(false);
    }
  }, [lastPatch, isUndoing, flash]);

  useEffect(() => {
    if (!undoNotice) return;
    const timer = setTimeout(() => setUndoNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [undoNotice]);

  return { handleUndo };
}
