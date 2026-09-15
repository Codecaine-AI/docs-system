import { PanelRightClose, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import { useState } from "react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import { StyleRailNav, isStyleRailPaneId, type StyleRailPaneId } from "./style-rail-nav";
import { StyleRailPane } from "./style-rail-panes";

/**
 * Style rail — right-docked panel for live-tuning the docs theme, styled
 * with the docs' own semantic tokens so it follows light/dark. Every knob
 * resolves to CSS custom properties written onto <html>
 * (applyStyleRailVars), layered over theme/semantic.css; a knob at STOCK
 * REMOVES its override so the theme files stay authoritative.
 *
 * PERSISTENCE is two-layered (see the baseline block below
 * DEFAULT_STYLE_RAIL_SETTINGS): the durable, committable copy is the
 * `railDefaults` block of the repo's `themes/<id>/theme.json`, which every
 * consumer reads — a --theme-locked serve, a static export, a different
 * browser. A localStorage JSON blob sits ON TOP of it as this browser's
 * private override. Both are clamped on load.
 * Grain/softening effects ported from ccbcu client-dashboard's style rail.
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
export type BlockLayoutWidth = "text" | "wide" | "full";
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

/** Which block types render two panes, and therefore expose a Column split. */
const TWO_PANE_BLOCK_TYPES = new Set(["state-shape", "interaction-surface"]);

export function hasBlockColumnSplit(file: string): boolean {
  return TWO_PANE_BLOCK_TYPES.has(file);
}

/** Left-pane percentage bounds — neither pane may be squeezed to nothing. */
export const BLOCK_COLUMN_SPLIT_MIN = 20;
export const BLOCK_COLUMN_SPLIT_MAX = 80;

/**
 * The split each two-pane block renders at with NO override. These MUST match
 * the `--docs-pane-split` fallbacks baked into the components' grid templates
 * — an unset knob emits nothing, so the component's literal is what actually
 * renders and a mismatch would make the slider start somewhere the page is
 * not. Pinned by a test.
 */
export const BLOCK_COLUMN_SPLIT_DEFAULTS: Record<string, number> = {
  "state-shape": 46,
  "interaction-surface": 52,
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
    codeFont: FontChoice;
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
     * Wide-lane max-width in px — the escape hatch data-heavy blocks
     * (state shapes, interaction surfaces, structured tables, process
     * outlines) break out to when the reading column is too narrow.
     * Sized in px, not ch, because those blocks are grids, not prose.
     */
    wideWidth: number;
    /** Content column horizontal padding in px. */
    contentMargin: number;
    /** Space above the doc's first block in px. */
    topPadding: number;
    /** Space between the fixed page title and the first block, in px. */
    titlePadding: number;
    /** Space below the doc's last block in px. */
    bottomPadding: number;
    /** --radius in px (theme default 0.5rem = 8). */
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

export const DEFAULT_STYLE_RAIL_SETTINGS: StyleRailSettings = {
  accent: "blue",
  colors: { background: null, sidebar: null, text: null },
  typography: {
    bodyFont: "sans",
    headingFont: "sans",
    codeFont: "mono",
    numberFont: "body",
    fontSize: 14,
    lineHeight: 1.7,
    letterSpacing: 0,
  },
  layout: {
    contentWidth: 100,
    wideWidth: 1040,
    // The page is left-anchored and full-width, so this is the global left
    // rail every block hangs off — generous by default rather than the tight
    // gutter a centered column wanted.
    contentMargin: 88,
    topPadding: 24,
    titlePadding: 20,
    bottomPadding: 24,
    radius: 8,
    borderStrength: 1,
    backgroundTint: 0,
    sidebarTint: 0,
  },
  sidebar: {
    textColor: null,
    font: "sans",
    fontSize: 14,
    padding: 4,
    guides: true,
    guideColor: null,
    guideWidth: 1,
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
  highlight: { color: null, radius: 6, padding: 4, dragOpacity: 0.3, dropColor: null, dropWidth: 3, dropOpacity: 0.9, dropRadius: 2 },
  dragSelect: { color: null, opacity: 0.12 },
  list: { discSize: 6, circleSize: 6, circleThickness: 1.5, squareSize: 5, indent: 24 },
  grip: { gap: 12, offsetY: 6, size: 18, color: null, fadeMs: 100 },
  scrollbar: { width: 10, color: null, opacity: 1, padding: 0 },
  transition: { type: "fade", fadeOutMs: 80, fadeInMs: 120 },
  peek: {
    width: 48,
    durationMs: 300,
    padding: 1.5,
    dividerColor: null,
    dividerWidth: 1,
    dividerStyle: "solid",
  },
  reference: {
    color: null,
    underlineColor: null,
    iconSize: 12,
    iconColor: null,
    iconGap: 2,
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

const STORAGE_KEY = "docs-style-rail-settings.v1";

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

const ACCENT_OPTIONS: Array<{ id: AccentFamily; label: string }> = [
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "brown", label: "Brown" },
  { id: "gray", label: "Gray" },
];

const FONT_OPTIONS: Array<{ id: FontChoice; label: string }> = [
  { id: "sans", label: "System Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const NUMBER_FONT_OPTIONS: Array<{ id: NumberFontChoice; label: string }> = [
  { id: "body", label: "Body font" },
  ...FONT_OPTIONS,
];

const PEEK_DIVIDER_STYLE_OPTIONS: Array<{ id: PeekDividerStyle; label: string }> = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "double", label: "Double" },
];

const REFERENCE_ICON_POSITION_OPTIONS: Array<{
  id: ReferenceIconPosition;
  label: string;
}> = [
  { id: "before", label: "Before text" },
  { id: "after", label: "After text" },
];

const BLEND_OPTIONS: Array<{ id: GrainBlendMode; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "multiply", label: "Multiply · darken" },
  { id: "screen", label: "Screen · lighten" },
  { id: "overlay", label: "Overlay" },
  { id: "normal", label: "Normal" },
];

/**
 * The block types the Layout knobs apply to. `blocks.*` panes also cover
 * non-block components (inline code, linking, shell, surfaces, editor
 * controls), which have no lane at all, so every entry point — the pane UI,
 * the override leaves, the CSS emitter and the normalizer — gates on this
 * set rather than on the pane id.
 */
const BLOCK_LAYOUT_TYPES: ReadonlySet<string> = new Set(DOC_BLOCK_TYPES);

/** True when `file` is a real doc block type and can carry a lane override. */
export function isBlockLayoutType(file: string): boolean {
  return BLOCK_LAYOUT_TYPES.has(file);
}

const BLOCK_LAYOUT_WIDTHS: readonly BlockLayoutWidth[] = ["text", "wide", "full"];
const BLOCK_LAYOUT_JUSTIFICATIONS: readonly BlockLayoutJustify[] = ["left", "center"];

/** Custom lane width bounds in px — narrower than a prose measure, wider than any display. */
export const BLOCK_LAYOUT_CUSTOM_WIDTH_MIN = 240;
export const BLOCK_LAYOUT_CUSTOM_WIDTH_MAX = 3000;

/**
 * Validates one block type's lane override. Everything unrecognised is
 * DROPPED rather than defaulted: an absent field means "inherit the code
 * default from block-layout.ts", so silently substituting a value here would
 * turn a typo in a hand-edited theme file into a layout the author never
 * asked for. A custom width survives only as a positive, clamped `<n>px`
 * string, which is also what keeps the emitted rule's declaration safe.
 */
function normalizeBlockLayoutOverride(raw: unknown): BlockLayoutOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { width, justify } = raw as { width?: unknown; justify?: unknown };
  const override: BlockLayoutOverride = {};

  if (typeof width === "string") {
    const named = width.trim();
    if ((BLOCK_LAYOUT_WIDTHS as readonly string[]).includes(named)) {
      override.width = named as BlockLayoutWidth;
    } else {
      const px = /^(\d+(?:\.\d+)?)px$/.exec(named);
      const value = px ? Number(px[1]) : Number.NaN;
      if (Number.isFinite(value) && value > 0) {
        override.width = `${Math.round(
          clampNumber(
            value,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MAX,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
          ),
        )}px`;
      }
    }
  }

  if (
    typeof justify === "string"
    && (BLOCK_LAYOUT_JUSTIFICATIONS as readonly string[]).includes(justify)
  ) {
    override.justify = justify as BlockLayoutJustify;
  }

  const { columnSplit } = raw as { columnSplit?: unknown };
  if (typeof columnSplit === "number" && Number.isFinite(columnSplit)) {
    override.columnSplit = Math.round(
      clampNumber(columnSplit, BLOCK_COLUMN_SPLIT_MIN, BLOCK_COLUMN_SPLIT_MAX, BLOCK_COLUMN_SPLIT_MIN),
    );
  }

  // An entry that survived validation with nothing in it is not an override.
  return override.width || override.justify || override.columnSplit !== undefined
    ? override
    : null;
}

/**
 * Validates the whole per-block-type override map, dropping keys that are not
 * real doc block types (a renamed or removed block type must not keep
 * emitting a rule for a selector nothing matches).
 *
 * An absent or malformed map inherits `fallback` (the repo baseline) WHOLESALE
 * rather than per key: the map is sparse, so a per-key merge would make
 * clearing an override locally impossible — the baseline's entry would keep
 * coming back on the next normalize.
 */
function normalizeBlockLayout(
  raw: unknown,
  fallback: StyleRailSettings["blockLayout"] | undefined,
): StyleRailSettings["blockLayout"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const kept: StyleRailSettings["blockLayout"] = {};
  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBlockLayoutType(type)) continue;
    const override = normalizeBlockLayoutOverride(value);
    if (override) kept[type] = override;
  }
  return kept;
}

const FONT_STACKS: Record<FontChoice, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function pickOption<T extends string>(value: unknown, options: Array<{ id: T }>, fallback: T): T {
  return options.some((option) => option.id === value) ? (value as T) : fallback;
}

function pickHexColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function normalizeComponentOverride(
  value: unknown,
  token: (typeof THEME_TOKEN_REGISTRY)[string][string],
): string | null {
  if (token.kind === "color") return pickHexColor(value);
  if (typeof value !== "string" && typeof value !== "number") return null;

  const raw = String(value).trim();
  if (!raw) return null;
  const numericPart = token.unit && raw.endsWith(token.unit)
    ? raw.slice(0, -token.unit.length).trim()
    : raw;
  if (!numericPart) return null;
  const numericValue = Number(numericPart);
  if (
    !Number.isFinite(numericValue)
    || numericValue < token.min
    || numericValue > token.max
  ) {
    return null;
  }
  return `${numericValue}${token.unit ?? ""}`;
}

/** Keeps only registry-valid file/key pairs with values valid for their token kind. */
function normalizeComponentOverrides(raw: unknown): StyleRailSettings["components"] {
  const kept: StyleRailSettings["components"] = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return kept;
  for (const [file, tokens] of Object.entries(raw as Record<string, unknown>)) {
    const registry = THEME_TOKEN_REGISTRY[file];
    if (!registry || !tokens || typeof tokens !== "object" || Array.isArray(tokens)) continue;
    const fileKept: Record<string, string> = {};
    for (const [key, value] of Object.entries(tokens as Record<string, unknown>)) {
      const token = registry[key];
      if (!token) continue;
      const normalized = normalizeComponentOverride(value, token);
      if (normalized !== null) fileKept[key] = normalized;
    }
    if (Object.keys(fileKept).length > 0) kept[file] = fileKept;
  }
  return kept;
}

/**
 * Validates/clamps an arbitrary blob into settings, filling every missing
 * or invalid key from `baseline`. The default baseline is the REPO's saved
 * rail settings, which is what makes a partial or stale-schema localStorage
 * blob layer key-by-key over the repo's tuning instead of snapping those
 * keys back to stock. Pass DEFAULT_STYLE_RAIL_SETTINGS explicitly to
 * normalize against stock (that is how the baseline itself is loaded).
 */
export function normalizeSettings(
  raw: unknown,
  baseline: StyleRailSettings = getStyleRailBaseline(),
): StyleRailSettings {
  const d = baseline;
  const input = (raw ?? {}) as Partial<StyleRailSettings> & {
    // v1 blobs kept contentWidth under typography and the surface knobs
    // under `surfaces` — migrate them if present.
    surfaces?: Partial<StyleRailSettings["layout"]>;
    typography?: Partial<StyleRailSettings["typography"]> & { contentWidth?: number };
  };
  const typography = input.typography ?? ({} as NonNullable<typeof input.typography>);
  const layout = { ...input.surfaces, ...input.layout } as Partial<StyleRailSettings["layout"]>;
  const sidebar = input.sidebar ?? ({} as Partial<StyleRailSettings["sidebar"]>);
  const grain = input.grain ?? d.grain;
  const softening = grain.softening ?? d.grain.softening;
  const colors = input.colors ?? d.colors;
  const highlight = input.highlight ?? ({} as Partial<StyleRailSettings["highlight"]>);
  const grip = input.grip ?? ({} as Partial<StyleRailSettings["grip"]>);
  const scrollbar = input.scrollbar ?? ({} as Partial<StyleRailSettings["scrollbar"]>);
  const transition = input.transition ?? ({} as Partial<StyleRailSettings["transition"]>);
  const peek = input.peek ?? ({} as Partial<StyleRailSettings["peek"]>);
  const reference = input.reference ?? ({} as Partial<StyleRailSettings["reference"]>);
  const annotate = input.annotate ?? ({} as Partial<StyleRailSettings["annotate"]>);
  const dragSelect = input.dragSelect ?? ({} as Partial<StyleRailSettings["dragSelect"]>);
  const list = input.list ?? ({} as Partial<StyleRailSettings["list"]>);
  return {
    accent: pickOption(input.accent, ACCENT_OPTIONS, d.accent),
    colors: {
      background: pickHexColor(colors.background),
      sidebar: pickHexColor(colors.sidebar),
      text: pickHexColor(colors.text),
    },
    typography: {
      bodyFont: pickOption(typography.bodyFont, FONT_OPTIONS, d.typography.bodyFont),
      headingFont: pickOption(typography.headingFont, FONT_OPTIONS, d.typography.headingFont),
      codeFont: pickOption(typography.codeFont, FONT_OPTIONS, d.typography.codeFont),
      numberFont: pickOption(typography.numberFont, NUMBER_FONT_OPTIONS, d.typography.numberFont),
      fontSize: clampNumber(typography.fontSize, 12, 20, d.typography.fontSize),
      lineHeight: clampNumber(typography.lineHeight, 1.3, 2.1, d.typography.lineHeight),
      letterSpacing: clampNumber(typography.letterSpacing, -0.02, 0.08, d.typography.letterSpacing),
    },
    layout: {
      contentWidth: clampNumber(layout.contentWidth ?? typography.contentWidth, 60, 140, d.layout.contentWidth),
      wideWidth: clampNumber(layout.wideWidth, 900, 2400, d.layout.wideWidth),
      contentMargin: clampNumber(layout.contentMargin, 0, 240, d.layout.contentMargin),
      topPadding: clampNumber(layout.topPadding, 0, 240, d.layout.topPadding),
      titlePadding: clampNumber(layout.titlePadding, 0, 240, d.layout.titlePadding),
      bottomPadding: clampNumber(layout.bottomPadding, 0, 600, d.layout.bottomPadding),
      radius: clampNumber(layout.radius, 0, 16, d.layout.radius),
      borderStrength: clampNumber(layout.borderStrength, 0, 2, d.layout.borderStrength),
      backgroundTint: clampNumber(layout.backgroundTint, 0, 12, d.layout.backgroundTint),
      sidebarTint: clampNumber(layout.sidebarTint, 0, 60, d.layout.sidebarTint),
    },
    sidebar: {
      textColor: pickHexColor(sidebar.textColor),
      font: pickOption(sidebar.font, FONT_OPTIONS, d.sidebar.font),
      fontSize: clampNumber(sidebar.fontSize, 10, 20, d.sidebar.fontSize),
      padding: clampNumber(sidebar.padding, 0, 16, d.sidebar.padding),
      guides: typeof sidebar.guides === "boolean" ? sidebar.guides : d.sidebar.guides,
      guideColor: pickHexColor(sidebar.guideColor),
      guideWidth: clampNumber(sidebar.guideWidth, 1, 4, d.sidebar.guideWidth),
      guideOpacity: clampNumber(sidebar.guideOpacity, 0.05, 1, d.sidebar.guideOpacity),
    },
    highlight: {
      color: pickHexColor(highlight.color),
      radius: clampNumber(highlight.radius, 0, 24, d.highlight.radius),
      padding: clampNumber(highlight.padding, 0, 12, d.highlight.padding),
      dragOpacity: clampNumber(highlight.dragOpacity, 0.05, 1, d.highlight.dragOpacity),
      dropColor: pickHexColor(highlight.dropColor),
      dropWidth: clampNumber(highlight.dropWidth, 1, 8, d.highlight.dropWidth),
      dropOpacity: clampNumber(highlight.dropOpacity, 0.1, 1, d.highlight.dropOpacity),
      dropRadius: clampNumber(highlight.dropRadius, 0, 6, d.highlight.dropRadius),
    },
    dragSelect: {
      color: pickHexColor(dragSelect.color),
      opacity: clampNumber(dragSelect.opacity, 0.02, 0.6, d.dragSelect.opacity),
    },
    list: {
      discSize: clampNumber(list.discSize, 3, 12, d.list.discSize),
      circleSize: clampNumber(list.circleSize, 3, 12, d.list.circleSize),
      circleThickness: clampNumber(
        list.circleThickness,
        0.5,
        3,
        d.list.circleThickness,
      ),
      squareSize: clampNumber(list.squareSize, 3, 12, d.list.squareSize),
      indent: clampNumber(list.indent, 12, 48, d.list.indent),
    },
    grip: {
      gap: clampNumber(grip.gap, 0, 32, d.grip.gap),
      offsetY: clampNumber(grip.offsetY, -12, 20, d.grip.offsetY),
      size: clampNumber(grip.size, 14, 28, d.grip.size),
      color: pickHexColor(grip.color),
      fadeMs: clampNumber(grip.fadeMs, 0, 400, d.grip.fadeMs),
    },
    scrollbar: {
      width: clampNumber(scrollbar.width, 4, 20, d.scrollbar.width),
      color: pickHexColor(scrollbar.color),
      opacity: clampNumber(scrollbar.opacity, 0.1, 1, d.scrollbar.opacity),
      padding: clampNumber(scrollbar.padding, 0, 12, d.scrollbar.padding),
    },
    transition: {
      type: transition.type === "none" || transition.type === "fade" ? transition.type : d.transition.type,
      fadeOutMs: clampNumber(transition.fadeOutMs, 0, 800, d.transition.fadeOutMs),
      fadeInMs: clampNumber(transition.fadeInMs, 0, 800, d.transition.fadeInMs),
    },
    peek: {
      width: clampNumber(peek.width, 24, 80, d.peek.width),
      durationMs: clampNumber(peek.durationMs, 0, 800, d.peek.durationMs),
      padding: clampNumber(peek.padding, 0, 4, d.peek.padding),
      dividerColor: pickHexColor(peek.dividerColor),
      dividerWidth: clampNumber(peek.dividerWidth, 0, 8, d.peek.dividerWidth),
      dividerStyle: pickOption(peek.dividerStyle, PEEK_DIVIDER_STYLE_OPTIONS, d.peek.dividerStyle),
    },
    reference: {
      color: pickHexColor(reference.color),
      underlineColor: pickHexColor(reference.underlineColor),
      iconSize: clampNumber(reference.iconSize, 8, 28, d.reference.iconSize),
      iconColor: pickHexColor(reference.iconColor),
      iconGap: clampNumber(reference.iconGap, 0, 16, d.reference.iconGap),
      iconPosition: pickOption(
        reference.iconPosition,
        REFERENCE_ICON_POSITION_OPTIONS,
        d.reference.iconPosition,
      ),
    },
    annotate: {
      // Nullable colors distinguish an explicit `null` (return to the
      // active theme) from an omitted key in a stale localStorage cache
      // (inherit the repo's railDefaults baseline).
      accent:
        annotate.accent === undefined ? d.annotate.accent : pickHexColor(annotate.accent),
      add: annotate.add === undefined ? d.annotate.add : pickHexColor(annotate.add),
      del: annotate.del === undefined ? d.annotate.del : pickHexColor(annotate.del),
      washOpacity: clampNumber(annotate.washOpacity, 0, 0.3, d.annotate.washOpacity),
      actionPaneWidth: clampNumber(
        annotate.actionPaneWidth,
        380,
        680,
        d.annotate.actionPaneWidth,
      ),
    },
    // Component token overrides deliberately do NOT fall back to the
    // baseline: the repo persists those as real `themes/<id>/components/
    // *.json` token files that compile into the theme's CSS layer, so they
    // already reach every consumer without riding the inline overlay.
    // Inheriting them here too would double-apply the same tokens.
    components: normalizeComponentOverrides(input.components),
    // Lane overrides, unlike component tokens, DO inherit the baseline: they
    // ride `manifest.railDefaults` (App.tsx's themeWritePayload), so the repo
    // theme is their only durable home and a blob that omits the map must
    // keep rendering what the repo committed.
    blockLayout: normalizeBlockLayout(input.blockLayout, d.blockLayout),
    grain: {
      enabled: typeof grain.enabled === "boolean" ? grain.enabled : d.grain.enabled,
      opacity: clampNumber(grain.opacity, 0, 0.5, d.grain.opacity),
      frequency: clampNumber(grain.frequency, 0.25, 1.6, d.grain.frequency),
      contrast: clampNumber(grain.contrast, 0.3, 3, d.grain.contrast),
      blendMode: pickOption(grain.blendMode, BLEND_OPTIONS, d.grain.blendMode),
      softening: {
        background: clampNumber(softening.background, 0, 1, d.grain.softening.background),
        font: clampNumber(softening.font, 0, 1.5, d.grain.softening.font),
        icons: clampNumber(softening.icons, 0, 1.5, d.grain.softening.icons),
      },
    },
  };
}

/**
 * Reads the browser cache, filling any omitted keys from the installed
 * baseline. App uses this only as the first-frame/offline fallback when the
 * active repo theme has no railDefaults; a repo railDefaults block is the
 * durable authority and replaces stale cache during normal boot.
 */
export function loadStyleRailSettings(): StyleRailSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getStyleRailBaseline();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return getStyleRailBaseline();
  }
}

/** True when a browser cache exists; retained for cache-aware hosts/tests. */
export function hasStoredStyleRailSettings(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveStyleRailSettings(settings: StyleRailSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session if storage is unavailable.
  }
}

/**
 * Settings → CSS custom properties. `null` = at STOCK, remove the override.
 * Color values stay var()/color-mix expressions over the palette vars so
 * they re-resolve when the light/dark class flips on <html>.
 *
 * The comparison here is against STOCK, never against the repo baseline —
 * `null` removes the inline property and hands the answer back to
 * theme/semantic.css, which only knows stock values. A knob parked at a
 * repo baseline that differs from stock must therefore still EMIT, and
 * that emission is precisely how the repo's tuning reaches a --theme-locked
 * serve, a static export, or a browser with no localStorage of its own.
 */
export function styleRailVars(settings: StyleRailSettings): Record<string, string | null> {
  const d = DEFAULT_STYLE_RAIL_SETTINGS;
  const { accent, colors, typography, layout, sidebar: sidebarSettings, grain, highlight, dragSelect, list, grip, scrollbar, peek, reference, annotate, components } = settings;
  const { softening } = grain;

  const accented = accent !== d.accent;
  const accentText = `var(--color-text-${accent})`;
  const accentBg = `var(--color-bg-${accent})`;
  const accentPill = `var(--color-pill-${accent})`;

  let border: string | null = null;
  if (layout.borderStrength !== d.layout.borderStrength) {
    border =
      layout.borderStrength <= 1
        ? `color-mix(in srgb, var(--color-pill-default) ${Math.round(layout.borderStrength * 100)}%, transparent)`
        : `color-mix(in srgb, var(--color-pill-default) ${Math.round(100 - (layout.borderStrength - 1) * 60)}%, var(--color-text-gray) ${Math.round((layout.borderStrength - 1) * 60)}%)`;
  }

  // Custom picks replace the theme token as the base; the tint knobs then
  // mix into whatever base is active.
  const tint = layout.backgroundTint;
  const bgBase = colors.background ?? "var(--color-bg-default)";
  const background =
    tint > 0
      ? `color-mix(in srgb, ${bgBase} ${100 - tint}%, ${accentBg} ${tint}%)`
      : colors.background;

  // The sidebar's theme default is Notion's off-white (--color-bg-sidebar),
  // so tint overrides must mix from that base, not the page background.
  const sidebarPick = colors.sidebar ?? "var(--color-bg-sidebar)";
  const sidebarBase =
    tint > 0
      ? `color-mix(in srgb, ${sidebarPick} ${100 - tint}%, ${accentBg} ${tint}%)`
      : sidebarPick;
  const sidebar =
    layout.sidebarTint > 0
      ? `color-mix(in srgb, ${sidebarBase} ${100 - layout.sidebarTint}%, var(--color-bg-gray) ${layout.sidebarTint}%)`
      : tint > 0 || colors.sidebar
        ? sidebarBase
        : null;

  // Per-component overrides ride the same overlay: each file/key writes
  // every CSS var THEME_TOKEN_REGISTRY maps it to. Seed nulls so removing
  // an override also removes its former inline property; registry defaults
  // likewise defer to the active theme stylesheet. The merge below lets a
  // custom component value beat a section knob, but not a seeded null.
  const componentVars: Record<string, string | null> = {};
  for (const tokens of Object.values(THEME_TOKEN_REGISTRY)) {
    for (const token of Object.values(tokens)) {
      for (const cssVar of token.vars) componentVars[cssVar] = null;
    }
  }
  for (const [file, tokens] of Object.entries(components)) {
    for (const [key, value] of Object.entries(tokens)) {
      const token = THEME_TOKEN_REGISTRY[file]?.[key];
      if (!token) continue;
      const atDefault = token.kind !== "color"
        && value === `${token.defaultValue}${token.unit ?? ""}`;
      for (const cssVar of token.vars) {
        componentVars[cssVar] = atDefault ? null : value;
      }
    }
  }

  const vars: Record<string, string | null> = {
    "--accent": accented ? accentBg : null,
    "--accent-foreground": accented ? accentText : null,
    "--ring": accented ? accentPill : null,
    "--docs-viewer-link": accented ? accentText : null,

    "--font-tx02": typography.bodyFont === d.typography.bodyFont ? null : FONT_STACKS[typography.bodyFont],
    "--font-display":
      typography.headingFont === d.typography.headingFont ? null : FONT_STACKS[typography.headingFont],
    "--style-heading-font":
      typography.headingFont === d.typography.headingFont ? null : FONT_STACKS[typography.headingFont],
    "--style-font-size": typography.fontSize === d.typography.fontSize ? null : `${typography.fontSize}px`,
    "--style-line-height":
      typography.lineHeight === d.typography.lineHeight ? null : String(typography.lineHeight),
    "--style-letter-spacing":
      typography.letterSpacing === d.typography.letterSpacing ? null : `${typography.letterSpacing}em`,
    // Font tokens for code + numeric surfaces (the canonical contract in
    // theme/semantic.css); index.css carries the :root defaults.
    "--docs-font-code":
      typography.codeFont === d.typography.codeFont ? null : FONT_STACKS[typography.codeFont],
    "--docs-font-numeric":
      typography.numberFont === d.typography.numberFont || typography.numberFont === "body"
        ? null
        : FONT_STACKS[typography.numberFont],
    "--style-content-width":
      layout.contentWidth === d.layout.contentWidth ? null : `${layout.contentWidth}ch`,
    // Wide lane for data-heavy blocks. In px because those blocks size to a
    // grid, not to the body font's ch. Consumers carry the 1040px fallback
    // inline, so the default deliberately emits nothing.
    "--style-wide-width":
      layout.wideWidth === d.layout.wideWidth ? null : `${layout.wideWidth}px`,
    "--style-content-margin":
      layout.contentMargin === d.layout.contentMargin ? null : `${layout.contentMargin}px`,
    "--style-content-top":
      layout.topPadding === d.layout.topPadding ? null : `${layout.topPadding}px`,
    "--style-content-bottom":
      layout.bottomPadding === d.layout.bottomPadding ? null : `${layout.bottomPadding}px`,
    "--style-title-padding":
      layout.titlePadding === d.layout.titlePadding ? null : `${layout.titlePadding}px`,

    // Docs-tree sidebar typography and row rhythm. Defaults remove the
    // overrides so the nav keeps following the active theme and base CSS.
    "--docs-sidebar-item-fg": sidebarSettings.textColor,
    "--docs-sidebar-font":
      sidebarSettings.font === d.sidebar.font ? null : FONT_STACKS[sidebarSettings.font],
    "--docs-sidebar-font-size":
      sidebarSettings.fontSize === d.sidebar.fontSize ? null : `${sidebarSettings.fontSize}px`,
    "--docs-sidebar-item-py":
      sidebarSettings.padding === d.sidebar.padding ? null : `${sidebarSettings.padding}px`,
    "--docs-sidebar-guide-display": sidebarSettings.guides ? null : "none",
    "--docs-sidebar-guide-color": sidebarSettings.guideColor,
    "--docs-sidebar-guide-width":
      sidebarSettings.guideWidth === d.sidebar.guideWidth
        ? null
        : `${sidebarSettings.guideWidth}px`,
    "--docs-sidebar-guide-opacity":
      sidebarSettings.guideOpacity === d.sidebar.guideOpacity
        ? null
        : String(sidebarSettings.guideOpacity),

    // Block highlight (changed-flash + node selection) and the drag
    // drop-line — consumed in index.css with theme-blue fallbacks.
    "--docs-highlight-color": highlight.color,
    "--docs-highlight-radius":
      highlight.radius === d.highlight.radius ? null : `${highlight.radius}px`,
    "--docs-highlight-padding":
      highlight.padding === d.highlight.padding ? null : `${highlight.padding}px`,
    "--docs-drag-opacity":
      highlight.dragOpacity === d.highlight.dragOpacity ? null : String(highlight.dragOpacity),
    "--docs-dropcursor-color": highlight.dropColor,
    "--docs-dropcursor-width":
      highlight.dropWidth === d.highlight.dropWidth ? null : `${highlight.dropWidth}px`,
    "--docs-dropcursor-opacity":
      highlight.dropOpacity === d.highlight.dropOpacity ? null : String(highlight.dropOpacity),
    "--docs-dropcursor-radius":
      highlight.dropRadius === d.highlight.dropRadius ? null : `${highlight.dropRadius}px`,

    // Drag-select rubber band — consumed in index.css.
    "--docs-dragselect-color": dragSelect.color,
    "--docs-dragselect-opacity":
      dragSelect.opacity === d.dragSelect.opacity ? null : String(dragSelect.opacity),

    // List marker geometry and indent — consumed in index.css.
    "--docs-list-disc-size":
      list.discSize === d.list.discSize ? null : `${list.discSize}px`,
    "--docs-list-circle-size":
      list.circleSize === d.list.circleSize ? null : `${list.circleSize}px`,
    "--docs-list-circle-thickness":
      list.circleThickness === d.list.circleThickness ? null : `${list.circleThickness}px`,
    "--docs-list-square-size":
      list.squareSize === d.list.squareSize ? null : `${list.squareSize}px`,
    "--docs-list-indent": list.indent === d.list.indent ? null : `${list.indent}px`,

    // Drag grip — position vars are read by drag-handle.ts at show
    // time; size/color are consumed in index.css.
    "--docs-grip-gap": grip.gap === d.grip.gap ? null : `${grip.gap}px`,
    "--docs-grip-offset-y": grip.offsetY === d.grip.offsetY ? null : `${grip.offsetY}px`,
    "--docs-grip-size": grip.size === d.grip.size ? null : `${grip.size}px`,
    "--docs-grip-color": grip.color,
    "--docs-grip-fade": grip.fadeMs === d.grip.fadeMs ? null : `${grip.fadeMs}ms`,

    "--docs-scrollbar-width":
      scrollbar.width === d.scrollbar.width ? null : `${scrollbar.width}px`,
    "--docs-scrollbar-color": scrollbar.color,
    "--docs-scrollbar-opacity":
      scrollbar.opacity === d.scrollbar.opacity ? null : String(scrollbar.opacity),
    "--docs-scrollbar-padding":
      scrollbar.padding === d.scrollbar.padding ? null : `${scrollbar.padding}px`,

    // Side-peek panel + doc-reference chip — consumed by docs-viewer
    // (DocPeekPanel / the inline reference chip); semantic.css carries the
    // canonical defaults, so a knob at default removes its override and the
    // theme-tracking token (e.g. var(--border)) stays authoritative.
    "--docs-page-transition-type": settings.transition.type,
    "--docs-page-fade-out": `${settings.transition.fadeOutMs}ms`,
    "--docs-page-fade-in": `${settings.transition.fadeInMs}ms`,
    "--docs-peek-width": peek.width === d.peek.width ? null : `${peek.width}rem`,
    "--docs-peek-duration":
      peek.durationMs === d.peek.durationMs ? null : `${peek.durationMs}ms`,
    "--docs-peek-padding": peek.padding === d.peek.padding ? null : `${peek.padding}rem`,
    "--docs-peek-divider-color": peek.dividerColor,
    "--docs-peek-divider-width":
      peek.dividerWidth === d.peek.dividerWidth ? null : `${peek.dividerWidth}px`,
    "--docs-peek-divider-style":
      peek.dividerStyle === d.peek.dividerStyle ? null : peek.dividerStyle,
    "--docs-ref-color": reference.color,
    "--docs-ref-underline-color": reference.underlineColor,
    "--docs-ref-icon-size":
      reference.iconSize === d.reference.iconSize ? null : `${reference.iconSize}px`,
    "--docs-ref-icon-color": reference.iconColor,
    "--docs-ref-icon-gap":
      reference.iconGap === d.reference.iconGap ? null : `${reference.iconGap}px`,
    "--docs-ref-icon-direction":
      reference.iconPosition === d.reference.iconPosition ? null : "row-reverse",

    // Annotate-mode tokens. At defaults the theme stylesheet remains the
    // authority; a custom annotation accent also feeds the wash expression.
    "--annotation-accent": annotate.accent,
    "--docs-annotation-add": annotate.add,
    "--docs-annotation-del": annotate.del,
    "--docs-annotation-wash":
      annotate.washOpacity === d.annotate.washOpacity
        ? null
        : `color-mix(in srgb, var(--annotation-accent) ${Math.round(annotate.washOpacity * 100)}%, transparent)`,
    "--docs-action-pane-width":
      annotate.actionPaneWidth === d.annotate.actionPaneWidth
        ? null
        : `${annotate.actionPaneWidth}px`,

    "--radius": layout.radius === d.layout.radius ? null : `${layout.radius}px`,
    "--border": border,
    "--input": border,
    "--sidebar-border": border,
    "--docs-border-default": border,
    "--background": background,
    "--card": background,
    "--popover": background,
    "--sidebar": sidebar,
    "--foreground": colors.text,
    "--card-foreground": colors.text,
    "--popover-foreground": colors.text,
    "--sidebar-foreground": colors.text,
    "--docs-viewer-text-body": colors.text,
    "--docs-viewer-text-heading": colors.text,

    "--docs-grain-opacity": String(grain.enabled ? grain.opacity * softening.background : 0),
    // auto defers to per-theme vars (overlay on light, screen on dark)
    // declared in style-rail.css, so the blend flips with the theme; the
    // boost keeps overlay's perceived strength comparable to screen.
    "--docs-grain-blend-mode":
      grain.blendMode === "auto" ? "var(--docs-grain-auto-blend)" : grain.blendMode,
    "--docs-grain-boost": grain.blendMode === "auto" ? "var(--docs-grain-auto-boost)" : "1",
    "--style-soften-font-glow": `${softening.font * 0.2}px`,
    "--style-soften-icon-blur": `${softening.icons * 0.08}px`,
    "--style-soften-icon-glow": `${softening.icons * 0.24}px`,
    "--style-soften-icon-opacity": String(1 - softening.icons * 0.04),
  };

  for (const [key, value] of Object.entries(componentVars)) {
    if (value !== null || vars[key] == null) vars[key] = value;
  }
  return vars;
}

export function applyStyleRailVars(settings: StyleRailSettings) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(styleRailVars(settings))) {
    if (value === null) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
}

/** The single <style> element the lane overrides live in. */
export const BLOCK_LAYOUT_STYLE_ELEMENT_ID = "docs-style-rail-block-layout";

/** Named lane widths, resolved to the same values docBlockLayoutClasses uses. */
const BLOCK_LAYOUT_WIDTH_VALUES: Record<BlockLayoutWidth, string> = {
  text: "var(--style-content-width,100ch)",
  wide: "var(--style-wide-width,1040px)",
  full: "none",
};

/**
 * Per-block-type lane overrides as CSS TEXT.
 *
 * These cannot ride applyStyleRailVars: custom properties on <html> are
 * global, and this knob is per block type. So the rail emits real rules keyed
 * on the `data-doc-lane` + `data-doc-block-type` attribute pair. Every
 * top-level read/annotate block carries that pair; in edit mode it is carried
 * by atom NodeViews (including state-shape), while ordinary ProseMirror text
 * nodes continue to use the editor's global text lane.
 *
 * SPECIFICITY, deliberately: the pair is two attribute selectors — (0,2,0) —
 * against the (0,1,0) of the Tailwind utility class the lane element also
 * wears (`max-w-[…]`, `mx-auto`). The override therefore wins on specificity
 * alone, with no `!important` and no dependence on stylesheet order. Do not
 * add `!important` here; it would also outrank a block's own component CSS,
 * which is not what this knob means.
 *
 * The loop walks DOC_BLOCK_TYPES rather than the settings map's own keys, so
 * only a known, literal block-type name can ever reach the selector — an
 * unknown key cannot inject anything, whatever the theme file says.
 */
export function blockLayoutOverrideCss(settings: StyleRailSettings): string {
  const rules: string[] = [];
  for (const type of DOC_BLOCK_TYPES) {
    const override = settings.blockLayout?.[type];
    if (!override) continue;
    const declarations: string[] = [];
    if (override.width !== undefined) {
      const width = (BLOCK_LAYOUT_WIDTH_VALUES as Record<string, string | undefined>)[override.width]
        ?? override.width;
      declarations.push(`max-width: ${width};`);
    }
    if (override.justify === "left") declarations.push("margin-left: 0;", "margin-right: auto;");
    else if (override.justify === "center") declarations.push("margin-inline: auto;");
    // The split rides as a custom property rather than a grid-template, so the
    // component keeps ownership of its own track structure (gaps, minmax
    // floors, the single-column stack below its breakpoint) and this only
    // supplies the one number the author actually chose.
    if (override.columnSplit !== undefined && hasBlockColumnSplit(type)) {
      declarations.push(`--docs-pane-split: ${override.columnSplit}%;`);
    }
    if (declarations.length === 0) continue;
    rules.push(
      `[data-doc-lane][data-doc-block-type="${type}"] { ${declarations.join(" ")} }`,
    );
  }
  return rules.join("\n");
}

/**
 * Sibling of applyStyleRailVars for the rules that cannot be expressed as
 * custom properties. Maintains ONE <style> element in <head>, created once
 * and then only ever refilled, so the overrides can never accumulate stale
 * copies. No overrides = an empty element, not a removed one.
 */
export function applyBlockLayoutOverrideCss(settings: StyleRailSettings) {
  if (typeof document === "undefined") return;
  let element = document.getElementById(BLOCK_LAYOUT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = BLOCK_LAYOUT_STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  const css = blockLayoutOverrideCss(settings);
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Full-viewport SVG turbulence grain (ported from ccbcu's
 * DashboardStyleOverlay). Opacity/blend come from the CSS vars;
 * frequency/contrast bind here.
 */
export function StyleRailOverlay({ settings, dark }: { settings: StyleRailSettings; dark: boolean }) {
  const { grain } = settings;
  if (!grain.enabled) return null;
  // Static noise, the original recipe. Overlay is symmetric around the
  // base, so it gets plain mid-gray-centered noise. Multiply can only
  // darken and screen can only lighten, so for those the noise is biased
  // into the band next to the blend's neutral point (just below white for
  // multiply, just above black for screen) — the static lands without
  // shifting the page's average luminance.
  const blend = grain.blendMode === "auto" ? (dark ? "screen" : "overlay") : grain.blendMode;
  const bias =
    blend === "multiply"
      ? { scale: 0.45, offset: 0.55 }
      : blend === "screen"
        ? { scale: 0.45, offset: 0 }
        : { scale: 1, offset: 0 };
  const slope = grain.contrast * bias.scale;
  const intercept = ((1 - grain.contrast) / 2) * bias.scale + bias.offset;
  return (
    <div aria-hidden="true" className="docs-grain-layer">
      <svg className="h-full w-full" focusable="false" preserveAspectRatio="none">
        <filter id="docs-grain-filter" colorInterpolationFilters="sRGB">
          <feTurbulence
            baseFrequency={String(grain.frequency)}
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncG type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncB type="linear" slope={String(slope)} intercept={String(intercept)} />
            {/* feTurbulence emits noisy alpha too; make the layer opaque so
                the blend result depends only on the luminance above. */}
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
        </filter>
        <rect filter="url(#docs-grain-filter)" height="100%" width="100%" />
      </svg>
    </div>
  );
}

export type ThemePickerEntry = { id: string; name: string; source: "builtin" | "repo" };

const SELECTED_PANE_STORAGE_KEY = "docs-style-rail-selected";

export function StyleRail({
  collapsed,
  onCollapsedChange,
  settings,
  onSettingsChange,
  dark,
  onDarkChange,
  themes,
  activeThemeId,
  onSelectTheme,
  onSaveTheme,
  onSaveStyleToRepo,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  settings: StyleRailSettings;
  onSettingsChange: (settings: StyleRailSettings) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  /** Theme catalogue: built-ins plus the repo's themes/ folders. */
  themes: ThemePickerEntry[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  /** Absent in static exports (no server to write the folder). */
  onSaveTheme?: (name: string) => void;
  /**
   * Promotes the current knobs to the repo BASELINE by writing them into
   * `themes/<id>/theme.json`. Absent whenever this host may not author the
   * theme — a static export, or a serve that is (or might still be)
   * `--theme-locked`; the server refuses such a write with 403 regardless.
   */
  onSaveStyleToRepo?: () => void;
}) {
  const [selectedPaneId, setSelectedPaneId] = useState<StyleRailPaneId>(() => {
    // docs-style-rail-section:* keys are retired; selection is the persisted pane UI state.
    try {
      const stored = window.localStorage.getItem(SELECTED_PANE_STORAGE_KEY);
      return isStyleRailPaneId(stored) ? stored : "theme.presets";
    } catch {
      return "theme.presets";
    }
  });

  const selectPane = (paneId: StyleRailPaneId) => {
    setSelectedPaneId(paneId);
    try {
      window.localStorage.setItem(SELECTED_PANE_STORAGE_KEY, paneId);
    } catch {
      // Session-only state when storage is unavailable.
    }
  };

  const activeThemeName =
    themes.find((theme) => theme.id === activeThemeId)?.name ?? activeThemeId ?? "Default";

  // Theme files: the exported JSON is exactly the persisted settings blob
  // plus the dark flag — importing runs it through normalizeSettings, so a
  // hand-edited or stale-schema file degrades to clamped defaults instead
  // of breaking the rail. See docs/20-implementation/40-theming.
  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ version: 1, dark, settings }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "docs-theme.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importTheme = (file: File) => {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as { dark?: unknown; settings?: unknown };
        onSettingsChange(normalizeSettings(parsed.settings ?? parsed));
        if (typeof parsed.dark === "boolean") onDarkChange(parsed.dark);
      } catch {
        // Not a theme file — leave the current theme untouched.
      }
    });
  };

  return (
    <aside
      className={cn(
        "relative z-20 hidden h-screen shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[3.25rem]" : "w-[46rem]",
      )}
    >
      <div
        className={cn(
          "flex h-11 shrink-0 items-center border-b px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        {!collapsed && (
          <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
            Style
          </div>
        )}
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand style controls" : "Collapse style controls"}
          className="style-icon-button"
          onClick={() => onCollapsedChange(!collapsed)}
          type="button"
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-1 items-start justify-center pt-4">
          <SlidersHorizontal className="h-4 w-4 text-foreground" />
        </div>
      ) : (
        <>
          <div className="style-rail-two-pane">
            <StyleRailPane
              activeThemeId={activeThemeId}
              activeThemeName={activeThemeName}
              dark={dark}
              onDarkChange={onDarkChange}
              onSaveTheme={onSaveTheme}
              onSelectTheme={onSelectTheme}
              onSettingsChange={onSettingsChange}
              selectedId={selectedPaneId}
              settings={settings}
              themes={themes}
            />
            <StyleRailNav
              dark={dark}
              onSelect={selectPane}
              selectedId={selectedPaneId}
              settings={settings}
            />
          </div>

          <div className="shrink-0 space-y-1.5 border-t p-2">
            <div className="flex gap-1.5">
              <button
                className="flex-1 rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={exportTheme}
                type="button"
              >
                Export theme
              </button>
              <label className="flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-center text-xs text-foreground hover:bg-muted hover:text-foreground">
                Import theme
                <input
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) importTheme(file);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
            {/* Writes the current knobs into the repo theme file, making
                them the baseline every consumer inherits. The debounced
                auto-save in App.tsx already does this in the background;
                this is the explicit, immediate affordance for "make what I
                am looking at the repo default". */}
            {onSaveStyleToRepo && (
              <button
                className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={onSaveStyleToRepo}
                type="button"
              >
                Save style to repo
              </button>
            )}
            {/* "Defaults" means the REPO baseline, not stock: resetting
                returns to the committed theme file, so a reset here matches
                what every other consumer of this repo already renders. */}
            <button
              className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSettingsChange(getStyleRailBaseline())}
              type="button"
            >
              Reset to defaults
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
