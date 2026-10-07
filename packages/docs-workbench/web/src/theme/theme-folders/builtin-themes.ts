import type { ThemeDefinition } from "./types";

/**
 * Built-in global themes (the former style-rail presets, plus Default).
 * Compiled-in constants sharing the folder format's shape — custom themes
 * are folders in the repo's themes/ directory.
 */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    source: "builtin",
    // The ONLY built-in while Ford iterates on what the default theme IS.
    // The repo's themes/default/ folder (auto-saved from the rail by the
    // workbench) OVERRIDES this compiled-in fallback when present — see
    // App.tsx resolveThemeById. Empty railDefaults still mean "selecting
    // Default resets the overlay to the saved core theme" via
    // normalizeSettings.
    manifest: { name: "Default", dark: false, railDefaults: {} },
    components: {},
  },
];
