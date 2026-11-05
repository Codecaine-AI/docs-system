import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { setDocTitle } from "../../data/api";

/**
 * Commits an edit of the page H1 as doc.json's title. The bundle folder, and
 * so the URL, keeps its name. Enter or blur commits, Escape reverts, and a
 * failed save restores the title the page loaded. While the body editor holds
 * unsaved edits, the title stays as loaded: the refresh after a title save
 * would reseed the editor over the draft.
 */
export function useTitleEdit({
  path,
  title,
  titleRef,
  revertTitleRef,
  expectedHashRef,
  fetchBundle,
  setPaneError,
  liveStateRef,
}: {
  path: string;
  title: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  revertTitleRef: RefObject<boolean>;
  expectedHashRef: { current: string | undefined };
  fetchBundle: () => Promise<void>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
  liveStateRef: { current: { mode: string; saveState: string } };
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
    const live = liveStateRef.current;
    if (live.mode === "edit" && live.saveState !== "saved") {
      el.textContent = title;
      setPaneError("Title not saved: the page has unsaved edits. Edit the title again after they save.");
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
