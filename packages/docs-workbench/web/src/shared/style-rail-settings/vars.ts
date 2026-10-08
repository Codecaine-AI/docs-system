import { THEME_TOKEN_REGISTRY } from "../../theme/theme-folders";
import { styleRailColorControls } from "./color-controls";
import { DEFAULT_STYLE_RAIL_SETTINGS } from "./defaults";
import { withoutStoredColors } from "./normalize";
import type { CodeFontChoice, StyleRailSettings } from "./types";

// The font stacks are @codecaine-ai/design-system tokens. The stock ones are
// what theme/read-surface.css's :root --font-tx02 and --docs-font-code read,
// and they equal docs-model DOCS_DEFAULT_FONTS.
const FONT_STACKS: Record<CodeFontChoice, string> = {
  sans: "var(--ds-font-family-sans)",
  serif: "var(--ds-font-family-serif)",
  mono: "var(--ds-font-family-mono-system)",
  "plex-mono": "var(--ds-font-family-mono)",
};

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
 *
 * While the color controls are hidden, every color leaf and color component
 * token translates as stock (withoutStoredColors): the design-system tokens
 * answer, whatever color the cache or a theme file stores.
 */
export function styleRailVars(stored: StyleRailSettings): Record<string, string | null> {
  const d = DEFAULT_STYLE_RAIL_SETTINGS;
  // Hidden color controls: stored colors do not paint (style-rail-color-controls.ts).
  const settings = styleRailColorControls() ? stored : withoutStoredColors(stored);
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
    // theme/semantic.css); theme/read-surface.css carries the :root defaults.
    "--docs-font-code":
      typography.codeFont === d.typography.codeFont ? null : FONT_STACKS[typography.codeFont],
    "--docs-font-numeric":
      typography.numberFont === d.typography.numberFont || typography.numberFont === "body"
        ? null
        : FONT_STACKS[typography.numberFont],
    "--style-content-width":
      layout.contentWidth === d.layout.contentWidth ? null : `${layout.contentWidth}ch`,
    // Code lane for mono blocks, in ch like the text measure. Consumers carry
    // the 88ch fallback inline, so the default deliberately emits nothing.
    "--style-code-width":
      layout.codeWidth === d.layout.codeWidth ? null : `${layout.codeWidth}ch`,
    // Wide lane for data-heavy blocks. In px because those blocks size to a
    // grid, not to the body font's ch. Consumers carry the 1100px fallback
    // inline, so the default deliberately emits nothing.
    "--style-wide-width":
      layout.wideWidth === d.layout.wideWidth ? null : `${layout.wideWidth}px`,
    "--style-content-margin":
      layout.contentMargin === d.layout.contentMargin ? null : `${layout.contentMargin}px`,
    // Centered-alignment column. semantic.css carries the stock values, so the
    // default emits nothing. Alignment itself is not a var: the host passes
    // layout.alignment to DocPage, which stamps data-docs-alignment.
    "--style-centered-width":
      layout.centeredWidth === d.layout.centeredWidth ? null : `${layout.centeredWidth}px`,
    "--style-centered-margin":
      layout.centeredMargin === d.layout.centeredMargin ? null : `${layout.centeredMargin}px`,
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

/**
 * Rail vars a dark code panel does NOT take: the page color picks. They tune
 * the page (a cream background, near-black text), so a panel rendered dark on
 * a light page keeps its own dark values for them.
 */
export const PAGE_COLOR_VARS: ReadonlySet<string> = new Set([
  "--background",
  "--card",
  "--popover",
  "--sidebar",
  "--foreground",
  "--card-foreground",
  "--popover-foreground",
  "--sidebar-foreground",
  "--docs-viewer-text-body",
  "--docs-viewer-text-heading",
]);

