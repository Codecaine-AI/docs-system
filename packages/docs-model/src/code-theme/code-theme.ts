/**
 * Code themes — ONE central definition of how every code surface in the
 * docs looks (code blocks, state shapes, signatures), independent of the
 * page theme. A code theme is a small normalized file: panel colors plus
 * one color per syntax ROLE (the `--syntax-*` vocabulary the viewer's
 * code.css consumes). Built-ins ship as constants; imported themes come
 * from the user's VS Code / Cursor theme (./vscode-import.ts) and live as
 * `<codeThemesRoot>/<id>.json` (docs-server code-themes.ts).
 *
 * Pure data + validation: no fs, no DOM, safe in every package.
 */

export const CODE_THEME_FORMAT_VERSION = 1;

/** Syntax roles, in display order. Each maps 1:1 to a `--syntax-<role>` var. */
export const CODE_THEME_ROLES = [
  "punctuation",
  "keyword",
  "control",
  "function",
  "type",
  "key",
  "string",
  "number",
  "boolean",
  "null",
  "comment",
  "regex",
  "tag",
  "constant",
  "selector",
] as const;

export type CodeThemeRole = (typeof CODE_THEME_ROLES)[number];

/** Panel chrome colors. */
export const CODE_THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "gutterForeground",
  "gutterBackground",
  "border",
  "selection",
  "headerForeground",
  "langForeground",
  "zebra",
  "rule",
] as const;

export type CodeThemeColorKey = (typeof CODE_THEME_COLOR_KEYS)[number];

export type CodeThemeType = "dark" | "light";
export type CodeThemeFontStyle = "italic" | "bold" | "bold italic";
export type CodeThemeEditor = "builtin" | "cursor" | "vscode" | "file";

export type CodeThemeSource = {
  editor: CodeThemeEditor;
  /** The editor's theme id (colorThemeData.id) or the file's theme name. */
  themeId?: string;
  /** Human label as the editor shows it. */
  label?: string;
  /** The `workbench.colorTheme` settings value, when known. */
  settingsId?: string;
  /** Absolute path of the source theme file (editor: "file"). */
  path?: string;
  /** ISO timestamp of the import. */
  importedAt?: string;
};

export type CodeTheme = {
  version: typeof CODE_THEME_FORMAT_VERSION;
  /** Slug; for stored themes the file name (`<id>.json`) is authoritative. */
  id: string;
  name: string;
  type: CodeThemeType;
  source: CodeThemeSource;
  colors: Record<CodeThemeColorKey, string>;
  roles: Record<CodeThemeRole, string>;
  fontStyle?: Partial<Record<CodeThemeRole, CodeThemeFontStyle>>;
};

/** Listing shape (GET /api/code-themes, `docs code-theme list`). */
export type CodeThemeListEntry = {
  id: string;
  name: string;
  type: CodeThemeType;
  builtin?: boolean;
  source: CodeThemeSource;
};

const CODE_THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidCodeThemeId(id: string): boolean {
  return CODE_THEME_ID_RE.test(id);
}

/** Lowercase slug of arbitrary text ("Default Dark+" -> "default-dark-plus"). */
export function slugifyCodeThemeId(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "code-theme";
}

/**
 * Normalizes a CSS hex color to uppercase `#RRGGBB` or `#RRGGBBAA`
 * (`#RGB` / `#RGBA` expand). Anything else returns null.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((ch) => ch + ch).join("");
  }
  if (hex.length !== 6 && hex.length !== 8) return null;
  return `#${hex.toUpperCase()}`;
}

/** Returns `#RRGGBB` with alpha `alphaHex` (two hex digits) applied. */
export function withAlpha(color: string, alphaHex: string): string {
  return `${color.slice(0, 7)}${alphaHex.toUpperCase()}`;
}

/** Relative luminance (0..1) of a normalized hex color, ignoring alpha. */
export function hexLuminance(color: string): number {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** VS Code Dark+ — the built-in dark code theme. */
export const DARK_PLUS_CODE_THEME: CodeTheme = {
  version: CODE_THEME_FORMAT_VERSION,
  id: "dark-plus",
  name: "Dark+",
  type: "dark",
  source: { editor: "builtin", themeId: "vs-dark vscode-theme-defaults-themes-dark_plus-json", label: "Dark+" },
  colors: {
    background: "#1E1E1E",
    foreground: "#D4D4D4",
    gutterForeground: "#858585",
    gutterBackground: "#1E1E1E",
    border: "#303031",
    selection: "#264F78",
    headerForeground: "#C6C6C6",
    langForeground: "#569CD6",
    zebra: "#D4D4D40A",
    rule: "#404040",
  },
  roles: {
    punctuation: "#D4D4D4",
    keyword: "#569CD6",
    control: "#C586C0",
    function: "#DCDCAA",
    type: "#4EC9B0",
    key: "#9CDCFE",
    string: "#CE9178",
    number: "#B5CEA8",
    boolean: "#569CD6",
    null: "#569CD6",
    comment: "#6A9955",
    regex: "#D16969",
    tag: "#569CD6",
    constant: "#4FC1FF",
    selector: "#D7BA7D",
  },
};

/** VS Code Light+ — the built-in light code theme. */
export const LIGHT_PLUS_CODE_THEME: CodeTheme = {
  version: CODE_THEME_FORMAT_VERSION,
  id: "light-plus",
  name: "Light+",
  type: "light",
  source: { editor: "builtin", themeId: "vs vscode-theme-defaults-themes-light_plus-json", label: "Light+" },
  colors: {
    background: "#FFFFFF",
    foreground: "#000000",
    gutterForeground: "#237893",
    gutterBackground: "#FFFFFF",
    border: "#D4D4D4",
    selection: "#ADD6FF",
    headerForeground: "#0B216F",
    langForeground: "#0000FF",
    zebra: "#0000000A",
    rule: "#D3D3D3",
  },
  roles: {
    punctuation: "#000000",
    keyword: "#0000FF",
    control: "#AF00DB",
    function: "#795E26",
    type: "#267F99",
    key: "#001080",
    string: "#A31515",
    number: "#098658",
    boolean: "#0000FF",
    null: "#0000FF",
    comment: "#008000",
    regex: "#811F3F",
    tag: "#800000",
    constant: "#0070C1",
    selector: "#800000",
  },
};

export const BUILTIN_CODE_THEMES: readonly CodeTheme[] = [DARK_PLUS_CODE_THEME, LIGHT_PLUS_CODE_THEME];

/** The default code theme for a code-surface type (dark panels use Dark+). */
export function baseCodeTheme(type: CodeThemeType): CodeTheme {
  return type === "light" ? LIGHT_PLUS_CODE_THEME : DARK_PLUS_CODE_THEME;
}

export function builtinCodeTheme(id: string): CodeTheme | null {
  return BUILTIN_CODE_THEMES.find((theme) => theme.id === id) ?? null;
}

export function codeThemeListEntry(theme: CodeTheme): CodeThemeListEntry {
  const entry: CodeThemeListEntry = { id: theme.id, name: theme.name, type: theme.type, source: theme.source };
  if (theme.source.editor === "builtin") entry.builtin = true;
  return entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const EDITORS: readonly CodeThemeEditor[] = ["builtin", "cursor", "vscode", "file"];
const FONT_STYLES: readonly CodeThemeFontStyle[] = ["italic", "bold", "bold italic"];

/**
 * Reads untrusted JSON (a hand-edited or older file) into a complete
 * CodeTheme: unknown keys drop, invalid or missing colors fill from the
 * base theme of the same type. Returns null only when the value is not a
 * theme at all (not an object, or no usable roles/colors object).
 */
export function parseCodeTheme(value: unknown, idOverride?: string): CodeTheme | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.roles) && !isRecord(value.colors)) return null;
  const type: CodeThemeType = value.type === "light" ? "light" : "dark";
  const base = baseCodeTheme(type);
  const id =
    idOverride ?? (typeof value.id === "string" && isValidCodeThemeId(value.id) ? value.id : null);
  if (!id) return null;

  const rawColors = isRecord(value.colors) ? value.colors : {};
  const colors = { ...base.colors };
  for (const key of CODE_THEME_COLOR_KEYS) {
    const color = normalizeHexColor(rawColors[key]);
    if (color) colors[key] = color;
  }
  const rawRoles = isRecord(value.roles) ? value.roles : {};
  const roles = { ...base.roles };
  for (const role of CODE_THEME_ROLES) {
    const color = normalizeHexColor(rawRoles[role]);
    if (color) roles[role] = color;
  }

  const rawSource = isRecord(value.source) ? value.source : {};
  const source: CodeThemeSource = {
    editor: EDITORS.includes(rawSource.editor as CodeThemeEditor)
      ? (rawSource.editor as CodeThemeEditor)
      : "file",
  };
  for (const key of ["themeId", "label", "settingsId", "path", "importedAt"] as const) {
    if (typeof rawSource[key] === "string") source[key] = rawSource[key] as string;
  }

  const theme: CodeTheme = {
    version: CODE_THEME_FORMAT_VERSION,
    id,
    name: typeof value.name === "string" && value.name.trim() ? value.name : id,
    type,
    source,
    colors,
    roles,
  };
  if (isRecord(value.fontStyle)) {
    const fontStyle: NonNullable<CodeTheme["fontStyle"]> = {};
    for (const role of CODE_THEME_ROLES) {
      const style = value.fontStyle[role];
      if (FONT_STYLES.includes(style as CodeThemeFontStyle)) fontStyle[role] = style as CodeThemeFontStyle;
    }
    if (Object.keys(fontStyle).length > 0) theme.fontStyle = fontStyle;
  }
  return theme;
}
