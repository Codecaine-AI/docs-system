import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { DocBlockSaveResult } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { ApiError, applyDocOps } from "../../data/api";
import type { BundleState } from "./types";
import { docSaveApiErrorMessage } from "./utils";

export function useDocSave({
  path,
  expectedHashRef,
  pathRef,
  fetchBundle,
  setBundle,
  setLastPatch,
  setUndoNotice
}: {
  path: string;
  expectedHashRef: RefObject<string | undefined>;
  pathRef: RefObject<string>;
  fetchBundle: (options?: { showLoading?: boolean }) => Promise<void>;
  setBundle: Dispatch<SetStateAction<BundleState | null>>;
  setLastPatch: Dispatch<SetStateAction<{ patchId: string; changedIds: string[] } | null>>;
  setUndoNotice: Dispatch<SetStateAction<string | null>>;
}) {
  // ---------------------------------------------------------------------
  // Edit-mode save loop
  // ---------------------------------------------------------------------

  const handleApplyOps = useCallback(
    async (ops: DocOp[]): Promise<DocBlockSaveResult> => {
      try {
        const response = await applyDocOps(path, ops, expectedHashRef.current);
        // A late response from an unmount flush must not clobber the state
        // (bundle, hash, undo ledger) of a doc we have since navigated to —
        // the save itself still landed server-side.
        if (pathRef.current === path) {
          expectedHashRef.current = response.hash;
          setBundle({ doc: response.doc, hash: response.hash });
          setLastPatch({
            patchId: response.patch_id,
            changedIds: ops
              .map((op) => ("blockId" in op ? op.blockId : undefined))
              .filter((id): id is string => !!id),
          });
          setUndoNotice(null);
        }
        // Returning the server doc lets DocEditor advance its diff baseline
        // to exactly the backend state AND (same object identity as the
        // `document` prop after setBundle) skip the cursor-resetting reseed.
        return { ok: true, doc: response.doc, normalization: response.normalization };
      } catch (saveError) {
        if (saveError instanceof ApiError && saveError.status === 409) {
          return { ok: false, stale: true, message: "Document changed elsewhere." };
        }
        if (saveError instanceof ApiError && saveError.status === 423) {
          return {
            ok: false,
            stale: false,
            message: "Another session holds the draft lock for this document.",
          };
        }
        return {
          ok: false,
          stale: false,
          message:
            saveError instanceof ApiError
              ? docSaveApiErrorMessage(saveError)
              : saveError instanceof Error
                ? saveError.message
                : "Failed to save document.",
        };
      }
    },
    [path],
  );

  const handleReloadDoc = useCallback(() => {
    void fetchBundle();
  }, [fetchBundle]);

  return { handleApplyOps, handleReloadDoc };
}
