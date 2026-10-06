"use client";

import type { CSSProperties, ReactNode } from "react";

/*
 * The trees-and-paths row system, shared by file-tree, file-explorer,
 * call-stack and component-tree: one panel with a family-tile head, one row
 * height, one 20px indent, continuous 1px guides drawn with borders, one diff
 * gutter (glyph + soft row tint), one aligned note column that wraps instead
 * of truncating, and one source column.
 *
 * The stylesheet reads only `--tr-*` variables plus the shared role tokens
 * (--docs-fam-tree-solid, --docs-ink, --docs-hover, --docs-focus-ring...).
 * Each block maps its own `--docs-<component>-*` knobs onto the `--tr-*`
 * variables on its root (see `treeVars`), so every block stays tunable on
 * its own. Every var() carries a literal fallback equal to its light (app
 * palette) default, and the stylesheet ships inline with the block, so a
 * static export renders without the workbench theme.
 */

export type TreeGuide = "pipe" | "blank" | "tee" | "end";
export type TreeChange = "added" | "removed" | "modified" | "renamed";

/** Gutter glyphs: the agent-view notation. */
export const TREE_CHANGE_GLYPH: Record<TreeChange, string> = {
  added: "+",
  removed: "−",
  modified: "~",
  renamed: ">",
};

/**
 * `tree`-style guides for one row: per ancestor below the root a pipe (that
 * ancestor has later siblings) or a blank, then this row's own elbow.
 */
export function elbowGuides(ancestorsLast: readonly boolean[], last: boolean): TreeGuide[] {
  if (ancestorsLast.length === 0) return [];
  return [
    ...ancestorsLast.slice(1).map((ancestorLast): TreeGuide => (ancestorLast ? "blank" : "pipe")),
    last ? "end" : "tee",
  ];
}

/** IDE-explorer guides: one continuous pipe under every ancestor's chevron. */
export function pipeGuides(depth: number): TreeGuide[] {
  return Array.from({ length: depth }, (): TreeGuide => "pipe");
}

/** Root style: custom properties are not in CSSProperties' key set. */
export function treeVars(vars: Record<`--tr-${string}`, string>): CSSProperties {
  return vars as CSSProperties;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** Tabler outline glyphs (MIT), the lab's icon set. */
export const TREE_ICONS = {
  folder: (
    <svg {...ICON_PROPS}>
      <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
    </svg>
  ),
  file: (
    <svg {...ICON_PROPS}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
    </svg>
  ),
  stack: (
    <svg {...ICON_PROPS}>
      <path d="M12 4l-8 4l8 4l8 -4l-8 -4" />
      <path d="M4 12l8 4l8 -4" />
      <path d="M4 16l8 4l8 -4" />
    </svg>
  ),
  components: (
    <svg {...ICON_PROPS}>
      <path d="M3 12l3 3l3 -3l-3 -3z" />
      <path d="M15 12l3 3l3 -3l-3 -3z" />
      <path d="M9 6l3 3l3 -3l-3 -3z" />
      <path d="M9 18l3 3l3 -3l-3 -3z" />
    </svg>
  ),
  chevronDown: (
    <svg {...ICON_PROPS}>
      <path d="M6 9l6 6l6 -6" />
    </svg>
  ),
  chevronRight: (
    <svg {...ICON_PROPS}>
      <path d="M9 6l6 6l-6 6" />
    </svg>
  ),
  chevronUp: (
    <svg {...ICON_PROPS}>
      <path d="M6 15l6 -6l6 6" />
    </svg>
  ),
} as const;

/** The panel head: family tile + one sentence-case title. */
export function TreeHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <figcaption className="docs-tree__head">
      <span className="docs-tree__tile" aria-hidden="true">
        {icon}
      </span>
      <span className="docs-tree__title">{title}</span>
    </figcaption>
  );
}

/** The guide strip for one row; hangs off the row so lines join row to row. */
export function TreeGuides({ guides }: { guides: readonly TreeGuide[] }) {
  if (guides.length === 0) return null;
  return (
    <span className="docs-tree__guides" aria-hidden="true">
      {guides.map((guide, index) => (
        <i key={index} data-g={guide} />
      ))}
    </span>
  );
}

/** The gutter cell: the change glyph (with its word for assistive tech), or empty. */
export function TreeMark({ change }: { change?: TreeChange }) {
  return (
    <span className="docs-tree__mark">
      {change ? (
        <>
          <span aria-hidden="true">{TREE_CHANGE_GLYPH[change]}</span>
          <span className="docs-tree__sr">{change}</span>
        </>
      ) : null}
    </span>
  );
}

/** The path cell's inline style: its depth drives the indent. */
export function depthStyle(depth: number): CSSProperties {
  return { "--depth": depth } as CSSProperties;
}

export function TreeStyle() {
  return <style>{TREE_ROWS_CSS}</style>;
}

/**
 * The guide strip's look, shared with every tree-shaped list (the
 * structured-reference field ledger draws its nested fields with it). The
 * host row is `position: relative`; the host sets --tr-x0 (strip start),
 * --tr-indent, --tr-guide-x, --tr-row (row height the elbow centres on) and
 * --tr-guide (line color).
 */
export const TREE_GUIDES_CSS = `/* guides: continuous 1px lines, drawn with borders */
.docs-tree__guides {
  position: absolute; top: 0; bottom: 0; left: var(--tr-x0);
  display: flex; pointer-events: none;
}
.docs-tree__guides > i { position: relative; flex: none; width: var(--tr-indent); }
.docs-tree__guides > i:is([data-g="pipe"], [data-g="tee"], [data-g="end"])::before {
  content: ""; position: absolute; top: 0; bottom: 0; left: var(--tr-guide-x);
  border-left: var(--ds-border-width-hairline) solid var(--tr-guide, color-mix(in srgb, #9b9a97 45%, #e6e5e3));
}
.docs-tree__guides > i[data-g="end"]::before { bottom: auto; height: calc(var(--tr-row, 28px) / 2); }
.docs-tree__guides > i:is([data-g="tee"], [data-g="end"])::after {
  content: ""; position: absolute; top: calc(var(--tr-row, 28px) / 2); left: var(--tr-guide-x);
  width: calc(var(--tr-indent) - var(--tr-guide-x) - 5px);
  border-top: var(--ds-border-width-hairline) solid var(--tr-guide, color-mix(in srgb, #9b9a97 45%, #e6e5e3));
}
`;

export const TREE_ROWS_CSS = `
.docs-tree {
  --tr-indent: var(--ds-space-5);
  --tr-guide-x: var(--ds-space-1-5);
  --tr-gutter: var(--ds-space-4);
  --tr-mono: var(--docs-font-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  --tr-sans: var(--docs-font-body, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
  margin: 0;
  /* shrink to content, cap at the lane: a short tree is a short panel, never
     stretched to the lane; past the lane the rows scroll (.docs-tree__rows) */
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--tr-bg, #f8f8f7);
  border: var(--tr-border-width, 1px) solid var(--tr-border, #e6e5e3);
  border-radius: var(--tr-radius, 2px);
  color: var(--tr-ink, #1f1f1f);
}
.docs-tree__head {
  display: flex; align-items: center; gap: var(--ds-space-2);
  min-height: var(--ds-space-8); padding: var(--ds-space-1-5) var(--tr-pad-x, 12px);
  box-sizing: border-box;
  border-bottom: var(--tr-border-width, 1px) solid var(--docs-rule-soft, #efeeec);
}
.docs-tree__tile {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--ds-space-4); height: var(--ds-space-4); border-radius: var(--ds-radius-base);
  background: var(--docs-fam-tree-solid, #0f7b6c);
  color: var(--docs-tile-glyph, #ffffff);
}
.docs-tree__tile svg { display: block; width: 11px; height: 11px; stroke-width: 2.25; }
.docs-tree__title {
  min-width: 0; overflow-wrap: anywhere;
  font: var(--ds-font-weight-semibold) var(--ds-font-size-ui-md) / var(--ds-line-height-tight) var(--tr-sans);
  color: var(--docs-ink, #1f1f1f);
}

/* rows: one grid, so notes and sources align in one column each */
.docs-tree__rows {
  --tr-x0: var(--tr-pad-x, 12px);
  display: grid;
  grid-template-columns: [pad] var(--tr-pad-x, 12px) [path] max-content [note] minmax(160px, 1fr) [src] max-content [end] var(--tr-pad-x, 12px);
  padding: var(--tr-pad-y, 8px) 0;
  overflow-x: auto;
}
.docs-tree__rows[data-diff] {
  --tr-x0: calc(var(--tr-pad-x, 12px) + var(--tr-gutter));
  grid-template-columns: [pad] var(--tr-pad-x, 12px) [mark] var(--tr-gutter) [path] max-content [note] minmax(160px, 1fr) [src] max-content [end] var(--tr-pad-x, 12px);
}
.docs-tree__row {
  position: relative;
  display: grid; grid-column: 1 / -1; grid-template-columns: subgrid;
  align-items: baseline;
  min-height: var(--tr-row, 28px);
  white-space: nowrap;
}
.docs-tree__empty {
  grid-column: path / end;
  font: var(--ds-font-weight-regular) var(--tr-text-size, 13px) / var(--tr-row, 28px) var(--tr-mono);
  color: var(--tr-muted, #666562);
}

/* gutter: the change glyph, nothing else */
.docs-tree__mark {
  grid-column: mark;
  font: var(--ds-font-weight-medium) var(--tr-text-size, 13px) / var(--tr-row, 28px) var(--tr-mono);
  user-select: none;
}

/* path: indent + (twisty + icon) + name or code */
.docs-tree__path {
  grid-column: path;
  min-width: 0;
  padding-left: calc(var(--depth, 0) * var(--tr-indent));
  font: var(--ds-font-weight-regular) var(--tr-text-size, 13px) / var(--tr-row, 28px) var(--tr-mono);
  color: var(--tr-ink, #1f1f1f);
}
/* a row without a note runs into the note column, so the note column starts
   after the longest noted name, not the longest name */
.docs-tree__path--span { grid-column: path / src; }

${TREE_GUIDES_CSS}
/* names */
.docs-tree__name { color: var(--tr-file-fg, #1f1f1f); font-weight: var(--tr-file-weight, 400); }
.docs-tree__name[data-dir] { color: var(--tr-folder-fg, #1f1f1f); font-weight: var(--tr-folder-weight, 400); }
.docs-tree__sep { color: var(--tr-muted, #666562); font-weight: var(--ds-font-weight-regular); }
.docs-tree__from { color: var(--tr-muted, #666562); text-decoration: line-through; text-decoration-thickness: var(--ds-border-width-hairline); }
.docs-tree__arrow { margin: 0 0.5ch; color: var(--tr-muted, #666562); }

/* diff: glyph + soft tint; a changed file name takes its diff color */
.docs-tree__row[data-change="added"] { --tr-chg: var(--tr-added-fg, #26744f); --tr-chg-name: var(--tr-added-name, var(--tr-chg)); background: var(--tr-added-bg, color-mix(in srgb, #287c55 8%, #f8f8f7)); }
.docs-tree__row[data-change="removed"] { --tr-chg: var(--tr-removed-fg, #c62121); --tr-chg-name: var(--tr-removed-name, var(--tr-chg)); background: var(--tr-removed-bg, color-mix(in srgb, #e03e3e 8%, #f8f8f7)); }
.docs-tree__row[data-change="modified"] { --tr-chg: var(--tr-modified-fg, #805f01); --tr-chg-name: var(--tr-modified-name, var(--tr-chg)); background: var(--tr-modified-bg, color-mix(in srgb, #dfab01 9%, #f8f8f7)); }
.docs-tree__row[data-change="renamed"] { --tr-chg: var(--tr-renamed-fg, var(--tr-modified-fg, #805f01)); --tr-chg-name: var(--tr-renamed-name, var(--tr-chg)); background: var(--tr-renamed-bg, var(--tr-modified-bg, color-mix(in srgb, #dfab01 9%, #f8f8f7))); }
.docs-tree__row[data-change] > .docs-tree__mark { color: var(--tr-chg); }
.docs-tree__row[data-change] .docs-tree__name { color: var(--tr-chg-name); }
.docs-tree__row[data-change="removed"] .docs-tree__name { text-decoration: line-through; text-decoration-thickness: var(--ds-border-width-hairline); }
.docs-tree__row[data-change="removed"] .docs-tree__code,
.docs-tree__row[data-change="removed"] .docs-tree__code * {
  color: var(--tr-muted, #666562);
  text-decoration: line-through; text-decoration-thickness: var(--ds-border-width-hairline);
}

/* notes: one aligned, muted, sans column; they wrap at a 60ch prose measure, never truncate */
.docs-tree__note {
  grid-column: note;
  min-width: 0;
  padding: 0 0 var(--ds-space-1) var(--ds-space-6);
  max-width: var(--ds-layout-lane-text);
  white-space: normal; overflow-wrap: break-word;
  font: var(--ds-font-weight-regular) var(--tr-note-size, 13.5px) / 1.55 var(--tr-sans);
  color: var(--tr-note-fg, #666562);
}

/* source: one mono column; muted until the row is hovered */
.docs-tree__src {
  grid-column: src;
  justify-self: start;
  margin-left: var(--ds-space-5);
  font: var(--ds-font-weight-regular) var(--tr-source-size, 12px) / var(--tr-row, 28px) var(--tr-mono);
  color: var(--tr-muted, #666562);
}
.docs-tree__row:hover > .docs-tree__src { color: var(--tr-ink, #1f1f1f); }

/* code rows (call-stack, component-tree): names colored by syntax role */
.docs-tree__code {
  font: inherit; white-space: pre;

  color: var(--tr-ink, #1f1f1f);
  background: none; border: 0; border-radius: 0; padding: 0;
}
/* operators read as typed: no ligature turns !== into one glyph (beats
   code.css's .docs-markdown code, which turns ligatures back on) */
.docs-tree .docs-tree__code { font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; }
/* syntax: every role reads the code theme's --syntax-* color (VS Code Dark+
   by default), the way the editor colors the same code. Identifiers and
   properties are variables; a call stack's callee is its one bold name; a
   branch's "?" and return/throw are control flow. */
.docs-tree__code { color: var(--tr-syn-var, #9cdcfe); }
.docs-tree__tok-prop { color: var(--tr-syn-var, #9cdcfe); }
:is(.docs-tree__tok-call, .docs-tree__tok-hook, .docs-tree__tok-callee) { color: var(--tr-syn-fn, #dcdcaa); }
.docs-tree__tok-callee { font-weight: var(--ds-font-weight-semibold); }
.docs-tree__tok-type { color: var(--tr-syn-type, #4ec9b0); }
.docs-tree__tok-tag { color: var(--tr-syn-tag, #569cd6); }
:is(.docs-tree__tok-keyword, .docs-tree__tok-brace) { color: var(--tr-syn-keyword, #569cd6); }
:is(.docs-tree__tok-control, .docs-tree__if) { color: var(--tr-syn-control, #c586c0); }
.docs-tree__tok-constant { color: var(--tr-syn-constant, #569cd6); }
.docs-tree__tok-string { color: var(--tr-syn-string, #ce9178); }
.docs-tree__tok-number { color: var(--tr-syn-number, #b5cea8); }
.docs-tree__tok-punct { color: var(--tr-syn-punct, #d4d4d4); }
.docs-tree__tok-tagpunct { color: var(--tr-syn-bracket, #808080); }
.docs-tree__if { margin-right: 1ch; }

/* hover: rows you can act on, and code rows (to follow a row to its source) */
.docs-tree__row:is([aria-expanded], [data-kind]):not([data-change]):hover { background: var(--docs-hover, color-mix(in srgb, #1f1f1f 6%, #f8f8f7)); }

/* file-explorer: twisty + icon ahead of the name */
.docs-tree__twisty, .docs-tree__icon {
  display: inline-flex; align-items: center; justify-content: center;
  vertical-align: middle; position: relative; top: -1px;
  color: var(--tr-muted, #666562);
}
.docs-tree__twisty { width: var(--ds-space-3); height: var(--ds-space-3); }
.docs-tree__twisty svg { width: var(--ds-space-3); height: var(--ds-space-3); stroke-width: 2; }
.docs-tree__icon { width: 15px; height: 15px; margin: 0 var(--ds-space-2) 0 var(--ds-space-1); }
.docs-tree__icon svg { width: 15px; height: 15px; stroke-width: 1.75; }

/* keyboard: folder rows and the fold are controls */
.docs-tree__row[aria-expanded] { cursor: pointer; }
.docs-tree__row[aria-expanded]:focus-visible,
.docs-tree__more:focus-visible {
  outline: var(--ds-border-width-focus) solid var(--docs-focus-ring, #0078df);
  outline-offset: calc(-1 * var(--ds-border-width-focus));
}

/* fold: one quiet row, its chevron in the depth-0 twisty column */
.docs-tree__more {
  display: flex; align-items: center;
  gap: calc(var(--ds-space-1) + 15px + var(--ds-space-2));
  box-sizing: border-box; width: 100%; height: var(--tr-row, 28px);
  margin: 0; padding: 0 var(--tr-pad-x, 12px);
  border: 0; border-top: var(--tr-border-width, 1px) solid var(--docs-rule-soft, #efeeec);
  background: transparent;
  font: var(--ds-font-weight-regular) var(--ds-font-size-ui-xs) / 1 var(--tr-mono);
  color: var(--tr-muted, #666562);
  cursor: pointer;
}
.docs-tree__more[data-diff] { padding-left: calc(var(--tr-pad-x, 12px) + var(--tr-gutter)); }
.docs-tree__more:hover { background: var(--docs-hover, color-mix(in srgb, #1f1f1f 6%, #f8f8f7)); color: var(--tr-ink, #1f1f1f); }
.docs-tree__more svg { width: var(--ds-space-3); height: var(--ds-space-3); stroke-width: 2; flex: none; }

.docs-tree__sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
`;
