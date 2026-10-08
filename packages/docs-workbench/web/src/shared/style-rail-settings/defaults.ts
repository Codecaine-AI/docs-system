import { dsNumber } from "../../theme/design-tokens";
import { normalizeSettings } from "./normalize";
import type { StyleRailSettings } from "./types";

export const DEFAULT_STYLE_RAIL_SETTINGS: StyleRailSettings = {
  accent: "blue",
  colors: { background: null, sidebar: null, text: null },
  typography: {
    bodyFont: "sans",
    headingFont: "sans",
    codeFont: "plex-mono",
    codePanels: "dark",
    numberFont: "body",
    // read-surface.css: var(--style-font-size / -line-height / -letter-spacing, var(--ds-*)).
    fontSize: dsNumber("font.size.reading", "px"),
    lineHeight: dsNumber("line-height.reading", ""),
    letterSpacing: dsNumber("letter-spacing.normal", "em"),
  },
  layout: {
    // The lanes: index.css and semantic.css read --ds-layout-lane-*.
    contentWidth: dsNumber("layout.lane.text", "ch"),
    codeWidth: dsNumber("layout.lane.code", "ch"),
    wideWidth: dsNumber("layout.lane.wide", "px"),
    // The page is left-anchored and full-width, so this is the global left
    // rail every block hangs off — generous by default rather than the tight
    // gutter a centered column wanted.
    contentMargin: 88,
    alignment: "left",
    centeredWidth: dsNumber("layout.lane.wide", "px"),
    // space.12: the centered column's minimum side margin.
    centeredMargin: dsNumber("space.12", "px"),
    // space.6: "page top and bottom padding".
    topPadding: dsNumber("space.6", "px"),
    titlePadding: dsNumber("space.5", "px"),
    bottomPadding: dsNumber("space.6", "px"),
    radius: dsNumber("radius.base", "px"),
    borderStrength: 1,
    backgroundTint: 0,
    sidebarTint: 0,
  },
  sidebar: {
    textColor: null,
    font: "sans",
    // Sidebar.tsx reads these knobs with the same design tokens as fallbacks.
    fontSize: dsNumber("font.size.ui-lg", "px"),
    padding: dsNumber("space.1", "px"),
    guides: true,
    guideColor: null,
    guideWidth: dsNumber("border.width.hairline", "px"),
    guideOpacity: 0.6,
  },
  grain: {
    enabled: true,
    opacity: 0.15,
    frequency: 0.8,
    contrast: 1.3,
    // auto = overlay on light (brightness-neutral texture around the paper
    // base), screen on dark — grain keeps working when the theme flips.
    blendMode: "auto",
    softening: { background: 1, font: 0.8, icons: 0.8 },
  },
  highlight: {
    color: null,
    radius: dsNumber("radius.base", "px"),
    padding: dsNumber("space.1", "px"),
    dragOpacity: 0.3,
    dropColor: null,
    dropWidth: dsNumber("border.width.rail", "px"),
    dropOpacity: 0.9,
    dropRadius: dsNumber("radius.base", "px"),
  },
  dragSelect: { color: null, opacity: 0.12 },
  list: {
    discSize: dsNumber("space.1-5", "px"),
    circleSize: dsNumber("space.1-5", "px"),
    circleThickness: dsNumber("border.width.ring", "px"),
    squareSize: 5,
    indent: dsNumber("space.6", "px"),
  },
  grip: {
    gap: dsNumber("space.3", "px"),
    offsetY: dsNumber("space.1-5", "px"),
    size: 18,
    color: null,
    fadeMs: dsNumber("motion.duration.fast", "ms"),
  },
  scrollbar: { width: 10, color: null, opacity: 1, padding: dsNumber("space.0", "px") },
  transition: { type: "fade", fadeOutMs: 80, fadeInMs: 120 },
  peek: {
    width: 48,
    durationMs: 300,
    // rem: semantic.css --docs-peek-padding is var(--ds-space-6), 24px at the 16px root.
    padding: dsNumber("space.6", "px") / 16,
    dividerColor: null,
    dividerWidth: dsNumber("border.width.hairline", "px"),
    dividerStyle: "solid",
  },
  reference: {
    color: null,
    underlineColor: null,
    iconSize: dsNumber("space.3", "px"),
    iconColor: null,
    iconGap: dsNumber("space.0-5", "px"),
    iconPosition: "before",
  },
  annotate: {
    accent: null,
    add: null,
    del: null,
    washOpacity: 0.08,
    actionPaneWidth: 520,
  },
  components: {},
  blockLayout: {},
};

/**
 * The repo BASELINE — the rail's second, repo-side reference point.
 *
 * Two reference points exist, and keeping them apart is the whole design:
 *
 *  - DEFAULT_STYLE_RAIL_SETTINGS is STOCK: the values theme/semantic.css
 *    already renders with no overlay at all. ONLY stock may decide whether
 *    styleRailVars emits a var or removes it, because "remove the override"
 *    literally means "let the stylesheet answer".
 *  - The BASELINE is what "default" MEANS in this repo: the `railDefaults`
 *    block of `themes/<id>/theme.json`, installed at boot by App.tsx. It is
 *    the reset target, the per-key fallback for a partial settings blob,
 *    and the reference the override dots compare against.
 *
 * The two are the same object until a repo theme loads, so nothing changes
 * for a repo that has never tuned anything. Once they diverge, a knob
 * sitting AT the repo baseline reads as "not overridden" in the UI while
 * still differing from stock — so styleRailVars keeps emitting it and the
 * tuned value actually reaches a locked serve or a static export. If the
 * baseline drove emission instead, every tuned value would collapse back
 * to the stylesheet's stock value on exactly the consumers that need it.
 */
let styleRailBaseline: StyleRailSettings = DEFAULT_STYLE_RAIL_SETTINGS;

export function getStyleRailBaseline(): StyleRailSettings {
  return styleRailBaseline;
}

/**
 * Installs the repo's saved rail settings as the baseline, returning the
 * normalized result. The raw blob is validated against STOCK rather than
 * against the current baseline, so the repo file always resolves from a
 * fixed floor — re-installing a theme can never compound its own clamped
 * values. A missing or empty blob leaves the baseline at stock, which is
 * exactly "this repo has not tuned anything yet".
 */
export function setStyleRailBaseline(raw: unknown): StyleRailSettings {
  styleRailBaseline =
    raw == null ? DEFAULT_STYLE_RAIL_SETTINGS : normalizeSettings(raw, DEFAULT_STYLE_RAIL_SETTINGS);
  return styleRailBaseline;
}

/** Drops the baseline back to stock — boot before any theme resolves, and test teardown. */
export function resetStyleRailBaseline(): void {
  styleRailBaseline = DEFAULT_STYLE_RAIL_SETTINGS;
}
