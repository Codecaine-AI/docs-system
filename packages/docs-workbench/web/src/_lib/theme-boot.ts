import { ApiError, GLOBAL_THEME_ID, getTheme } from "../data/api";
import { BUILTIN_THEMES, readThemeDefinition, resolveThemeChain, type ThemeDefinition, type ThemeManifest } from "../theme/theme-folders";
import type { StyleRailSettings } from "../shared/style-rail-settings";

/**
 * Resolve a theme id to its flattened definition: built-ins from the
 * compiled-in catalogue, anything else fetched from the repo's themes/
 * folder via the server. Base chains resolve against BUILT-INS only (a repo
 * theme basing on another repo theme is a documented v1 limitation).
 */
export async function resolveThemeById(id: string): Promise<ThemeDefinition | null> {
  // Repo folder FIRST: the active theme folder is the durable rail authority
  // and overrides the compiled-in fallback of the same id.
  let definition: ThemeDefinition | null = null;
  try {
    // Static exports generate data/theme.json behind this same helper. Do not
    // skip it merely because there is no live theme route: the exported repo
    // theme is still the durable authority for that build.
    const { theme } = await getTheme(id);
    definition = readThemeDefinition(theme.id, theme, "repo");
  } catch {
    definition = null;
  }
  definition ??= BUILTIN_THEMES.find((theme) => theme.id === id) ?? null;
  if (!definition) return null;
  return flattenTheme(definition);
}

/**
 * The shared GLOBAL theme, as it renders before anyone has saved it: stock
 * rail settings and no token files. The first rail change writes it.
 */
export function stockGlobalTheme(): ThemeDefinition {
  return {
    id: GLOBAL_THEME_ID,
    source: "builtin",
    manifest: { name: "Global", dark: false, railDefaults: {} },
    components: {},
  };
}

/**
 * Reads the shared global theme. A 404 means "not created yet": render stock
 * and let the first change create it (`writable`). Any OTHER failure also
 * renders stock but is NOT writable — a transient error must never let this
 * tab overwrite the one theme every project shares with stock-plus-one-knob.
 */
export async function resolveGlobalTheme(): Promise<{ theme: ThemeDefinition; writable: boolean }> {
  try {
    const { theme } = await getTheme(GLOBAL_THEME_ID);
    const definition = readThemeDefinition(GLOBAL_THEME_ID, theme, "repo");
    if (definition) return { theme: flattenTheme(definition), writable: true };
    return { theme: stockGlobalTheme(), writable: false };
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return { theme: stockGlobalTheme(), writable: missing };
  }
}

export function flattenTheme(definition: ThemeDefinition): ThemeDefinition {
  const resolved = resolveThemeChain(definition, (baseId) =>
    BUILTIN_THEMES.find((theme) => theme.id === baseId),
  );
  // resolveThemeChain deliberately flattens the runtime definition. Retain
  // the child folder's base id for write-back so editing a derived theme does
  // not silently sever its inheritance relationship.
  if (definition.manifest.base) resolved.manifest.base = definition.manifest.base;
  return resolved;
}

/**
 * The repo-side shape of the style rail's settings: one `POST /api/themes`
 * body writing `themes/<active-id>/theme.json` (+ `components/*.json`).
 *
 * The split is deliberate. Scalar knobs go in `manifest.railDefaults` —
 * that block IS the repo's style-settings file, and the loader
 * (theme-folders.ts) hands it back on every read, so it becomes the rail
 * baseline for a locked serve, a static export, or a fresh browser.
 * Per-component token overrides go out as real token FILES instead, since
 * those compile into the theme's CSS layer and reach consumers that way;
 * `railDefaults.components` is emptied so the same tokens are not persisted
 * twice under two different mechanisms.
 */
export function themeWritePayload(
  settings: StyleRailSettings,
  dark: boolean,
  themeId: string,
  activeTheme?: Pick<ThemeDefinition, "manifest" | "components">,
) {
  const { components, ...railDefaults } = settings;
  const preservedManifest: ThemeManifest = {
    ...(activeTheme?.manifest ?? {
      name: themeId === "default" ? "Default" : themeId === GLOBAL_THEME_ID ? "Global" : themeId,
    }),
  };
  delete preservedManifest.railDefaults;
  delete preservedManifest.dark;
  // A settings component is sparse: changing one token must not replace the
  // whole active component file and erase its untouched sibling tokens.
  // Only files with rail edits are included, preserving the server's
  // additive behavior for every untouched file.
  const mergedComponents = Object.fromEntries(
    Object.entries(components).map(([file, overrides]) => [
      file,
      { ...(activeTheme?.components[file] ?? {}), ...overrides },
    ]),
  );
  return {
    id: themeId,
    manifest: {
      ...preservedManifest,
      dark,
      railDefaults: { ...railDefaults, components: {} },
    },
    components: mergedComponents,
  };
}

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

