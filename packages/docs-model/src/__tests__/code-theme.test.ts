import { describe, expect, test } from "bun:test";

import darkPlusColorThemeData from "../__fixtures__/code-theme/cursor-dark-plus.colorThemeData.json";
import {
  CODE_THEME_ROLES,
  DARK_PLUS_CODE_THEME,
  LIGHT_PLUS_CODE_THEME,
  codeThemeCssVars,
  importVscodeTheme,
  matchScopeSelector,
  normalizeHexColor,
  parseCodeTheme,
  resolveScopeStyle,
  slugifyCodeThemeId,
  type TextMateRule,
  type VscodeThemeData,
} from "../code-theme";

const rule = (scope: string | string[], foreground?: string, fontStyle?: string): TextMateRule => ({
  scope,
  settings: { ...(foreground ? { foreground } : {}), ...(fontStyle !== undefined ? { fontStyle } : {}) },
});

describe("TextMate scope matching", () => {
  test("a selector matches equal scopes and dot-boundary prefixes only", () => {
    expect(matchScopeSelector("keyword", { scope: "keyword.control" })).not.toBeNull();
    expect(matchScopeSelector("keyword.control", { scope: "keyword.control" })).not.toBeNull();
    expect(matchScopeSelector("key", { scope: "keyword.control" })).toBeNull();
    expect(matchScopeSelector("keyword.control.import", { scope: "keyword.control" })).toBeNull();
  });

  test("the most specific rule wins regardless of order", () => {
    const rules = [rule("keyword.control", "#111111"), rule("keyword", "#222222")];
    expect(resolveScopeStyle(rules, { scope: "keyword.control.import" }).foreground).toBe("#111111");
  });

  test("equal specificity goes to the later rule", () => {
    const rules = [rule("keyword.control", "#111111"), rule(["string", "keyword.control"], "#222222")];
    expect(resolveScopeStyle(rules, { scope: "keyword.control" }).foreground).toBe("#222222");
  });

  test("comma-separated scope strings split into selectors", () => {
    const rules = [rule("comment, string.quoted", "#333333")];
    expect(resolveScopeStyle(rules, { scope: "string.quoted.double" }).foreground).toBe("#333333");
  });

  test("descendant selectors need matching parents and outrank a bare match of equal depth", () => {
    const rules = [
      rule("source.css entity.other.attribute-name.class", "#AAAAAA"),
      rule("entity.other.attribute-name.class", "#BBBBBB"),
    ];
    expect(resolveScopeStyle(rules, { scope: "entity.other.attribute-name.class.css" }).foreground).toBe("#BBBBBB");
    expect(
      resolveScopeStyle(rules, { scope: "entity.other.attribute-name.class.css", parents: ["source.css"] }).foreground,
    ).toBe("#AAAAAA");
  });

  test("exclusion clauses are dropped rather than breaking the selector", () => {
    const rules = [rule("string - string.regexp", "#444444")];
    expect(resolveScopeStyle(rules, { scope: "string.quoted" }).foreground).toBe("#444444");
  });

  test("foreground and fontStyle resolve independently", () => {
    const rules = [rule("comment", "#6A9955"), rule("comment.line", undefined, "italic")];
    expect(resolveScopeStyle(rules, { scope: "comment.line.double-slash" })).toMatchObject({
      foreground: "#6A9955",
      fontStyle: "italic",
    });
  });
});

describe("importVscodeTheme", () => {
  const data = darkPlusColorThemeData as VscodeThemeData;

  test("the real Cursor Dark+ colorThemeData reproduces the built-in Dark+ code theme", () => {
    const { theme, provenance } = importVscodeTheme(data, {
      id: "cursor-dark-plus",
      source: { editor: "cursor", importedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(theme.type).toBe("dark");
    expect(theme.name).toBe("Dark+");
    expect(theme.roles).toEqual(DARK_PLUS_CODE_THEME.roles);
    expect(theme.colors).toEqual(DARK_PLUS_CODE_THEME.colors);
    expect(theme.source).toEqual({
      editor: "cursor",
      importedAt: "2026-01-01T00:00:00.000Z",
      themeId: "vs-dark vscode-theme-defaults-themes-dark_plus-json",
      label: "Dark+",
      settingsId: "Default Dark+",
    });
    // keyword.control is listed twice in Dark+ (#569cd6, then #C586C0): the later rule wins.
    expect(provenance.control).toBe("keyword.control");
    expect(provenance.boolean).toBe("constant.language");
  });

  test("roles the theme leaves uncolored fall back to the editor foreground", () => {
    const { theme, provenance } = importVscodeTheme(
      { colors: { "editor.background": "#FAFAFA", "editor.foreground": "#123456" }, tokenColors: [rule("string", "#00AA00")] },
      { id: "sparse", source: { editor: "file" } },
    );
    expect(theme.type).toBe("light");
    expect(theme.roles.string).toBe("#00AA00");
    expect(theme.roles.comment).toBe("#123456");
    expect(provenance.comment).toBe("editor.foreground");
    // Panel colors missing from the color map come from the base (Light+).
    expect(theme.colors.gutterForeground).toBe(LIGHT_PLUS_CODE_THEME.colors.gutterForeground);
    expect(theme.colors.gutterBackground).toBe("#FAFAFA");
  });

  test("semantic token colors override mapped roles when semantic highlighting is on", () => {
    const base = { tokenColors: [rule("entity.name.function", "#111111")], semanticTokenColors: { function: "#222222" } };
    const off = importVscodeTheme(base, { id: "a", source: { editor: "file" } });
    const on = importVscodeTheme({ ...base, semanticHighlighting: true }, { id: "a", source: { editor: "file" } });
    expect(off.theme.roles.function).toBe("#111111");
    expect(on.theme.roles.function).toBe("#222222");
    expect(on.provenance.function).toBe("semantic:function");
  });

  test("captures italic / bold per role", () => {
    const { theme } = importVscodeTheme(
      { type: "dark", tokenColors: [rule("comment", "#777777", "italic"), rule("storage.type", "#888888", "bold italic")] },
      { id: "styled", source: { editor: "file" } },
    );
    expect(theme.fontStyle).toEqual({ comment: "italic", keyword: "bold italic" });
  });
});

describe("code theme format", () => {
  test("normalizeHexColor expands short forms and uppercases", () => {
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
    expect(normalizeHexColor("#abcd")).toBe("#AABBCCDD");
    expect(normalizeHexColor("#add6ff26")).toBe("#ADD6FF26");
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
  });

  test("parseCodeTheme fills gaps from the base of the same type and drops invalid values", () => {
    const theme = parseCodeTheme({ type: "light", name: "Mine", roles: { string: "#0a0", comment: "nope" } }, "mine");
    expect(theme?.roles.string).toBe("#00AA00");
    expect(theme?.roles.comment).toBe(LIGHT_PLUS_CODE_THEME.roles.comment);
    expect(theme?.colors).toEqual(LIGHT_PLUS_CODE_THEME.colors);
    expect(parseCodeTheme("not a theme", "x")).toBeNull();
  });

  test("slugifyCodeThemeId keeps + readable", () => {
    expect(slugifyCodeThemeId("Default Dark+")).toBe("default-dark-plus");
    expect(slugifyCodeThemeId("  ")).toBe("code-theme");
  });

  test("codeThemeCssVars emits every role and panel var", () => {
    const vars = codeThemeCssVars({ ...DARK_PLUS_CODE_THEME, fontStyle: { comment: "italic" } });
    for (const role of CODE_THEME_ROLES) expect(vars[`--syntax-${role}`]).toBe(DARK_PLUS_CODE_THEME.roles[role]);
    expect(vars["--docs-code-block-bg"]).toBe("#1E1E1E");
    expect(vars["--docs-code-gutter-fg"]).toBe("#858585");
    expect(vars["--syntax-comment-font-style"]).toBe("italic");
    expect(vars["--syntax-comment-font-weight"]).toBe("normal");
    expect(vars["--syntax-keyword-font-style"]).toBeUndefined();
  });
});
