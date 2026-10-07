import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { moveDoc } from "../../data/api";
import { docSegmentFromTitle, docTitleFromPath } from "../../shared/doc-title";

export function useTitleRename({
  path,
  titleRef,
  revertTitleRef,
  onDocMoved,
  setPaneError
}: {
  path: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  revertTitleRef: RefObject<boolean>;
  onDocMoved?: (newPath: string) => void;
  setPaneError: Dispatch<SetStateAction<string | null>>;
}) {
  // Page-title rename (R2-D12): committing an edited title re-slugs the
  // bundle folder name (numeric prefix kept) and moves the bundle through
  // the server — inbound references rewrite there; the host navigates and
  // refreshes the sidebar via onDocMoved.
  const commitTitleEdit = useCallback(async () => {
    const el = titleRef.current;
    if (!el) return;
    const current = docTitleFromPath(path);
    if (revertTitleRef.current) {
      revertTitleRef.current = false;
      el.textContent = current;
      return;
    }
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!next || next === current) {
      el.textContent = current;
      return;
    }
    const segments = path.replace(/\/+$/, "").split("/");
    const segment = segments.pop() ?? "";
    const newSegment = docSegmentFromTitle(next, segment);
    if (!newSegment || newSegment === segment) {
      el.textContent = current;
      return;
    }
    const newPath = [...segments, newSegment].join("/");
    try {
      await moveDoc(path, newPath);
      onDocMoved?.(newPath);
    } catch (error) {
      el.textContent = current;
      setPaneError(
        error instanceof Error ? `Rename failed: ${error.message}` : "Rename failed",
      );
    }
  }, [path, onDocMoved]);

  return { commitTitleEdit };
}
