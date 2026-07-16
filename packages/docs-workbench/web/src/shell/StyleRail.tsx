import { ChevronDown, PanelRightClose, PanelRightOpen, SlidersHorizontal, X } from "lucide-react";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

/**
 * Style rail — right-docked panel for live-tuning the docs theme, styled
 * with the docs' own semantic tokens so it follows light/dark. Every knob
 * resolves to CSS custom properties written onto <html>
 * (applyStyleRailVars), layered over theme/semantic.css; a knob at its
 * default REMOVES its override so the theme files stay authoritative.
 * Settings persist as one localStorage JSON blob, clamped on load.
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
/** auto resolves to overlay in light mode and screen in dark mode. */
export type GrainBlendMode = "auto" | "multiply" | "screen" | "overlay" | "normal";

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
    /** Font for numeric UI (list markers/counters) — --docs-font-numeric; "body" inherits. */
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
    /** Content column horizontal padding in px. */
    contentMargin: number;
    /** Space above the doc's first block in px. */
    topPadding: number;
    /** --radius in px (theme default 0.5rem = 8). */
    radius: number;
    /** Border alpha/contrast multiplier; 1 = theme default. */
    borderStrength: number;
    /** % of the accent family's bg mixed into the page background. */
    backgroundTint: number;
    /** % of gray mixed into the sidebar surface. */
    sidebarTint: number;
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
  };
  /**
   * Per-component token overrides (file -> key -> hex), layered over the
   * active theme — the SAME vocabulary a theme folder's components/*.json
   * files carry (THEME_TOKEN_REGISTRY). Sparse: absent = follow the theme.
   */
  components: Record<string, Record<string, string>>;
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
    contentMargin: 32,
    topPadding: 24,
    radius: 8,
    borderStrength: 1,
    backgroundTint: 0,
    sidebarTint: 0,
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
  grip: { gap: 12, offsetY: 6, size: 18, color: null, fadeMs: 100 },
  scrollbar: { width: 10, color: null, opacity: 1 },
  components: {},
};

const STORAGE_KEY = "docs-style-rail-settings.v1";

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

/** Components section: the theme files exposed for per-token overrides (shell + editor-controls are covered by the Colors / Editor sections). */
const COMPONENT_PICKER_FILES = [
  "inline-code",
  "paragraph",
  "heading",
  "list-item",
  "quote",
  "code",
  "callout",
  "divider",
  "image",
  "video",
  "file-tree",
  "structured-table",
  "interaction-surface",
  "mermaid",
  "canvas",
  "surfaces",
] as const;

const COMPONENT_LABELS: Record<string, string> = {
  "inline-code": "Inline code",
  "list-item": "List item",
  "file-tree": "File tree",
  "structured-table": "Structured table",
  "interaction-surface": "Interaction surface",
  surfaces: "Shared surfaces",
};

const TOKEN_KEY_LABELS: Record<string, string> = {
  fg: "Text",
  bg: "Background",
  border: "Border",
  fill: "Fill",
  marker: "Marker",
  caption: "Caption",
  note: "Note",
  headerBg: "Header background",
  headerFg: "Header text",
  color: "Color",
  string: "Strings",
  number: "Numbers",
  boolean: "Booleans",
  null: "Null",
  key: "Keys",
  muted: "Muted fill",
  icon: "Icons",
};

/** "file-tree" -> "File tree" when no explicit label exists. */
function componentLabel(file: string): string {
  if (COMPONENT_LABELS[file]) return COMPONENT_LABELS[file];
  return file.charAt(0).toUpperCase() + file.slice(1);
}

const NUMBER_FONT_OPTIONS: Array<{ id: NumberFontChoice; label: string }> = [
  { id: "body", label: "Body font" },
  ...FONT_OPTIONS,
];

const BLEND_OPTIONS: Array<{ id: GrainBlendMode; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "multiply", label: "Multiply · darken" },
  { id: "screen", label: "Screen · lighten" },
  { id: "overlay", label: "Overlay" },
  { id: "normal", label: "Normal" },
];

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

/** Keeps only registry-valid file/key pairs with valid hex values. */
function normalizeComponentOverrides(raw: unknown): StyleRailSettings["components"] {
  const kept: StyleRailSettings["components"] = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return kept;
  for (const [file, tokens] of Object.entries(raw as Record<string, unknown>)) {
    const registry = THEME_TOKEN_REGISTRY[file];
    if (!registry || !tokens || typeof tokens !== "object" || Array.isArray(tokens)) continue;
    const fileKept: Record<string, string> = {};
    for (const [key, value] of Object.entries(tokens as Record<string, unknown>)) {
      if (!registry[key]) continue;
      const hex = pickHexColor(value);
      if (hex) fileKept[key] = hex;
    }
    if (Object.keys(fileKept).length > 0) kept[file] = fileKept;
  }
  return kept;
}

export function normalizeSettings(raw: unknown): StyleRailSettings {
  const d = DEFAULT_STYLE_RAIL_SETTINGS;
  const input = (raw ?? {}) as Partial<StyleRailSettings> & {
    // v1 blobs kept contentWidth under typography and the surface knobs
    // under `surfaces` — migrate them if present.
    surfaces?: Partial<StyleRailSettings["layout"]>;
    typography?: Partial<StyleRailSettings["typography"]> & { contentWidth?: number };
  };
  const typography = input.typography ?? ({} as NonNullable<typeof input.typography>);
  const layout = { ...input.surfaces, ...input.layout } as Partial<StyleRailSettings["layout"]>;
  const grain = input.grain ?? d.grain;
  const softening = grain.softening ?? d.grain.softening;
  const colors = input.colors ?? d.colors;
  const highlight = input.highlight ?? ({} as Partial<StyleRailSettings["highlight"]>);
  const grip = input.grip ?? ({} as Partial<StyleRailSettings["grip"]>);
  const scrollbar = input.scrollbar ?? ({} as Partial<StyleRailSettings["scrollbar"]>);
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
      contentMargin: clampNumber(layout.contentMargin, 0, 96, d.layout.contentMargin),
      topPadding: clampNumber(layout.topPadding, 0, 240, d.layout.topPadding),
      radius: clampNumber(layout.radius, 0, 16, d.layout.radius),
      borderStrength: clampNumber(layout.borderStrength, 0, 2, d.layout.borderStrength),
      backgroundTint: clampNumber(layout.backgroundTint, 0, 12, d.layout.backgroundTint),
      sidebarTint: clampNumber(layout.sidebarTint, 0, 60, d.layout.sidebarTint),
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
    },
    components: normalizeComponentOverrides(input.components),
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

export function loadStyleRailSettings(): StyleRailSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STYLE_RAIL_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_STYLE_RAIL_SETTINGS;
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
 * Settings → CSS custom properties. `null` = at default, remove the
 * override. Color values stay var()/color-mix expressions over the palette
 * vars so they re-resolve when the light/dark class flips on <html>.
 */
export function styleRailVars(settings: StyleRailSettings): Record<string, string | null> {
  const d = DEFAULT_STYLE_RAIL_SETTINGS;
  const { accent, colors, typography, layout, grain, highlight, grip, scrollbar, components } = settings;
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
  // every CSS var THEME_TOKEN_REGISTRY maps it to. Spread LAST so a
  // component override beats a section knob's null (remove) entry for any
  // shared variable.
  const componentVars: Record<string, string | null> = {};
  for (const [file, tokens] of Object.entries(components)) {
    for (const [key, value] of Object.entries(tokens)) {
      for (const cssVar of THEME_TOKEN_REGISTRY[file]?.[key] ?? []) {
        componentVars[cssVar] = value;
      }
    }
  }

  return {
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
    "--style-content-margin":
      layout.contentMargin === d.layout.contentMargin ? null : `${layout.contentMargin}px`,
    "--style-content-top":
      layout.topPadding === d.layout.topPadding ? null : `${layout.topPadding}px`,

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
    ...componentVars,
  };
}

export function applyStyleRailVars(settings: StyleRailSettings) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(styleRailVars(settings))) {
    if (value === null) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
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

/**
 * Resolve any CSS color expression (e.g. `var(--color-bg-default)`) to a
 * #rrggbb hex via a throwaway element — used so an unset picker shows the
 * theme's actual current color. Palette tokens are read (not the rail's own
 * overrides), so the resolved value is the true "default" for the theme.
 */
function resolveCssColor(expr: string): string {
  if (typeof document === "undefined") return "#ffffff";
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.color = expr;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return "#ffffff";
  return `#${parts
    .slice(0, 3)
    .map((v) => Math.round(Number(v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function ColorRow({
  label,
  value,
  defaultExpr,
  onChange,
}: {
  label: string;
  value: string | null;
  /** CSS expression for the theme default shown while unset. */
  defaultExpr: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        {value !== null && (
          <button
            aria-label={`Reset ${label} color to theme default`}
            className="style-icon-button !h-5 !w-5"
            onClick={() => onChange(null)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <input
          className="style-color"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="color"
          value={value ?? resolveCssColor(defaultExpr)}
        />
      </span>
    </div>
  );
}

/**
 * Collapsible rail section. Open state persists per title in localStorage
 * (UI state, deliberately NOT part of the theme settings blob). `nested`
 * renders the compact bordered variant used inside the Components section.
 */
function PanelSection({
  title,
  children,
  defaultOpen = false,
  nested = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  nested?: boolean;
}) {
  const storageKey = `docs-style-rail-section:${nested ? "component:" : ""}${title}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === null ? defaultOpen : stored === "true";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () =>
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Session-only state when storage is unavailable.
      }
      return next;
    });
  return (
    <section
      className={nested ? "rounded-md border" : "border-t pt-3 first:border-t-0 first:pt-0"}
    >
      <button
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          nested && "px-2 py-1.5",
        )}
        onClick={toggle}
        type="button"
      >
        <h2
          className={
            nested
              ? "text-xs text-foreground"
              : "text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground"
          }
        >
          {title}
        </h2>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className={cn("space-y-3", nested ? "px-2 pb-2 pt-1" : "pt-2")}>{children}</div>
      )}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input
        checked={checked}
        className="style-toggle"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="text-[11px] text-foreground">{valueLabel}</span>
      </span>
      <input
        className="style-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <select
        className="style-select"
        onChange={(event) => onChange(event.currentTarget.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type ThemePickerEntry = { id: string; name: string; source: "builtin" | "repo" };

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
}) {
  const { accent, colors, typography, layout, grain } = settings;
  const [tab, setTab] = useState<"theme" | "layout">("theme");
  const patchColors = (patch: Partial<StyleRailSettings["colors"]>) =>
    onSettingsChange({ ...settings, colors: { ...colors, ...patch } });
  const patchTypography = (patch: Partial<StyleRailSettings["typography"]>) =>
    onSettingsChange({ ...settings, typography: { ...typography, ...patch } });
  const patchLayout = (patch: Partial<StyleRailSettings["layout"]>) =>
    onSettingsChange({ ...settings, layout: { ...layout, ...patch } });
  const patchGrain = (patch: Partial<StyleRailSettings["grain"]>) =>
    onSettingsChange({ ...settings, grain: { ...grain, ...patch } });
  const patchSoftening = (patch: Partial<StyleRailSettings["grain"]["softening"]>) =>
    patchGrain({ softening: { ...grain.softening, ...patch } });
  const patchHighlight = (patch: Partial<StyleRailSettings["highlight"]>) =>
    onSettingsChange({ ...settings, highlight: { ...settings.highlight, ...patch } });
  const patchGrip = (patch: Partial<StyleRailSettings["grip"]>) =>
    onSettingsChange({ ...settings, grip: { ...settings.grip, ...patch } });
  const patchScrollbar = (patch: Partial<StyleRailSettings["scrollbar"]>) =>
    onSettingsChange({ ...settings, scrollbar: { ...settings.scrollbar, ...patch } });
  const patchComponent = (file: string, key: string, value: string | null) => {
    const fileTokens = { ...(settings.components[file] ?? {}) };
    if (value === null) delete fileTokens[key];
    else fileTokens[key] = value;
    const components = { ...settings.components };
    if (Object.keys(fileTokens).length === 0) delete components[file];
    else components[file] = fileTokens;
    onSettingsChange({ ...settings, components });
  };

  const saveThemePrompt = () => {
    if (!onSaveTheme) return;
    const name = window.prompt("Theme name (saved to the repo's themes/ folder):");
    if (name?.trim()) onSaveTheme(name.trim());
  };

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
        collapsed ? "w-[3.25rem]" : "w-[30rem]",
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
          <div className="flex shrink-0 gap-1 border-b p-2">
            {(["theme", "layout"] as const).map((id) => (
              <button
                key={id}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-[11px] font-medium",
                  tab === id
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setTab(id)}
                type="button"
              >
                {id === "theme" ? "Theme" : "Layout"}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {tab === "theme" && (
              <>
                <PanelSection defaultOpen title="Themes">
                  <div className="grid grid-cols-2 gap-1.5">
                    {themes.map((theme) => (
                      <button
                        key={theme.id}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs",
                          theme.id === activeThemeId
                            ? "border-primary/50 bg-muted text-foreground"
                            : "text-foreground hover:bg-muted hover:text-foreground",
                        )}
                        onClick={() => onSelectTheme(theme.id)}
                        title={theme.source === "repo" ? "themes/ folder in this repo" : "built-in"}
                        type="button"
                      >
                        {theme.name}
                      </button>
                    ))}
                  </div>
                  {onSaveTheme && (
                    <button
                      className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                      onClick={saveThemePrompt}
                      type="button"
                    >
                      Save current look as theme…
                    </button>
                  )}
                </PanelSection>
                <PanelSection defaultOpen title="Colors">
                  <ToggleRow checked={dark} label="Dark mode" onChange={onDarkChange} />
                  <SelectRow
                    label="Accent"
                    onChange={(value) => onSettingsChange({ ...settings, accent: value })}
                    options={ACCENT_OPTIONS}
                    value={accent}
                  />
                  <ColorRow
                    defaultExpr="var(--color-bg-default)"
                    label="Background"
                    onChange={(value) => patchColors({ background: value })}
                    value={colors.background}
                  />
                  <ColorRow
                    defaultExpr="var(--color-bg-sidebar)"
                    label="Sidebar"
                    onChange={(value) => patchColors({ sidebar: value })}
                    value={colors.sidebar}
                  />
                  <ColorRow
                    defaultExpr="var(--color-text-default)"
                    label="Text"
                    onChange={(value) => patchColors({ text: value })}
                    value={colors.text}
                  />
                </PanelSection>
                <PanelSection title="Typography">
                  <SelectRow
                    label="Body font"
                    onChange={(value) => patchTypography({ bodyFont: value })}
                    options={FONT_OPTIONS}
                    value={typography.bodyFont}
                  />
                  <SelectRow
                    label="Heading font"
                    onChange={(value) => patchTypography({ headingFont: value })}
                    options={FONT_OPTIONS}
                    value={typography.headingFont}
                  />
                  <SelectRow
                    label="Code font"
                    onChange={(value) => patchTypography({ codeFont: value })}
                    options={FONT_OPTIONS}
                    value={typography.codeFont}
                  />
                  <SelectRow
                    label="Number font"
                    onChange={(value) => patchTypography({ numberFont: value })}
                    options={NUMBER_FONT_OPTIONS}
                    value={typography.numberFont}
                  />
                  <SliderRow
                    label="Font size"
                    max={20}
                    min={12}
                    onChange={(value) => patchTypography({ fontSize: value })}
                    step={0.5}
                    value={typography.fontSize}
                    valueLabel={`${typography.fontSize}px`}
                  />
                  <SliderRow
                    label="Line height"
                    max={2.1}
                    min={1.3}
                    onChange={(value) => patchTypography({ lineHeight: value })}
                    step={0.05}
                    value={typography.lineHeight}
                    valueLabel={typography.lineHeight.toFixed(2)}
                  />
                  <SliderRow
                    label="Letter spacing"
                    max={0.08}
                    min={-0.02}
                    onChange={(value) => patchTypography({ letterSpacing: value })}
                    step={0.005}
                    value={typography.letterSpacing}
                    valueLabel={`${(typography.letterSpacing * 1000).toFixed(0)}‰`}
                  />
                </PanelSection>
                <PanelSection title="Components">
                  <p className="text-[11px] leading-relaxed text-foreground">
                    Per-component overrides, layered over the active theme — the
                    same keys a theme folder's components/*.json files carry.
                  </p>
                  {COMPONENT_PICKER_FILES.map((file) => (
                    <PanelSection key={file} nested title={componentLabel(file)}>
                      {Object.entries(THEME_TOKEN_REGISTRY[file] ?? {}).map(([key, cssVars]) => (
                        <ColorRow
                          key={key}
                          defaultExpr={`var(${cssVars[0]})`}
                          label={TOKEN_KEY_LABELS[key] ?? key}
                          onChange={(value) => patchComponent(file, key, value)}
                          value={settings.components[file]?.[key] ?? null}
                        />
                      ))}
                    </PanelSection>
                  ))}
                </PanelSection>
                <PanelSection title="Background effect">
                  <ToggleRow
                    checked={grain.enabled}
                    label="Enable grain"
                    onChange={(value) => patchGrain({ enabled: value })}
                  />
                  <SliderRow
                    label="Intensity"
                    max={0.5}
                    min={0}
                    onChange={(value) => patchGrain({ opacity: value })}
                    step={0.01}
                    value={grain.opacity}
                    valueLabel={grain.opacity.toFixed(2)}
                  />
                  <SliderRow
                    label="Density"
                    max={1.6}
                    min={0.25}
                    onChange={(value) => patchGrain({ frequency: value })}
                    step={0.05}
                    value={grain.frequency}
                    valueLabel={grain.frequency.toFixed(2)}
                  />
                  <SliderRow
                    label="Contrast"
                    max={3}
                    min={0.3}
                    onChange={(value) => patchGrain({ contrast: value })}
                    step={0.05}
                    value={grain.contrast}
                    valueLabel={grain.contrast.toFixed(2)}
                  />
                  <SelectRow
                    label="Blend"
                    onChange={(value) => patchGrain({ blendMode: value })}
                    options={BLEND_OPTIONS}
                    value={grain.blendMode}
                  />
                  <PanelSection nested title="Softening">
                    <SliderRow
                      label="Background"
                      max={1}
                      min={0}
                      onChange={(value) => patchSoftening({ background: value })}
                      step={0.05}
                      value={grain.softening.background}
                      valueLabel={`${Math.round(grain.softening.background * 100)}%`}
                    />
                    <SliderRow
                      label="Font"
                      max={1.5}
                      min={0}
                      onChange={(value) => patchSoftening({ font: value })}
                      step={0.05}
                      value={grain.softening.font}
                      valueLabel={`${Math.round(grain.softening.font * 100)}%`}
                    />
                    <SliderRow
                      label="Icons"
                      max={1.5}
                      min={0}
                      onChange={(value) => patchSoftening({ icons: value })}
                      step={0.05}
                      value={grain.softening.icons}
                      valueLabel={`${Math.round(grain.softening.icons * 100)}%`}
                    />
                  </PanelSection>
                </PanelSection>
              </>
            )}

            {tab === "layout" && (
              <>
                <PanelSection defaultOpen title="Column">
                  <SliderRow
                    label="Max width"
                    max={140}
                    min={60}
                    onChange={(value) => patchLayout({ contentWidth: value })}
                    step={2}
                    value={layout.contentWidth}
                    valueLabel={`${layout.contentWidth}ch`}
                  />
                  <SliderRow
                    label="Padding"
                    max={96}
                    min={0}
                    onChange={(value) => patchLayout({ contentMargin: value })}
                    step={4}
                    value={layout.contentMargin}
                    valueLabel={`${layout.contentMargin}px`}
                  />
                  <SliderRow
                    label="Top padding"
                    max={240}
                    min={0}
                    onChange={(value) => patchLayout({ topPadding: value })}
                    step={4}
                    value={layout.topPadding}
                    valueLabel={`${layout.topPadding}px`}
                  />
                </PanelSection>
                <PanelSection title="Surfaces">
                  <SliderRow
                    label="Radius"
                    max={16}
                    min={0}
                    onChange={(value) => patchLayout({ radius: value })}
                    step={1}
                    value={layout.radius}
                    valueLabel={`${layout.radius}px`}
                  />
                  <SliderRow
                    label="Border strength"
                    max={2}
                    min={0}
                    onChange={(value) => patchLayout({ borderStrength: value })}
                    step={0.05}
                    value={layout.borderStrength}
                    valueLabel={`${Math.round(layout.borderStrength * 100)}%`}
                  />
                  <SliderRow
                    label="Background tint"
                    max={12}
                    min={0}
                    onChange={(value) => patchLayout({ backgroundTint: value })}
                    step={0.5}
                    value={layout.backgroundTint}
                    valueLabel={`${layout.backgroundTint}%`}
                  />
                  <SliderRow
                    label="Sidebar tint"
                    max={60}
                    min={0}
                    onChange={(value) => patchLayout({ sidebarTint: value })}
                    step={2}
                    value={layout.sidebarTint}
                    valueLabel={`${layout.sidebarTint}%`}
                  />
                </PanelSection>
                <PanelSection title="Scrollbar">
                  <SliderRow
                    label="Width"
                    max={20}
                    min={4}
                    onChange={(value) => patchScrollbar({ width: value })}
                    step={1}
                    value={settings.scrollbar.width}
                    valueLabel={`${settings.scrollbar.width}px`}
                  />
                  <ColorRow
                    defaultExpr="var(--docs-icon-muted)"
                    label="Color"
                    onChange={(value) => patchScrollbar({ color: value })}
                    value={settings.scrollbar.color}
                  />
                  <SliderRow
                    label="Opacity"
                    max={1}
                    min={0.1}
                    onChange={(value) => patchScrollbar({ opacity: value })}
                    step={0.05}
                    value={settings.scrollbar.opacity}
                    valueLabel={`${Math.round(settings.scrollbar.opacity * 100)}%`}
                  />
                </PanelSection>
                <PanelSection defaultOpen title="Editor">
                  <PanelSection nested title="Highlight">
                    <ColorRow
                      defaultExpr="var(--color-bg-blue)"
                      label="Color"
                      onChange={(value) => patchHighlight({ color: value })}
                      value={settings.highlight.color}
                    />
                    <SliderRow
                      label="Rounding"
                      max={24}
                      min={0}
                      onChange={(value) => patchHighlight({ radius: value })}
                      step={1}
                      value={settings.highlight.radius}
                      valueLabel={`${settings.highlight.radius}px`}
                    />
                    <SliderRow
                      label="Padding"
                      max={12}
                      min={0}
                      onChange={(value) => patchHighlight({ padding: value })}
                      step={1}
                      value={settings.highlight.padding}
                      valueLabel={`${settings.highlight.padding}px`}
                    />
                    <SliderRow
                      label="Drag opacity"
                      max={1}
                      min={0.05}
                      onChange={(value) => patchHighlight({ dragOpacity: value })}
                      step={0.05}
                      value={settings.highlight.dragOpacity}
                      valueLabel={`${Math.round(settings.highlight.dragOpacity * 100)}%`}
                    />
                  </PanelSection>
                  <PanelSection nested title="Drop line">
                    <ColorRow
                      defaultExpr="var(--color-text-blue)"
                      label="Color"
                      onChange={(value) => patchHighlight({ dropColor: value })}
                      value={settings.highlight.dropColor}
                    />
                    <SliderRow
                      label="Thickness"
                      max={8}
                      min={1}
                      onChange={(value) => patchHighlight({ dropWidth: value })}
                      step={1}
                      value={settings.highlight.dropWidth}
                      valueLabel={`${settings.highlight.dropWidth}px`}
                    />
                    <SliderRow
                      label="Opacity"
                      max={1}
                      min={0.1}
                      onChange={(value) => patchHighlight({ dropOpacity: value })}
                      step={0.05}
                      value={settings.highlight.dropOpacity}
                      valueLabel={`${Math.round(settings.highlight.dropOpacity * 100)}%`}
                    />
                    <SliderRow
                      label="Rounding"
                      max={6}
                      min={0}
                      onChange={(value) => patchHighlight({ dropRadius: value })}
                      step={1}
                      value={settings.highlight.dropRadius}
                      valueLabel={`${settings.highlight.dropRadius}px`}
                    />
                  </PanelSection>
                  <PanelSection nested title="Drag grip">
                    <SliderRow
                      label="Gap"
                      max={32}
                      min={0}
                      onChange={(value) => patchGrip({ gap: value })}
                      step={1}
                      value={settings.grip.gap}
                      valueLabel={`${settings.grip.gap}px`}
                    />
                    <SliderRow
                      label="Vertical offset"
                      max={20}
                      min={-12}
                      onChange={(value) => patchGrip({ offsetY: value })}
                      step={1}
                      value={settings.grip.offsetY}
                      valueLabel={`${settings.grip.offsetY}px`}
                    />
                    <SliderRow
                      label="Size"
                      max={28}
                      min={14}
                      onChange={(value) => patchGrip({ size: value })}
                      step={1}
                      value={settings.grip.size}
                      valueLabel={`${settings.grip.size}px`}
                    />
                    <SliderRow
                      label="Fade"
                      max={400}
                      min={0}
                      onChange={(value) => patchGrip({ fadeMs: value })}
                      step={10}
                      value={settings.grip.fadeMs}
                      valueLabel={`${settings.grip.fadeMs}ms`}
                    />
                    <ColorRow
                      defaultExpr="var(--docs-icon-muted)"
                      label="Color"
                      onChange={(value) => patchGrip({ color: value })}
                      value={settings.grip.color}
                    />
                  </PanelSection>
                </PanelSection>
              </>
            )}
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
            <button
              className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSettingsChange(DEFAULT_STYLE_RAIL_SETTINGS)}
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
