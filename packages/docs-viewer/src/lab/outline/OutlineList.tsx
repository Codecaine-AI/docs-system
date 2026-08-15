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
              {/* Prompt-kit outline scale (Ford: brief view, not detailed):
                  11px rows, active = left accent bar + foreground text only —
                  never a full-row highlight. Mirrors zones.tsx
                  PanelOutlineList in the prompt lab. */}
              <button
                type="button"
                aria-current={active ? "location" : undefined}
                data-block-id={section.blockId}
                onClick={() => scrollToSection(section.blockId)}
                className={[
                  "flex w-full min-w-0 items-center border-l py-px pr-2 text-left text-[11px] leading-[1.9] transition-colors",
                  "[padding-inline-start:calc(0.75rem+var(--docs-outline-depth)*0.75rem)]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--docs-outline-focus,var(--annotation-accent,currentColor))] focus-visible:ring-inset",
                  active
                    ? "text-[color:var(--docs-outline-active-fg,var(--foreground,currentColor))]"
                    : "border-transparent text-[color:var(--docs-outline-fg,var(--muted-foreground,currentColor))] hover:text-[color:var(--docs-outline-hover-fg,var(--foreground,currentColor))]",
                ].join(" ")}
                style={
                  {
                    "--docs-outline-depth": section.depth,
                    ...(active
                      ? {
                          borderLeftColor:
                            "var(--docs-outline-active-marker, var(--annotation-accent, currentColor))",
                        }
                      : {}),
                  } as CSSProperties
                }
                title={section.label}
              >
                <span className="min-w-0 truncate">{section.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
