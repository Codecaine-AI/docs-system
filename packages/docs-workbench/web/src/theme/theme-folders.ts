import type { StyleRailSettings } from "../shell/StyleRail";

/**
 * Theme folders — the canonical theme-file format (see
 * docs/20-implementation/40-theming).
 *
 * A theme is a folder: `theme.json` (manifest: name, `base` inheritance,
 * font stacks, optional style-rail defaults) plus `components/<file>.json`
 * token files where every color value is either one string (both modes) or
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

export type ThemeModeValue = string | { light: string; dark: string };

export type ThemeComponents = Record<string, Record<string, ThemeModeValue>>;

export type ThemeManifest = {
  name: string;
  /** Id of the theme this one layers over; missing token values fall through. */
  base?: string;
  /** Dark-mode flag applied when the theme is selected. */
  dark?: boolean;
  /** Font stacks written to the per-surface font tokens (custom stacks allowed). */
  fonts?: Partial<Record<"body" | "heading" | "code" | "number", string>>;
  /** Style-rail knob values applied when the theme is selected (a preset ride-along, not a live link). */
  railDefaults?: Partial<StyleRailSettings>;
};

export type ThemeDefinition = {
  id: string;
  manifest: ThemeManifest;
  components: ThemeComponents;
  source: "builtin" | "repo";
};

/**
 * The closed token vocabulary: component file -> token key -> the CSS vars
 * it writes. Unknown files/keys in a theme are ignored (tolerant reads,
 * same policy as the style-rail settings blob).
 *
 * The file names mirror the frozen 14-type BLOCK VOCABULARY exactly (one
 * theme file per block type; each type's vocabulary doc states its keys),
 * plus four non-block files: shell, surfaces, inline-code (the text mark),
 * and editor-controls.
 */
export const THEME_TOKEN_REGISTRY: Record<string, Record<string, string[]>> = {
  // -- non-block surfaces ---------------------------------------------------
  shell: {
    background: ["--background", "--card", "--popover"],
    sidebar: ["--sidebar"],
    text: [
      "--foreground",
      "--card-foreground",
      "--popover-foreground",
      "--sidebar-foreground",
      "--docs-viewer-text-body",
      "--docs-viewer-text-heading",
    ],
    accent: ["--accent"],
    link: ["--docs-viewer-link"],
  },
  surfaces: {
    border: ["--border", "--input", "--sidebar-border", "--docs-border-default"],
    muted: ["--muted", "--docs-surface-muted"],
    icon: ["--docs-icon-muted"],
  },
  "inline-code": {
    fg: ["--docs-inline-code-fg"],
    bg: ["--docs-inline-code-bg"],
  },
  "editor-controls": {
    highlight: ["--docs-highlight-color"],
    dropLine: ["--docs-dropcursor-color"],
    grip: ["--docs-grip-color"],
  },
  // -- one file per block-vocabulary type ------------------------------------
  paragraph: {
    fg: ["--docs-paragraph-fg"],
  },
  heading: {
    fg: ["--docs-heading-fg"],
  },
  "list-item": {
    marker: ["--docs-list-marker-fg"],
  },
  quote: {
    fg: ["--docs-quote-fg"],
    border: ["--docs-quote-border"],
  },
  code: {
    bg: ["--docs-code-block-bg"],
    border: ["--docs-code-block-border"],
    string: ["--syntax-string"],
    number: ["--syntax-number"],
    boolean: ["--syntax-boolean"],
    null: ["--syntax-null"],
    key: ["--syntax-key"],
  },
  callout: {
    border: ["--docs-viewer-callout-border"],
    fill: ["--docs-viewer-callout-fill"],
    fg: ["--docs-callout-fg"],
  },
  divider: {
    color: ["--docs-divider-color"],
  },
  image: {
    border: ["--docs-image-border"],
    caption: ["--docs-image-caption-fg"],
  },
  video: {
    border: ["--docs-video-border"],
    caption: ["--docs-video-caption-fg"],
  },
  "file-tree": {
    border: ["--docs-file-tree-border"],
    note: ["--docs-file-tree-note-fg"],
  },
  "structured-table": {
    border: ["--docs-table-border"],
    headerBg: ["--docs-table-header-bg"],
    headerFg: ["--docs-table-header-fg"],
  },
  "interaction-surface": {
    border: ["--docs-interaction-border"],
    bg: ["--docs-interaction-bg"],
  },
  mermaid: {
    border: ["--docs-mermaid-border"],
    bg: ["--docs-mermaid-bg"],
  },
  canvas: {
    border: ["--docs-canvas-border"],
  },
};

const FONT_VARS: Record<string, string[]> = {
  body: ["--font-tx02"],
  heading: ["--font-display", "--style-heading-font"],
  code: ["--docs-font-code"],
  number: ["--docs-font-numeric"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readModeValue(value: unknown): { light: string; dark: string } | null {
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
    manifest.railDefaults = manifestRaw.railDefaults as Partial<StyleRailSettings>;
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
      merged.manifest.railDefaults = {
        ...merged.manifest.railDefaults,
        ...layer.manifest.railDefaults,
      };
    }
    for (const [file, tokens] of Object.entries(layer.components)) {
      merged.components[file] = { ...merged.components[file], ...tokens };
    }
  }
  return merged;
}

/** Compiles a RESOLVED theme into the CSS injected as the theme layer. */
export function compileThemeCss(theme: ThemeDefinition): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [file, tokens] of Object.entries(theme.components)) {
    for (const [key, value] of Object.entries(tokens)) {
      const vars = THEME_TOKEN_REGISTRY[file]?.[key];
      if (!vars) continue;
      const mode = readModeValue(value);
      if (!mode) continue;
      for (const cssVar of vars) {
        light.push(`  ${cssVar}: ${mode.light};`);
        dark.push(`  ${cssVar}: ${mode.dark};`);
      }
    }
  }
  for (const [surface, stack] of Object.entries(theme.manifest.fonts ?? {})) {
    for (const cssVar of FONT_VARS[surface] ?? []) {
      light.push(`  ${cssVar}: ${stack};`);
      dark.push(`  ${cssVar}: ${stack};`);
    }
  }
  const blocks: string[] = [];
  if (light.length > 0) blocks.push(`:root, [data-theme="light"] {\n${light.join("\n")}\n}`);
  if (dark.length > 0) blocks.push(`[data-theme="dark"] {\n${dark.join("\n")}\n}`);
  return blocks.join("\n\n");
}

const THEME_STYLE_TAG_ID = "docs-theme-folder-css";

/** Injects (or clears, for null) the resolved theme's CSS layer. */
export function applyThemeCss(theme: ThemeDefinition | null): void {
  let tag = document.getElementById(THEME_STYLE_TAG_ID);
  if (!theme) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = THEME_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = compileThemeCss(theme);
}

/**
 * Built-in global themes (the former style-rail presets, plus Default).
 * Compiled-in constants sharing the folder format's shape — custom themes
 * are folders in the repo's themes/ directory.
 */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    source: "builtin",
    // Empty railDefaults are NOT omitted: normalizeSettings({}) yields the
    // stock settings, so selecting Default is a full overlay reset.
    manifest: { name: "Default", dark: false, railDefaults: {} },
    components: {},
  },
  {
    id: "dark",
    source: "builtin",
    // The same stock look with the dark palette — themes are being figured
    // out iteratively (Ford), so the built-in catalogue stays minimal;
    // richer looks belong in repo themes/ folders.
    manifest: { name: "Dark", dark: true, railDefaults: {} },
    components: {},
  },
];
