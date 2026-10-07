import { readRepoThemeChain } from './theme-source' with { type: 'macro' };
import { compileThemeCss, readThemeDefinition, resolveThemeChain, type ThemeDefinition } from '../../docs-workbench/web/src/theme/theme-folders';
import { DEFAULT_STYLE_RAIL_SETTINGS, normalizeSettings, styleRailStaticHead } from '../../docs-workbench/web/src/shared/style-rail-settings';

export type DocsThemeHead = {
  /** Attributes for the host page's <html> element, e.g. `data-code-panels="dark"`. */
  htmlAttributes: Record<string, string>;
  /** CSS for one <style> element in <head>, after docs.css. */
  css: string;
};

// Inlined at build time from themes/default (theme.json + components/*.json).
const DEFAULT_THEME_CHAIN = readRepoThemeChain('default');

/** A theme folder as data: theme.json as `manifest`, components/<name>.json keyed by name. */
export type DocsThemeInput = {id?: string; manifest: unknown; components?: Record<string, unknown>};

/**
 * A theme as a static page head: what the Docs workbench applies at runtime
 * (applyStyleRailVars + the compiled theme layer), so a published page
 * renders like the workbench read view. Pair it with docs.css. With no
 * argument it is the repo Default theme (`themes/default`); pass a theme
 * folder's data (for example the machine's Global theme, copied into the
 * host repo) to publish that theme instead. A `base` the input names
 * resolves against the bundled repo themes. The dark page follows
 * `data-theme="dark"` or `.dark` on an ancestor; the host owns that switch.
 */
export function docsThemeHead(input?: DocsThemeInput): DocsThemeHead {
  const definitions = new Map<string, ThemeDefinition>();
  for (const {id, raw} of DEFAULT_THEME_CHAIN) {
    const definition = readThemeDefinition(id, raw, 'repo');
    if (definition) definitions.set(id, definition);
  }
  let selected = definitions.get('default')!;
  if (input) {
    const id = input.id ?? 'host';
    const definition = readThemeDefinition(id, {manifest: input.manifest, components: input.components ?? {}}, 'repo');
    if (!definition) throw new Error('docsThemeHead: the theme input is not a theme folder (theme.json missing or invalid)');
    selected = definition;
  }
  const theme = resolveThemeChain(selected, id => definitions.get(id));
  const settings = normalizeSettings(theme.manifest.railDefaults, DEFAULT_STYLE_RAIL_SETTINGS);
  const rail = styleRailStaticHead(settings);
  return {htmlAttributes: rail.htmlAttributes, css: [compileThemeCss(theme), rail.css].filter(Boolean).join('\n')};
}
