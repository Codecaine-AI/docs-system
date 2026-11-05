import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { setDocTitle } from "../../data/api";

const BODY_SAVE_WAIT_MS = 15_000;

/**
 * Commits an edit of the page H1 as doc.json's title. The bundle folder, and
 * so the URL, keeps its name. Enter or blur commits, Escape reverts, and a
 * failed save restores the title the page loaded.
 *
 * A pending body edit saves first: the title write needs the saved hash, and a
 * refresh over a draft would reseed the editor. When body edits start while
 * the title write runs, the page skips the refresh. It takes the new hash only
 * when the body on disk is still the editor's, so the next body save lands on
 * the titled doc and an outside edit still meets the 409 conflict path.
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
  fetchBundle: (options?: { keepDraft?: boolean; submittedTitle?: string }) => Promise<void>;
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
    if (!next || next === title) {
      el.textContent = title;
      return;
    }
    const bodySaved = () => liveStateRef.current.mode !== "edit" || liveStateRef.current.saveState === "saved";
    for (let waited = 0; !bodySaved(); waited += 100) {
      if (waited >= BODY_SAVE_WAIT_MS || liveStateRef.current.saveState === "error") {
        el.textContent = title;
        setPaneError("Title change failed: the page body did not save.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const hash = expectedHashRef.current;
    if (!hash) {
      el.textContent = title;
      return;
    }
    try {
      await setDocTitle(path, next, hash);
      await fetchBundle({ keepDraft: true, submittedTitle: next });
    } catch (error) {
      el.textContent = title;
      setPaneError(error instanceof Error ? `Title change failed: ${error.message}` : "Title change failed");
    }
  }, [path, title, fetchBundle]);

  return { commitTitleEdit };
}
