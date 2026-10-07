import type { ThemeDefinition, ThemeManifest, StyleRailDefaults, ThemeComponents, ThemeModeValue } from "./types";
import { THEME_TOKEN_REGISTRY } from "./token-registry";

export const FONT_VARS: Record<string, string[]> = {
  body: ["--font-tx02"],
  heading: ["--font-display", "--style-heading-font"],
  code: ["--docs-font-code"],
  number: ["--docs-font-numeric"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readModeValue(value: unknown): { light: string; dark: string } | null {
  if (typeof value === "string" && value.trim()) return { light: value, dark: value };
  if (isRecord(value) && typeof value.light === "string" && typeof value.dark === "string") {
    return { light: value.light, dark: value.dark };
  }
  return null;
}

/** Tolerant reader for a wire/file theme payload; unknown fields drop, bad values skip. */
export function readThemeDefinition(
  id: string,
  raw: unknown,
  source: ThemeDefinition["source"],
): ThemeDefinition | null {
  if (!isRecord(raw)) return null;
  const manifestRaw = isRecord(raw.manifest) ? raw.manifest : raw;
  const name = typeof manifestRaw.name === "string" && manifestRaw.name.trim() ? manifestRaw.name : id;
  const manifest: ThemeManifest = { name };
  if (typeof manifestRaw.base === "string") manifest.base = manifestRaw.base;
  if (typeof manifestRaw.dark === "boolean") manifest.dark = manifestRaw.dark;
  if (isRecord(manifestRaw.fonts)) {
    const fonts: ThemeManifest["fonts"] = {};
    for (const surface of Object.keys(FONT_VARS) as Array<keyof typeof FONT_VARS>) {
      const stack = manifestRaw.fonts[surface];
      if (typeof stack === "string" && stack.trim()) fonts[surface as "body"] = stack;
    }
    if (Object.keys(fonts).length > 0) manifest.fonts = fonts;
  }
  if (isRecord(manifestRaw.railDefaults)) {
    manifest.railDefaults = manifestRaw.railDefaults as StyleRailDefaults;
  }
  const components: ThemeComponents = {};
  const componentsRaw = isRecord(raw.components) ? raw.components : {};
  for (const [file, tokens] of Object.entries(componentsRaw)) {
    if (!THEME_TOKEN_REGISTRY[file] || !isRecord(tokens)) continue;
    const kept: Record<string, ThemeModeValue> = {};
    for (const [key, value] of Object.entries(tokens)) {
      if (!THEME_TOKEN_REGISTRY[file][key]) continue;
      const mode = readModeValue(value);
      if (mode) kept[key] = mode.light === mode.dark ? mode.light : mode;
    }
    if (Object.keys(kept).length > 0) components[file] = kept;
  }
  return { id, manifest, components, source };
}

/**
 * Theme inheritance is leaf-wise for rail settings, just like it is for
 * component tokens. A child that changes one annotate color, one layout
 * dimension, or one block lane must not discard the base theme's sibling
 * settings in the same group.
 */
function mergeRailDefaults(
  base: StyleRailDefaults | undefined,
  override: StyleRailDefaults,
): StyleRailDefaults {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) {
    const inherited = merged[key];
    merged[key] = isRecord(inherited) && isRecord(value)
      ? mergeRailDefaults(inherited as StyleRailDefaults, value as StyleRailDefaults)
      : value;
  }
  return merged as StyleRailDefaults;
}

/** Flattens a base chain (base-first) into one definition; cycles/missing bases just stop the walk. */
export function resolveThemeChain(
  theme: ThemeDefinition,
  lookup: (id: string) => ThemeDefinition | undefined,
): ThemeDefinition {
  const chain: ThemeDefinition[] = [];
  const seen = new Set<string>();
  let current: ThemeDefinition | undefined = theme;
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.manifest.base ? lookup(current.manifest.base) : undefined;
  }
  const merged: ThemeDefinition = {
    id: theme.id,
    source: theme.source,
    manifest: { name: theme.manifest.name },
    components: {},
  };
  for (const layer of chain) {
    if (layer.manifest.dark !== undefined) merged.manifest.dark = layer.manifest.dark;
    if (layer.manifest.fonts) {
      merged.manifest.fonts = { ...merged.manifest.fonts, ...layer.manifest.fonts };
    }
    if (layer.manifest.railDefaults) {
      merged.manifest.railDefaults = mergeRailDefaults(
        merged.manifest.railDefaults,
        layer.manifest.railDefaults,
      );
    }
    for (const [file, tokens] of Object.entries(layer.components)) {
      merged.components[file] = { ...merged.components[file], ...tokens };
    }
  }
  return merged;
}
