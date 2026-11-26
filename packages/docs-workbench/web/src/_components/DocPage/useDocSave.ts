import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";
import type { DocBlockSaveResult } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { ApiError, applyDocOps } from "../../data/api";
import type { BundleState } from "./types";
import { docSaveApiErrorMessage } from "./utils";

/** How long a save waits for the first page load to set the page hash. */
const HASH_WAIT_MS = 10_000;

/** Resolves the page hash once the first page load has set it, or undefined after the wait. */
async function waitForHash(ref: RefObject<string | undefined>): Promise<string | undefined> {
  const deadline = Date.now() + HASH_WAIT_MS;
  while (ref.current === undefined && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return ref.current;
}

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
        // Every page write carries the hash it read. A save never goes out without one.
        const expectedHash = await waitForHash(expectedHashRef);
        if (expectedHash === undefined) {
          return { ok: false, stale: false, message: "The page has not loaded yet. Your edits are kept." };
        }
        const response = await applyDocOps(path, ops, expectedHash);
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
        // 409: the page changed after the read. 428: the server needs a hash.
        // Both keep the draft and pause auto-save until the user reloads.
        if (saveError instanceof ApiError && (saveError.status === 409 || saveError.status === 428)) {
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
