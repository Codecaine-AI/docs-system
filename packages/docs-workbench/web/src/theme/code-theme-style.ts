import { codeThemeCssVars, type CodeTheme } from "@codecaine-ai/docs-model/code-theme";

import { styleRailVars, type StyleRailSettings } from "../shell/StyleRail";

/**
 * The ACTIVE code theme (GET /api/code-themes/active) applied to code panes.
 *
 * One managed <style> holds `codeThemeCssVars(theme)` scoped to
 * `[data-code-surface]`, so the central code style reaches every code pane
 * (code blocks, state-shape / interaction-surface code panes) whatever the
 * page theme is:
 *   - Code panels "dark": always, on every pane (the dark island); on a
 *     dark page the panel surface drops to the inset color (below).
 *   - Code panels "page": only when the theme's type matches the page — a
 *     dark code theme on a dark page, a light one on a light page — else
 *     the page theme's own code tokens stay.
 *
 * Precedence, by specificity (independent of stylesheet order):
 *   - semantic.css / notion-palette.css / the compiled theme layer's dark
 *     island blocks are (0,2,0); the rail's mirrored panel overrides
 *     (StyleRail.tsx codePanelOverrideCss) are (0,3,0). These rules double
 *     the panel attribute to reach (0,4,0)+, so the code theme beats both.
 *   - An EXPLICIT rail override of one of these vars (a syntax role or a
 *     code chrome color set in the rail) must still win, so any var the
 *     rail currently sets is left out here and the rail's value applies.
 *
 * With no theme (static export, host without the API, fetch failure) the
 * element is emptied and the stylesheets' built-in Dark+ / Light+ tokens
 * remain.
 */

export const CODE_THEME_STYLE_ELEMENT_ID = "docs-code-theme";

const PANE = "[data-code-surface][data-code-surface]";

function selectorFor(theme: CodeTheme, settings: StyleRailSettings): string {
  if (settings.typography.codePanels === "dark") return `:root[data-code-panels="dark"] ${PANE}`;
  return theme.type === "dark"
    ? `:root[data-code-panels="page"][data-theme="dark"] ${PANE}`
    : `:root[data-code-panels="page"]:not([data-theme="dark"]) ${PANE}`;
}

/**
 * Code panels "dark" on the DARK page: the panel surface drops below the page
 * (Primer canvas-inset, Primer rule — theme/notion-palette.css --palette-inset
 * / --palette-rule), so a dark panel still reads as a distinct panel on a dark
 * page. Syntax colors and text stay the code theme's. One attribute more than
 * the theme rule (0,5,0), so it wins on a dark page; vars an explicit rail
 * override sets are left out, so the rail keeps winning. theme/semantic.css
 * carries the same values for when no code theme is loaded.
 */
const DARK_PAGE_PANEL_VARS: Record<string, string> = {
  "--docs-code-block-bg": "var(--palette-inset)",
  "--docs-code-gutter-bg": "var(--palette-inset)",
  "--docs-code-block-border": "var(--palette-rule)",
};

function rule(selector: string, vars: Record<string, string>, railVars: Record<string, string | null>): string {
  const declarations = Object.entries(vars)
    .filter(([name]) => railVars[name] == null)
    .map(([name, value]) => `  ${name}: ${value};`);
  return declarations.length === 0 ? "" : `${selector} {\n${declarations.join("\n")}\n}`;
}

/** The managed rule's CSS text ("" when there is nothing to apply). */
export function codeThemeStyleCss(theme: CodeTheme | null, settings: StyleRailSettings): string {
  if (!theme) return "";
  const railVars = styleRailVars(settings);
  const themeRule = rule(selectorFor(theme, settings), codeThemeCssVars(theme), railVars);
  if (!themeRule || settings.typography.codePanels !== "dark") return themeRule;
  const darkPage = rule(
    `:root[data-code-panels="dark"]:is(.dark, [data-theme="dark"]) ${PANE}`,
    DARK_PAGE_PANEL_VARS,
    railVars,
  );
  return darkPage ? `${themeRule}\n${darkPage}` : themeRule;
}

/** Writes (or empties) the managed code-theme <style> element. */
export function applyCodeThemeStyle(theme: CodeTheme | null, settings: StyleRailSettings): void {
  let element = document.getElementById(CODE_THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = CODE_THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  const css = codeThemeStyleCss(theme, settings);
  if (element.textContent !== css) element.textContent = css;
}
