import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import { hasBlockColumnSplit } from "./block-layout";
import { styleRailVars, PAGE_COLOR_VARS } from "./vars";
import type { BlockLayoutWidth, StyleRailSettings } from "./types";

/** The single <style> element the dark-code-panel restatement lives in. */
export const CODE_PANEL_STYLE_ELEMENT_ID = "docs-style-rail-code-panels";

/**
 * The rail's overrides restated for dark code panels, as CSS TEXT.
 *
 * A dark panel re-declares every theme token at its dark value ON the panel
 * element (the island selector on theme/semantic.css's dark block), and a
 * declaration on an element beats the value it would inherit from <html>.
 * Without this rule every rail override (radius, code text size, a component
 * token) would stop at the panel's edge. Restating them on the panel puts them
 * back on top, and the var()/color-mix expressions (accent, border strength)
 * resolve against the panel's dark palette. `:root[…] […]` is (0,3,0), so it
 * outranks the (0,2,0) island blocks whatever the stylesheet order.
 *
 * Empty when panels follow the page: there is no island to restate into.
 */
export function codePanelOverrideCss(settings: StyleRailSettings): string {
  if (settings.typography.codePanels !== "dark") return "";
  const declarations = Object.entries(styleRailVars(settings))
    .filter(([key, value]) => value !== null && !PAGE_COLOR_VARS.has(key))
    .map(([key, value]) => `  ${key}: ${value};`);
  if (declarations.length === 0) return "";
  return `:root[data-code-panels="dark"] [data-code-surface] {\n${declarations.join("\n")}\n}`;
}

/** The single <style> element the page color overrides live in. */
export const PAGE_COLOR_STYLE_ELEMENT_ID = "docs-style-rail-page-colors";

const NO_COLOR_PICKS: StyleRailSettings["colors"] = { background: null, sidebar: null, text: null };

function pageColorRule(selector: string, settings: StyleRailSettings): string {
  const declarations = Object.entries(styleRailVars(settings))
    .filter(([key, value]) => value !== null && PAGE_COLOR_VARS.has(key))
    .map(([key, value]) => `  ${key}: ${value};`);
  return declarations.length === 0 ? "" : `${selector} {\n${declarations.join("\n")}\n}`;
}

/**
 * The page color overrides, as CSS TEXT scoped by light/dark mode.
 *
 * A color PICK is a literal light color (a cream page, near-black text).
 * Written inline on <html> it outranked the dark theme block, so a theme
 * with picks (the Global theme pins its page, sidebar and text) left dark
 * mode half light. Picks therefore apply to the light page only; the dark
 * page keeps the palette's dark neutrals. The background / sidebar TINTS are
 * mixes over the active palette, so they apply in both modes (in dark they
 * mix into the dark page). `:root:not(.dark):not([data-theme="dark"])` is
 * (0,3,0) and `:root.dark` (0,2,0): both outrank semantic.css's (0,1,0)
 * theme blocks, and neither reaches into a dark code panel, which keeps its
 * own values.
 */
export function pageColorOverrideCss(settings: StyleRailSettings): string {
  const light = pageColorRule(':root:not(.dark):not([data-theme="dark"])', settings);
  const dark = pageColorRule(':root.dark, :root[data-theme="dark"]', { ...settings, colors: NO_COLOR_PICKS });
  return [light, dark].filter(Boolean).join("\n");
}

/** The single <style> element the lane overrides live in. */
export const BLOCK_LAYOUT_STYLE_ELEMENT_ID = "docs-style-rail-block-layout";

/** Named lane widths, resolved to the same values docBlockLayoutClasses uses. */
const BLOCK_LAYOUT_WIDTH_VALUES: Record<BlockLayoutWidth, string> = {
  text: "var(--style-content-width,var(--ds-layout-lane-text))",
  code: "var(--style-code-width,var(--ds-layout-lane-code))",
  wide: "var(--style-wide-width,var(--ds-layout-lane-wide))",
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
/**
 * Block types that take another type's layout override when they have none of
 * their own: a pseudocode panel sits in the same lane as the code panel.
 */
const BLOCK_LAYOUT_FOLLOWS: Readonly<Partial<Record<string, string>>> = { pseudocode: "code" };

export function blockLayoutOverrideCss(settings: StyleRailSettings): string {
  const rules: string[] = [];
  for (const type of DOC_BLOCK_TYPES) {
    const follows = BLOCK_LAYOUT_FOLLOWS[type];
    const override = settings.blockLayout?.[type] ?? (follows ? settings.blockLayout?.[follows] : undefined);
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
 * The static equivalent of applyStyleRailVars + applyBlockLayoutOverrideCss,
 * for pages rendered without the workbench (docs-publish). Returns the
 * attributes applyStyleRailVars writes on <html> and ONE CSS text holding
 * what it writes inline (as a `:root` rule; page colors excluded, exactly as
 * applyStyleRailVars leaves them off the inline style), followed by the page
 * color, code panel and block layout managed-<style> contents.
 */
export function styleRailStaticHead(settings: StyleRailSettings): {
  htmlAttributes: Record<string, string>;
  css: string;
} {
  const declarations = Object.entries(styleRailVars(settings))
    .filter(([key, value]) => value !== null && !PAGE_COLOR_VARS.has(key))
    .map(([key, value]) => `  ${key}: ${value};`);
  const root = declarations.length === 0 ? "" : `:root {\n${declarations.join("\n")}\n}`;
  return {
    htmlAttributes: { "data-code-panels": settings.typography.codePanels },
    css: [root, pageColorOverrideCss(settings), codePanelOverrideCss(settings), blockLayoutOverrideCss(settings)]
      .filter(Boolean)
      .join("\n"),
  };
}
