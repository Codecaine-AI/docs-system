/**
 * Compiles a code theme into CSS custom-property declarations — the
 * `--syntax-*` role vars and the `--docs-code-*` panel chrome vars the
 * viewer's code surfaces consume. Pure: the caller decides where the
 * declarations go (a style attribute, a scoped rule, a stylesheet).
 */

import { CODE_THEME_ROLES, type CodeTheme, type CodeThemeColorKey } from "./code-theme";

/**
 * Panel color -> CSS var. `zebra` is deliberately absent: code blocks never
 * stripe (stripes make code harder to read), so a theme's zebra color is
 * kept in the file format but never compiled to CSS.
 */
export const CODE_THEME_COLOR_VARS: Record<Exclude<CodeThemeColorKey, "zebra">, string> = {
  background: "--docs-code-block-bg",
  foreground: "--docs-code-fg",
  gutterForeground: "--docs-code-gutter-fg",
  gutterBackground: "--docs-code-gutter-bg",
  border: "--docs-code-block-border",
  selection: "--docs-code-selection",
  headerForeground: "--docs-code-header-fg",
  langForeground: "--docs-code-lang-fg",
  rule: "--docs-code-rule",
};

/**
 * `{ "--syntax-keyword": "#569CD6", "--docs-code-block-bg": "#1E1E1E", … }`.
 * Roles with a font style also emit `--syntax-<role>-font-style`
 * (`italic` | `normal`) and `--syntax-<role>-font-weight` (`700` |
 * `normal`); roles without one emit nothing, so CSS should read them with
 * a fallback: `font-style: var(--syntax-comment-font-style, normal)`.
 */
export function codeThemeCssVars(theme: CodeTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of CODE_THEME_ROLES) {
    vars[`--syntax-${role}`] = theme.roles[role];
  }
  for (const [key, cssVar] of Object.entries(CODE_THEME_COLOR_VARS) as [Exclude<CodeThemeColorKey, "zebra">, string][]) {
    vars[cssVar] = theme.colors[key];
  }
  for (const role of CODE_THEME_ROLES) {
    const style = theme.fontStyle?.[role];
    if (!style) continue;
    vars[`--syntax-${role}-font-style`] = style.includes("italic") ? "italic" : "normal";
    vars[`--syntax-${role}-font-weight`] = style.includes("bold") ? "700" : "normal";
  }
  return vars;
}

/** Serializes `codeThemeCssVars` as a declaration block body (`--a: #fff; …`). */
export function codeThemeCssText(theme: CodeTheme): string {
  return Object.entries(codeThemeCssVars(theme))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}
