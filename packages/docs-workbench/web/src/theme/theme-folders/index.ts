/**
 * Theme folders — the canonical theme-file format (see
 * docs/20-implementation/40-theming).
 *
 * A theme is a folder: `theme.json` (manifest: name, `base` inheritance,
 * font stacks, optional style-rail defaults) plus `components/<file>.json`
 * token files where every token value is either one string (both modes) or
 * a `{ light, dark }` pair. The loader validates values against
 * THEME_TOKEN_REGISTRY — the closed map from component file + key to the
 * tier-2 CSS vars of the canonical contract (theme/semantic.css) — and
 * compiles one <style> tag with a light and a dark block, so themes are
 * purely an alternative SOURCE for tier-2 tokens; component code and the
 * style-rail overlay are untouched (inline rail overrides still win over
 * any theme).
 *
 * BUILT-IN themes are compiled-in constants with the same shape (they are
 * not user-editable, so they don't need to be files); CUSTOM themes live
 * as folders under the repo's `themes/` directory, served by docs-server
 * (`GET/POST /api/themes`).
 */

export type { ThemeModeValue, ThemeComponents, StyleRailDefaults, ThemeManifest, ThemeDefinition, ThemeTokenDefinition } from "./types";
export { THEME_TOKEN_REGISTRY } from "./token-registry";
export { readThemeDefinition, resolveThemeChain } from "./definition";
export { compileThemeCss, applyThemeCss } from "./css";
export { BUILTIN_THEMES } from "./builtin-themes";
