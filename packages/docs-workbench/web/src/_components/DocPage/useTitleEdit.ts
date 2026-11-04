import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { setDocTitle } from "../../data/api";

/**
 * Commits an edit of the page H1 as doc.json's title. The bundle folder, and
 * so the URL, keeps its name. Enter or blur commits, Escape reverts, and a
 * failed save restores the title the page loaded.
 */
export function useTitleEdit({
  path,
  title,
  titleRef,
  revertTitleRef,
  expectedHashRef,
  fetchBundle,
  setPaneError,
}: {
  path: string;
  title: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  revertTitleRef: RefObject<boolean>;
  expectedHashRef: { current: string | undefined };
  fetchBundle: () => Promise<void>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
}) {
  const commitTitleEdit = useCallback(async () => {
    const el = titleRef.current;
    if (!el) return;
    if (revertTitleRef.current) {
      revertTitleRef.current = false;
      el.textContent = title;
      return;
    }
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const hash = expectedHashRef.current;
    if (!next || next === title || !hash) {
      el.textContent = title;
      return;
    }
    try {
      await setDocTitle(path, next, hash);
      await fetchBundle();
    } catch (error) {
      el.textContent = title;
      setPaneError(error instanceof Error ? `Title change failed: ${error.message}` : "Title change failed");
    }
  }, [path, title, fetchBundle]);

  return { commitTitleEdit };
}
