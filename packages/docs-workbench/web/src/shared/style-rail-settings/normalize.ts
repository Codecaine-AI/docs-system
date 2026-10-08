import { THEME_TOKEN_REGISTRY } from "../../theme/theme-folders";
import { STYLE_RAIL_COLOR_LEAVES } from "./color-controls";
import { DEFAULT_STYLE_RAIL_SETTINGS, getStyleRailBaseline } from "./defaults";
import { normalizeBlockLayout } from "./block-layout-normalize";
import { clampNumber } from "./utils";
import type { AccentFamily, FontChoice, NumberFontChoice, CodeFontChoice, CodePanelMode, PageAlignment, PeekDividerStyle, ReferenceIconPosition, GrainBlendMode, StyleRailSettings } from "./types";

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
  { id: "sans", label: "Inter" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const NUMBER_FONT_OPTIONS: Array<{ id: NumberFontChoice; label: string }> = [
  { id: "body", label: "Body font" },
  ...FONT_OPTIONS,
];

const CODE_FONT_OPTIONS: Array<{ id: CodeFontChoice; label: string }> = [
  ...FONT_OPTIONS,
  { id: "plex-mono", label: "IBM Plex Mono" },
];

/** Code font ids that were once stock, read as the face that replaced them whatever the baseline holds. */
const RETIRED_CODE_FONTS: Readonly<Record<string, CodeFontChoice>> = { "fira-code": "plex-mono" };

const CODE_PANEL_OPTIONS: Array<{ id: CodePanelMode; label: string }> = [
  { id: "dark", label: "Always dark" },
  { id: "page", label: "Follow page" },
];

const PAGE_ALIGNMENT_OPTIONS: Array<{ id: PageAlignment; label: string }> = [
  { id: "left", label: "Left" },
  { id: "centered", label: "Centered" },
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
      codeFont: pickOption(
        RETIRED_CODE_FONTS[String(typography.codeFont)] ?? typography.codeFont,
        CODE_FONT_OPTIONS,
        d.typography.codeFont,
      ),
      codePanels: pickOption(typography.codePanels, CODE_PANEL_OPTIONS, d.typography.codePanels),
      numberFont: pickOption(typography.numberFont, NUMBER_FONT_OPTIONS, d.typography.numberFont),
      fontSize: clampNumber(typography.fontSize, 12, 28, d.typography.fontSize),
      lineHeight: clampNumber(typography.lineHeight, 1.1, 2.1, d.typography.lineHeight),
      letterSpacing: clampNumber(typography.letterSpacing, -0.02, 0.08, d.typography.letterSpacing),
    },
    layout: {
      contentWidth: clampNumber(layout.contentWidth ?? typography.contentWidth, 40, 140, d.layout.contentWidth),
      codeWidth: clampNumber(layout.codeWidth, 60, 160, d.layout.codeWidth),
      wideWidth: clampNumber(layout.wideWidth, 900, 2400, d.layout.wideWidth),
      contentMargin: clampNumber(layout.contentMargin, 0, 240, d.layout.contentMargin),
      alignment: pickOption(layout.alignment, PAGE_ALIGNMENT_OPTIONS, d.layout.alignment),
      centeredWidth: clampNumber(layout.centeredWidth, 480, 2400, d.layout.centeredWidth),
      centeredMargin: clampNumber(layout.centeredMargin, 0, 240, d.layout.centeredMargin),
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
 * The settings as they paint while the color controls are hidden
 * (style-rail-color-controls.ts): every color leaf back at stock and only the
 * non-color component tokens kept. Everything else is untouched. The stored
 * settings are not changed; this copy only feeds the CSS translation.
 */
export function withoutStoredColors(settings: StyleRailSettings): StyleRailSettings {
  const d = DEFAULT_STYLE_RAIL_SETTINGS;
  const painted: StyleRailSettings = {
    ...settings,
    colors: { ...d.colors },
    sidebar: { ...settings.sidebar },
    highlight: { ...settings.highlight },
    dragSelect: { ...settings.dragSelect },
    grip: { ...settings.grip },
    scrollbar: { ...settings.scrollbar },
    peek: { ...settings.peek },
    reference: { ...settings.reference },
    annotate: { ...settings.annotate },
  };
  for (const path of STYLE_RAIL_COLOR_LEAVES) {
    const [group, key] = path.split(".") as [keyof StyleRailSettings, string | undefined];
    if (key === undefined) {
      (painted as Record<string, unknown>)[group] = d[group];
    } else {
      (painted[group] as Record<string, unknown>)[key] = (d[group] as Record<string, unknown>)[key];
    }
  }
  const components: StyleRailSettings["components"] = {};
  for (const [file, tokens] of Object.entries(settings.components)) {
    const kept = Object.fromEntries(
      Object.entries(tokens).filter(([key]) => THEME_TOKEN_REGISTRY[file]?.[key]?.kind !== "color"),
    );
    if (Object.keys(kept).length > 0) components[file] = kept;
  }
  painted.components = components;
  return painted;
}

