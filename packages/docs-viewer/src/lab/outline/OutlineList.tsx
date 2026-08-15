"use client";

import type { CSSProperties } from "react";

import type { DocOutlineSection } from "./outline-model";

export interface OutlineListProps {
  sections: DocOutlineSection[];
  /** The block id selected by the scroll spy, if an outline anchor is active. */
  activeBlockId: string | null;
  /** Navigates the document viewport to the selected heading. */
  scrollToSection: (blockId: string) => void;
}

/**
 * Presentational document outline. Anchor discovery and scrolling stay in
 * `useOutlineSpy`; keeping this component dumb lets the host choose its view.
 */
export function OutlineList({
  sections,
  activeBlockId,
  scrollToSection,
}: OutlineListProps) {
  return (
    <nav
      aria-label="Document outline"
      className="min-w-0 overflow-y-auto overscroll-contain py-2"
    >
      <ol className="m-0 list-none p-0">
        {sections.map((section) => {
          const active = section.blockId === activeBlockId;
          return (
            <li key={section.blockId}>
              <button
                type="button"
                aria-current={active ? "location" : undefined}
                data-block-id={section.blockId}
                onClick={() => scrollToSection(section.blockId)}
                className={[
                  "relative flex w-full min-w-0 items-center rounded-sm py-1.5 pe-3 text-left text-sm leading-5 transition-colors",
                  "[padding-inline-start:calc(0.75rem+var(--docs-outline-depth)*0.875rem)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--docs-outline-focus,var(--annotation-accent,currentColor))] focus-visible:ring-inset",
                  active
                    ? "bg-[color:var(--docs-outline-active-bg,var(--annotation-active-bg,transparent))] font-medium text-[color:var(--docs-outline-active-fg,var(--annotation-accent,currentColor))]"
                    : "text-[color:var(--docs-outline-fg,currentColor)] hover:bg-[color:var(--docs-outline-hover-bg,transparent)] hover:text-[color:var(--docs-outline-hover-fg,currentColor)]",
                ].join(" ")}
                style={
                  {
                    "--docs-outline-depth": section.depth,
                  } as CSSProperties
                }
                title={section.label}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 start-0 w-0.5 rounded-e bg-[color:var(--docs-outline-active-marker,var(--annotation-accent,currentColor))]"
                  />
                ) : null}
                <span className="min-w-0 truncate">{section.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
