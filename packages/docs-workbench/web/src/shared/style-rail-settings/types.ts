/**
 * Style rail settings, pure half: the settings shape, stock defaults, the
 * repo baseline, normalization, and the settings -> CSS translation
 * (styleRailVars and the managed-<style> CSS text). No DOM, React, or storage
 * access, so a build-time consumer (docs-publish's static theme head) runs
 * the same code the workbench applies at runtime. StyleRail.tsx re-exports
 * everything here and owns the browser side (storage, applying to <html>).
 */

export type AccentFamily =
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "brown"
  | "gray";

export type FontChoice = "sans" | "serif" | "mono";
/**
 * Code surfaces also offer IBM Plex Mono, the stock code face. A saved
 * "fira-code" (the old stock) is read as "plex-mono" (RETIRED_CODE_FONTS).
 */
export type CodeFontChoice = FontChoice | "plex-mono";
/**
 * How code panels (code blocks, and the code panes inside state shapes and
 * interaction surfaces) take the theme: "dark" renders them as dark panels
 * on every page, light included; "page" follows the page's light/dark mode.
 * The blocks around those panes always follow the page.
 */
export type CodePanelMode = "dark" | "page";
/** Page alignment: left-anchored (stock) or one centered column. */
export type PageAlignment = "left" | "centered";
/** "body" = follow the body font (no independent override). */
export type NumberFontChoice = FontChoice | "body";
/** Border style for the side-peek divider — --docs-peek-divider-style. */
export type PeekDividerStyle = "solid" | "dashed" | "dotted" | "double";
/** Placement of the file icon relative to a reference label. */
export type ReferenceIconPosition = "before" | "after";
/** auto resolves to overlay in light mode and screen in dark mode. */
export type GrainBlendMode = "auto" | "multiply" | "screen" | "overlay" | "normal";

/**
 * PER-BLOCK-TYPE LAYOUT OVERRIDES.
 *
 * docs-viewer's block-layout.ts owns the CODE default for every block type's
 * lane (width + horizontal placement). These knobs sit on top of it: a block
 * type listed in `blockLayout` overrides the code default, a block type that
 * is absent inherits it. Only the fields present on an entry override —
 * `{ justify: "center" }` recenters a block type while leaving its declared
 * width alone.
 *
 * The named widths mirror the lane vocabulary; the `<n>px` form is the
 * custom-width escape hatch for a block type that fits neither named lane.
 */
export type BlockLayoutWidth = "text" | "code" | "wide" | "full";
export type BlockLayoutJustify = "left" | "center";
export type BlockLayoutOverride = {
  width?: BlockLayoutWidth | `${number}px`;
  justify?: BlockLayoutJustify;
  /**
   * Two-pane split, as the LEFT pane's percentage of the block's width.
   * Only the two-pane block types read it (state-shape, interaction-surface):
   * it lands as `--docs-pane-split` on the lane, which those components' grid
   * templates consume. A long JSON example needs more room than a fixed
   * ratio can guess, so the split is the knob rather than the ratio.
   */
  columnSplit?: number;
};

export type StyleRailSettings = {
  accent: AccentFamily;
  /** Explicit color overrides; null = follow the theme tokens. */
  colors: {
    background: string | null;
    sidebar: string | null;
    text: string | null;
  };
  typography: {
    bodyFont: FontChoice;
    headingFont: FontChoice;
    /** Font for code surfaces (code blocks, inline code chips) — --docs-font-code. */
    codeFont: CodeFontChoice;
    /** Code panel theming — the `data-code-panels` attribute on <html>. */
    codePanels: CodePanelMode;
    /** Font for numeric UI (including ordered list counters) — --docs-font-numeric; "body" inherits. */
    numberFont: NumberFontChoice;
    /** Content body size in px. */
    fontSize: number;
    lineHeight: number;
    /** Content letter-spacing in em. */
    letterSpacing: number;
  };
  layout: {
    /** Content column max-width in ch. */
    contentWidth: number;
    /**
     * Code-lane max-width in ch — the measure mono blocks (code, pseudocode,
     * file trees, file explorers) cap at: wider than prose, far narrower
     * than the data-grid wide lane.
     */
    codeWidth: number;
    /**
     * Wide-lane max-width in px — the escape hatch data-heavy blocks
     * (state shapes, interaction surfaces, structured tables, process
     * outlines) break out to when the reading column is too narrow.
     * Sized in px, not ch, because those blocks are grids, not prose.
     */
    wideWidth: number;
    /** Content column horizontal padding in px (the left rail in left alignment). */
    contentMargin: number;
    /**
     * Page alignment. "left" anchors the page at contentMargin (stock).
     * "centered" centers one column of centeredWidth whenever no right-side
     * panel (lab panel, side peek) is open; blocks stay left-justified inside
     * it, so they share one left edge.
     */
    alignment: PageAlignment;
    /** Centered column content width in px (the column adds centeredMargin on each side). */
    centeredWidth: number;
    /** Minimum side margin in px around the centered column. */
    centeredMargin: number;
    /** Space above the doc's first block in px. */
    topPadding: number;
    /** Space between the fixed page title and the first block, in px. */
    titlePadding: number;
    /** Space below the doc's last block in px. */
    bottomPadding: number;
    /** --radius in px (theme default 2px). */
    radius: number;
    /** Border alpha/contrast multiplier; 1 = theme default. */
    borderStrength: number;
    /** % of the accent family's bg mixed into the page background. */
    backgroundTint: number;
    /** % of gray mixed into the sidebar surface. */
    sidebarTint: number;
  };
  sidebar: {
    /** Nav text color; null = theme foreground. */
    textColor: string | null;
    /** Nav font family. */
    font: FontChoice;
    /** Nav text size in px. */
    fontSize: number;
    /** Row vertical padding in px. */
    padding: number;
    /** Whether expanded tree groups show vertical indent guides. */
    guides: boolean;
    /** Indent guide color; null = theme border. */
    guideColor: string | null;
    /** Indent guide thickness in px. */
    guideWidth: number;
    /** Indent guide opacity (0-1). */
    guideOpacity: number;
  };
  grain: {
    enabled: boolean;
    opacity: number;
    /** SVG feTurbulence baseFrequency. */
    frequency: number;
    contrast: number;
    blendMode: GrainBlendMode;
    softening: {
      /** Scales grain opacity. */
      background: number;
      /** Drives a faint text-shadow glow. */
      font: number;
      /** Drives icon blur/glow/opacity. */
      icons: number;
    };
  };
  highlight: {
    /** Block highlight fill (changed-flash + node selection); null = theme blue. */
    color: string | null;
    /** Highlight corner rounding in px. */
    radius: number;
    /** Highlight breathing room in px — same-color shadow spread, so the block never shifts layout. */
    padding: number;
    /** Opacity of the held block WHILE dragging (Notion-style ghost). */
    dragOpacity: number;
    /** Drag drop-line color; null = theme blue. */
    dropColor: string | null;
    /** Drop-line thickness in px. */
    dropWidth: number;
    /** Drop-line opacity (0-1). */
    dropOpacity: number;
    /** Drop-line corner rounding in px. */
    dropRadius: number;
  };
  dragSelect: {
    /** Rubber-band rectangle color; null = theme blue. */
    color: string | null;
    /** Rectangle fill opacity (0-1); the border rides the color at a fixed mix. */
    opacity: number;
  };
  list: {
    /** Disc (depth 1, 4, …) diameter in px — --docs-list-disc-size. */
    discSize: number;
    /** Circle (depth 2, 5, …) outer diameter in px — --docs-list-circle-size. */
    circleSize: number;
    /** Circle ring stroke width in px — --docs-list-circle-thickness. */
    circleThickness: number;
    /** Square (depth 3, 6, …) edge length in px — --docs-list-square-size. */
    squareSize: number;
    /** Marker column width = per-level indent step, in px (--docs-list-indent). */
    indent: number;
  };
  grip: {
    /** Horizontal gap between the grip and the block's left edge, in px. */
    gap: number;
    /** Vertical offset from the block's top, in px (negative = higher). */
    offsetY: number;
    /** Grip box width in px (height and glyph scale with it). */
    size: number;
    /** Grip color; null = the theme's muted icon color. */
    color: string | null;
    /** Fade in/out duration in ms (0 = instant). */
    fadeMs: number;
  };
  scrollbar: {
    /** Thumb/track width in px (WebKit scrollbar styling; Electron/Chromium). */
    width: number;
    /** Thumb color; null = the theme's muted icon color. */
    color: string | null;
    /** Thumb opacity (0-1). */
    opacity: number;
    /** Clear inset around the thumb in px — lifts it off the window edge. */
    padding: number;
  };
  transition: {
    type: "none" | "fade";
    fadeOutMs: number;
    fadeInMs: number;
  };
  peek: {
    /** Side-peek open width in rem — --docs-peek-width (unset = the viewer's responsive min()). */
    width: number;
    /** Width transition duration in ms — --docs-peek-duration. */
    durationMs: number;
    /** Peek body horizontal padding in rem — --docs-peek-padding. */
    padding: number;
    /** Divider color; null = theme border — --docs-peek-divider-color. */
    dividerColor: string | null;
    /** Divider thickness in px — --docs-peek-divider-width. */
    dividerWidth: number;
    /** Divider border style — --docs-peek-divider-style. */
    dividerStyle: PeekDividerStyle;
  };
  reference: {
    /** Doc-reference chip rest color; null = accessible theme navigation color — --docs-ref-color. */
    color: string | null;
    /** Chip hover underline color; null = foreground at 40% — --docs-ref-underline-color. */
    underlineColor: string | null;
    /** File icon size in px — --docs-ref-icon-size. */
    iconSize: number;
    /** File icon color; null = follow the reference text — --docs-ref-icon-color. */
    iconColor: string | null;
    /** Space between icon and label in px — --docs-ref-icon-gap. */
    iconGap: number;
    /** Whether the icon leads or trails the label — --docs-ref-icon-direction. */
    iconPosition: ReferenceIconPosition;
  };
  annotate: {
    /** Targeting ring and composer accent; null = follow the app accent. */
    accent: string | null;
    /** Staged-diff addition color; null = follow the active theme. */
    add: string | null;
    /** Staged-diff deletion color; null = follow the active theme. */
    del: string | null;
    /** Ambient annotate-mode accent wash opacity (0-1). */
    washOpacity: number;
    /** AI glass-panel width in px. */
    actionPaneWidth: number;
  };
  /**
   * Per-component token overrides (file -> key -> serialized token value),
   * layered over the active theme — the SAME vocabulary a theme folder's components/*.json
   * files carry (THEME_TOKEN_REGISTRY). Sparse: absent = follow the theme.
   */
  components: Record<string, Record<string, string>>;
  /**
   * Per-block-type page-layout overrides (doc block type -> lane override),
   * layered over docs-viewer's block-layout.ts code defaults. Sparse in both
   * directions: a block type absent from the map, or an entry missing a
   * field, inherits the code default. Emitted as real CSS rules keyed on the
   * `[data-doc-lane][data-doc-block-type]` pair, not as custom properties —
   * see applyBlockLayoutOverrideCss.
   */
  blockLayout: Record<string, BlockLayoutOverride>;
};

