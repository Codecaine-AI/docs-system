"use client";

import { useCallback, useEffect, useState } from "react";

import type { DocOutlineSection } from "./outline-model";

/**
 * The docs prose grid is 14px at a 1.7 line-height (23.8px). Keep this
 * explicit, like prompt-kit does, so the spy and click landing use the same
 * stable geometry rather than a rounded layout measurement.
 */
const DOC_LINE_HEIGHT_PX = 24;

const defaultAnchorForSection = (section: DocOutlineSection) =>
  `[data-block-id="${section.blockId}"]`;

export interface UseOutlineSpyOptions {
  sections: DocOutlineSection[];
  /** Selector for the currently rendered document scroller. */
  scrollerSelector: string;
  /** Maps a section to its anchor inside the scroller. */
  anchorForSection?: (section: DocOutlineSection) => string;
}

export interface OutlineSpyResult {
  /** The section currently nearest the top of the document viewport. */
  activeBlockId: string | null;
  /** Smoothly scroll an outlined block to one document line below the top. */
  scrollToSection: (blockId: string) => void;
}

/**
 * Tracks an outline against the document's own scroll surface. Rects are
 * intentional here: block anchors can be nested in positioned renderers, so
 * their offset values are not comparable with the scroller's offset space.
 */
export function useOutlineSpy({
  sections,
  scrollerSelector,
  anchorForSection = defaultAnchorForSection,
}: UseOutlineSpyOptions): OutlineSpyResult {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const scroller = document.querySelector<HTMLElement>(scrollerSelector);
    if (!scroller || sections.length === 0) {
      setActiveBlockId(null);
      return;
    }

    const update = () => {
      // Two-line grace matches the prompt lab: a heading remains active until
      // its successor has meaningfully entered the document viewport.
      const threshold =
        scroller.getBoundingClientRect().top + DOC_LINE_HEIGHT_PX * 2;
      let active = sections[0]!.blockId;

      for (const section of sections) {
        const anchor = scroller.querySelector<HTMLElement>(
          anchorForSection(section),
        );
        if (anchor && anchor.getBoundingClientRect().top <= threshold) {
          active = section.blockId;
        }
      }

      // Fractional scrolling can leave the browser a hair short of the end.
      // In that state the final outline entry must win, even when its anchor
      // has not crossed the two-line threshold.
      if (
        scroller.scrollHeight > scroller.clientHeight &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      ) {
        active = sections[sections.length - 1]!.blockId;
      }

      setActiveBlockId((current) => (current === active ? current : active));
    };

    update();
    scroller.addEventListener("scroll", update, true);
    return () => scroller.removeEventListener("scroll", update, true);
  }, [anchorForSection, scrollerSelector, sections]);

  const scrollToSection = useCallback(
    (blockId: string) => {
      const section = sections.find((candidate) => candidate.blockId === blockId);
      if (!section || typeof document === "undefined") return;

      // Selection is immediate; do not wait for a smooth scroll to settle.
      setActiveBlockId(blockId);
      const scroller = document.querySelector<HTMLElement>(scrollerSelector);
      const anchor = scroller?.querySelector<HTMLElement>(
        anchorForSection(section),
      );
      if (!scroller || !anchor) return;

      const top =
        anchor.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        DOC_LINE_HEIGHT_PX;
      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        anchor.scrollIntoView?.({ block: "start", behavior: "smooth" });
      }
    },
    [anchorForSection, scrollerSelector, sections],
  );

  return { activeBlockId, scrollToSection };
}
