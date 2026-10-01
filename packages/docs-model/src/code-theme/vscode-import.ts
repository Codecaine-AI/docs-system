/**
 * VS Code / Cursor theme -> normalized code theme. Pure: the caller hands
 * in an already-loaded theme (docs-server editor-themes.ts reads it from
 * the editor's state DB or resolves a theme file's `include` chain).
 *
 * Two input shapes are accepted, often mixed:
 *   - the editor's RESOLVED active theme (`colorThemeData` in
 *     state.vscdb): themeTokenColors, colorMap, semanticTokenRules,
 *     themeSemanticHighlighting, id ("vs-dark …"), label, settingsId;
 *   - a theme FILE after include resolution: tokenColors, colors,
 *     semanticTokenColors, semanticHighlighting, type, name.
 *
 * Each role resolves through an ordered list of representative TextMate
 * scopes (ROLE_SCOPES); the first scope the theme colors wins. Gaps fill
 * from the editor foreground (what the editor itself would show), panel
 * colors missing from the color map fill from the base theme of the same
 * type (Dark+ / Light+).
 */

import {
  CODE_THEME_FORMAT_VERSION,
  CODE_THEME_ROLES,
  baseCodeTheme,
  hexLuminance,
  normalizeHexColor,
  withAlpha,
  type CodeTheme,
  type CodeThemeColorKey,
  type CodeThemeFontStyle,
  type CodeThemeRole,
  type CodeThemeSource,
  type CodeThemeType,
} from "./code-theme";
import { resolveScopeStyle, ruleSelectors, type ScopeTarget, type TextMateRule } from "./textmate";

export type VscodeSemanticTokenRule = {
  _selector?: unknown;
  _style?: {
    _foreground?: string | null;
    _bold?: boolean | null;
    _italic?: boolean | null;
  };
};

export type VscodeSemanticTokenColor =
  | string
  | { foreground?: string; fontStyle?: string; bold?: boolean; italic?: boolean };

export type VscodeThemeData = {
  id?: string;
  label?: string;
  settingsId?: string;
  name?: string;
  type?: string;
  themeTokenColors?: TextMateRule[];
  tokenColors?: TextMateRule[];
  colorMap?: Record<string, string>;
  colors?: Record<string, string>;
  semanticTokenRules?: VscodeSemanticTokenRule[];
  semanticTokenColors?: Record<string, VscodeSemanticTokenColor>;
  themeSemanticHighlighting?: boolean;
  semanticHighlighting?: boolean;
};

/** Representative scopes per role, in priority order. */
export const ROLE_SCOPES: Record<Exclude<CodeThemeRole, "punctuation">, readonly ScopeTarget[]> = {
  keyword: [{ scope: "storage.type" }, { scope: "storage.modifier" }, { scope: "keyword.operator.new" }],
  control: [{ scope: "keyword.control" }, { scope: "keyword.control.import" }],
  function: [{ scope: "entity.name.function" }, { scope: "support.function" }],
  type: [
    { scope: "entity.name.type" },
    { scope: "support.type" },
    { scope: "support.class" },
    { scope: "entity.name.class" },
  ],
  key: [
    { scope: "variable" },
    { scope: "variable.other.property" },
    { scope: "support.type.property-name.json", parents: ["source.json"] },
    { scope: "meta.object-literal.key" },
  ],
  string: [{ scope: "string" }],
  number: [{ scope: "constant.numeric" }],
  boolean: [{ scope: "constant.language.boolean" }, { scope: "constant.language" }],
  null: [{ scope: "constant.language.null" }, { scope: "constant.language" }],
  comment: [{ scope: "comment" }],
  regex: [{ scope: "string.regexp" }],
  tag: [{ scope: "entity.name.tag" }],
  constant: [{ scope: "variable.other.constant" }, { scope: "variable.other.enummember" }],
  selector: [{ scope: "entity.other.attribute-name.class.css", parents: ["source.css"] }],
};

/**
 * Semantic token selectors that map cleanly onto one role (no language
 * suffix). Honored only when the theme enables semantic highlighting; the
 * first selector the theme defines wins, and it overrides the TextMate
 * color (as semantic tokens do in the editor).
 */
export const ROLE_SEMANTIC_SELECTORS: Partial<Record<CodeThemeRole, readonly string[]>> = {
  function: ["function", "method"],
  type: ["type", "class", "interface"],
  key: ["property"],
  constant: ["variable.readonly", "enumMember"],
  string: ["string"],
  number: ["number"],
  regex: ["regexp"],
  comment: ["comment"],
};

/** Panel color sources: workbench color keys in priority order. */
const COLOR_SOURCES: Partial<Record<CodeThemeColorKey, readonly string[]>> = {
  background: ["editor.background"],
  foreground: ["editor.foreground"],
  gutterForeground: ["editorLineNumber.foreground"],
  gutterBackground: ["editorGutter.background", "editor.background"],
  border: ["widget.border", "editorWidget.border", "editorGroup.border", "panel.border"],
  selection: ["editor.selectionBackground"],
  headerForeground: ["editorLineNumber.activeForeground"],
  rule: ["editorIndentGuide.background1", "editorIndentGuide.background"],
};

export type CodeThemeImportOptions = {
  id: string;
  source: CodeThemeSource;
  /** Overrides the theme's own label/name. */
  name?: string;
  /** Overrides type detection. */
  type?: CodeThemeType;
};

export type CodeThemeImportResult = {
  theme: CodeTheme;
  /**
   * Where each role came from: the matching TextMate selector, a
   * `semantic:<selector>`, `editor.foreground`, or `fallback`.
   */
  provenance: Record<CodeThemeRole, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function fontStyleOf(raw: string | undefined): CodeThemeFontStyle | undefined {
  if (!raw) return undefined;
  const words = raw.split(/\s+/);
  const bold = words.includes("bold");
  const italic = words.includes("italic");
  if (bold && italic) return "bold italic";
  if (bold) return "bold";
  if (italic) return "italic";
  return undefined;
}

/** Theme type from the editor id prefix, the file's `type`, or background luminance. */
export function detectThemeType(data: VscodeThemeData, background: string | null): CodeThemeType {
  const baseId = typeof data.id === "string" ? data.id.split(/\s+/)[0] : "";
  if (baseId === "vs-dark" || baseId === "hc-black") return "dark";
  if (baseId === "vs" || baseId === "hc-light") return "light";
  const declared = typeof data.type === "string" ? data.type.toLowerCase() : "";
  if (declared === "light" || declared === "hc-light" || declared === "vs") return "light";
  if (declared === "dark" || declared === "hc" || declared === "hc-black" || declared === "vs-dark") return "dark";
  if (background) return hexLuminance(background) > 0.5 ? "light" : "dark";
  return "dark";
}

type SemanticStyle = { foreground?: string; fontStyle?: CodeThemeFontStyle };

/** Collects semantic styles by selector; later entries override earlier ones. */
function semanticStyles(data: VscodeThemeData): Map<string, SemanticStyle> {
  const styles = new Map<string, SemanticStyle>();
  for (const rule of Array.isArray(data.semanticTokenRules) ? data.semanticTokenRules : []) {
    if (!isRecord(rule) || typeof rule._selector !== "string") continue;
    const style = isRecord(rule._style) ? rule._style : {};
    const foreground = normalizeHexColor(style._foreground) ?? undefined;
    const fontStyle = fontStyleOf(
      [style._bold === true ? "bold" : "", style._italic === true ? "italic" : ""].join(" "),
    );
    styles.set(rule._selector, { foreground, fontStyle });
  }
  if (isRecord(data.semanticTokenColors)) {
    for (const [selector, value] of Object.entries(data.semanticTokenColors)) {
      if (typeof value === "string") {
        styles.set(selector, { foreground: normalizeHexColor(value) ?? undefined });
      } else if (isRecord(value)) {
        const words = [
          typeof value.fontStyle === "string" ? value.fontStyle : "",
          value.bold === true ? "bold" : "",
          value.italic === true ? "italic" : "",
        ].join(" ");
        styles.set(selector, {
          foreground: normalizeHexColor(value.foreground) ?? undefined,
          fontStyle: fontStyleOf(words),
        });
      }
    }
  }
  return styles;
}

/** Converts a loaded VS Code / Cursor theme into a normalized code theme. */
export function importVscodeTheme(data: VscodeThemeData, options: CodeThemeImportOptions): CodeThemeImportResult {
  const rules: TextMateRule[] = Array.isArray(data.themeTokenColors)
    ? data.themeTokenColors
    : Array.isArray(data.tokenColors)
      ? data.tokenColors
      : [];
  const colorMap: Record<string, unknown> = {
    ...(isRecord(data.colors) ? data.colors : {}),
    ...(isRecord(data.colorMap) ? data.colorMap : {}),
  };

  // tmTheme-style global settings (a rule without a scope) back up the
  // editor colors for themes converted from TextMate.
  const globalRule = rules.find((rule) => isRecord(rule) && ruleSelectors(rule.scope).length === 0 && isRecord(rule.settings));
  const globalBackground = normalizeHexColor(globalRule?.settings?.background);
  const globalForeground = normalizeHexColor(globalRule?.settings?.foreground);

  const pick = (keys: readonly string[] | undefined): string | null => {
    for (const key of keys ?? []) {
      const color = normalizeHexColor(colorMap[key]);
      if (color) return color;
    }
    return null;
  };

  const editorBackground = pick(COLOR_SOURCES.background) ?? globalBackground;
  const type = options.type ?? detectThemeType(data, editorBackground);
  const base = baseCodeTheme(type);

  const colors = { ...base.colors };
  for (const key of Object.keys(COLOR_SOURCES) as CodeThemeColorKey[]) {
    const color = pick(COLOR_SOURCES[key]);
    if (color) colors[key] = color;
  }
  if (!pick(COLOR_SOURCES.background) && globalBackground) colors.background = globalBackground;
  if (!pick(COLOR_SOURCES.foreground) && globalForeground) colors.foreground = globalForeground;
  if (!pick(COLOR_SOURCES.gutterBackground)) colors.gutterBackground = colors.background;

  const roles = { ...base.roles };
  const provenance = {} as Record<CodeThemeRole, string>;
  const fontStyle: NonNullable<CodeTheme["fontStyle"]> = {};

  roles.punctuation = colors.foreground;
  provenance.punctuation = pick(COLOR_SOURCES.foreground) || globalForeground ? "editor.foreground" : "fallback";

  for (const role of CODE_THEME_ROLES) {
    if (role === "punctuation") continue;
    let resolved = false;
    let roleFontStyle: CodeThemeFontStyle | undefined;
    for (const target of ROLE_SCOPES[role]) {
      const style = resolveScopeStyle(rules, target);
      const color = normalizeHexColor(style.foreground);
      if (!color) continue;
      roles[role] = color;
      provenance[role] = style.foregroundSelector ?? target.scope;
      roleFontStyle = fontStyleOf(style.fontStyle);
      resolved = true;
      break;
    }
    if (!resolved) {
      roles[role] = colors.foreground;
      provenance[role] = "editor.foreground";
      roleFontStyle = fontStyleOf(resolveScopeStyle(rules, ROLE_SCOPES[role][0]).fontStyle);
    }
    if (roleFontStyle) fontStyle[role] = roleFontStyle;
  }

  const semanticEnabled = data.themeSemanticHighlighting ?? data.semanticHighlighting ?? false;
  if (semanticEnabled) {
    const semantic = semanticStyles(data);
    for (const [role, selectors] of Object.entries(ROLE_SEMANTIC_SELECTORS) as [CodeThemeRole, string[]][]) {
      for (const selector of selectors) {
        const style = semantic.get(selector);
        if (!style?.foreground) continue;
        roles[role] = style.foreground;
        provenance[role] = `semantic:${selector}`;
        if (style.fontStyle) fontStyle[role] = style.fontStyle;
        break;
      }
    }
  }

  colors.langForeground = roles.keyword;
  colors.zebra = withAlpha(colors.foreground, "0A");

  const source: CodeThemeSource = { ...options.source };
  const themeId = data.id ?? data.name;
  const label = data.label ?? data.name;
  if (themeId && !source.themeId) source.themeId = themeId;
  if (label && !source.label) source.label = label;
  if (data.settingsId && !source.settingsId) source.settingsId = data.settingsId;

  const theme: CodeTheme = {
    version: CODE_THEME_FORMAT_VERSION,
    id: options.id,
    name: options.name?.trim() || label || data.settingsId || options.id,
    type,
    source,
    colors,
    roles,
  };
  if (Object.keys(fontStyle).length > 0) theme.fontStyle = fontStyle;
  return { theme, provenance };
}
