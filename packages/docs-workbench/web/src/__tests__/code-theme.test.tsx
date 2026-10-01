import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { useState } from "react";
import {
  DARK_PLUS_CODE_THEME,
  LIGHT_PLUS_CODE_THEME,
  codeThemeListEntry,
  type CodeTheme,
} from "@codecaine-ai/docs-model/code-theme";

import { DEFAULT_STYLE_RAIL_SETTINGS, StyleRail, resetStyleRailBaseline, type StyleRailSettings } from "../shell/StyleRail";
import {
  CODE_THEME_STYLE_ELEMENT_ID,
  applyCodeThemeStyle,
  codeThemeStyleCss,
} from "../theme/code-theme-style";
import { codeThemeOptionLabel, useCodeTheme, type CodeThemeControls } from "../theme/use-code-theme";

/**
 * The central code theme in the workbench: the scoped <style> that applies
 * the active theme to code panes, the Typography pane picker, and the
 * fail-soft loader.
 */

const CURSOR_THEME: CodeTheme = {
  ...DARK_PLUS_CODE_THEME,
  id: "cursor-dark-plus",
  source: { editor: "cursor", label: "Dark+", settingsId: "Default Dark+" },
  roles: { ...DARK_PLUS_CODE_THEME.roles, keyword: "#111111" },
};

const withPanels = (codePanels: "dark" | "page", extra: Partial<StyleRailSettings> = {}): StyleRailSettings => ({
  ...DEFAULT_STYLE_RAIL_SETTINGS,
  ...extra,
  typography: { ...DEFAULT_STYLE_RAIL_SETTINGS.typography, codePanels },
});

beforeEach(() => resetStyleRailBaseline());
afterEach(() => {
  cleanup();
  document.getElementById(CODE_THEME_STYLE_ELEMENT_ID)?.remove();
});

describe("code theme style", () => {
  it("dark panels: every code pane, outranking the (0,3,0) rail mirror", () => {
    const css = codeThemeStyleCss(CURSOR_THEME, withPanels("dark"));
    expect(css.startsWith(':root[data-code-panels="dark"] [data-code-surface][data-code-surface] {')).toBe(true);
    expect(css).toContain("--syntax-keyword: #111111;");
    expect(css).toContain("--docs-code-block-bg: #1E1E1E;");
    expect(css).toContain("--docs-code-fg: #D4D4D4;");
    expect(css).toContain("--docs-code-selection: #264F78;");
  });

  it("page panels: only on a page of the theme's own type", () => {
    expect(codeThemeStyleCss(DARK_PLUS_CODE_THEME, withPanels("page"))).toContain(
      ':root[data-code-panels="page"][data-theme="dark"] [data-code-surface][data-code-surface] {',
    );
    expect(codeThemeStyleCss(LIGHT_PLUS_CODE_THEME, withPanels("page"))).toContain(
      ':root[data-code-panels="page"]:not([data-theme="dark"]) [data-code-surface][data-code-surface] {',
    );
  });

  it("leaves out every var an explicit rail override sets, so the rail keeps winning", () => {
    const settings = withPanels("dark", { components: { code: { keyword: "#ABCDEF" } } });
    const css = codeThemeStyleCss(CURSOR_THEME, settings);
    expect(css).not.toContain("--syntax-keyword:");
    expect(css).toContain("--syntax-string: #CE9178;");
  });

  it("emits font-style vars only for styled roles", () => {
    const css = codeThemeStyleCss({ ...CURSOR_THEME, fontStyle: { comment: "italic" } }, withPanels("dark"));
    expect(css).toContain("--syntax-comment-font-style: italic;");
    expect(css).toContain("--syntax-comment-font-weight: normal;");
    expect(css).not.toContain("--syntax-keyword-font-style");
  });

  it("writes one managed <style>, emptied when there is no theme", () => {
    applyCodeThemeStyle(CURSOR_THEME, withPanels("dark"));
    applyCodeThemeStyle(CURSOR_THEME, withPanels("dark"));
    expect(document.querySelectorAll(`#${CODE_THEME_STYLE_ELEMENT_ID}`)).toHaveLength(1);
    expect(document.getElementById(CODE_THEME_STYLE_ELEMENT_ID)?.textContent).toContain("--syntax-keyword");
    applyCodeThemeStyle(null, withPanels("dark"));
    expect(document.getElementById(CODE_THEME_STYLE_ELEMENT_ID)?.textContent).toBe("");
  });
});

describe("code theme picker", () => {
  it("labels themes with their editor name and source", () => {
    expect(codeThemeOptionLabel(codeThemeListEntry(CURSOR_THEME))).toBe("Default Dark+ (Cursor)");
    expect(codeThemeOptionLabel(codeThemeListEntry(DARK_PLUS_CODE_THEME))).toBe("Dark+ (built-in)");
    expect(codeThemeOptionLabel({ ...codeThemeListEntry(CURSOR_THEME), name: "My Dark" })).toBe("My Dark (Cursor)");
  });

  function Harness({ controls }: { controls: CodeThemeControls }) {
    const [settings, setSettings] = useState(DEFAULT_STYLE_RAIL_SETTINGS);
    return (
      <StyleRail
        activeThemeId="default"
        codeTheme={controls}
        collapsed={false}
        dark={false}
        onCollapsedChange={() => {}}
        onDarkChange={() => {}}
        onSelectTheme={() => {}}
        onSettingsChange={setSettings}
        settings={settings}
        themes={[{ id: "default", name: "Default", source: "builtin" }]}
      />
    );
  }

  const openTypography = () => {
    const navigation = screen.getByRole("navigation", { name: "Style sections" });
    fireEvent.click(within(navigation).getByRole("button", { name: /^Typography/ }));
  };

  it("lists code themes under Code panels and wires select + import", () => {
    const onSelect = mock((_id: string) => {});
    const onImport = mock(() => {});
    render(
      <Harness
        controls={{
          themes: [DARK_PLUS_CODE_THEME, LIGHT_PLUS_CODE_THEME, CURSOR_THEME].map(codeThemeListEntry),
          activeId: "dark-plus",
          busy: false,
          status: { kind: "error", text: "No VS Code or Cursor state found" },
          onSelect,
          onImport,
        }}
      />,
    );
    openTypography();
    const select = screen.getByLabelText("Code theme") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Dark+ (built-in)",
      "Light+ (built-in)",
      "Default Dark+ (Cursor)",
    ]);
    expect(select.value).toBe("dark-plus");
    fireEvent.change(select, { target: { value: "cursor-dark-plus" } });
    expect(onSelect).toHaveBeenCalledWith("cursor-dark-plus");
    fireEvent.click(screen.getByRole("button", { name: "Import from editor" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe("No VS Code or Cursor state found");
  });

  it("is absent without controls (static export / theme-locked)", () => {
    render(
      <StyleRail
        activeThemeId="default"
        collapsed={false}
        dark={false}
        onCollapsedChange={() => {}}
        onDarkChange={() => {}}
        onSelectTheme={() => {}}
        onSettingsChange={() => {}}
        settings={DEFAULT_STYLE_RAIL_SETTINGS}
        themes={[{ id: "default", name: "Default", source: "builtin" }]}
      />,
    );
    openTypography();
    expect(screen.queryByLabelText("Code theme")).toBeNull();
    expect(screen.queryByRole("button", { name: "Import from editor" })).toBeNull();
  });
});

describe("useCodeTheme", () => {
  const originalFetch = globalThis.fetch;
  // Settles the hook's fetch chains with microtasks only — no timers, so the
  // test does not depend on timer state other suites may leave behind.
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
    });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fails soft when the API is unavailable", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const { result } = renderHook(() => useCodeTheme());
    await settle();
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result.current.theme).toBeNull();
    expect(result.current.controls.themes).toEqual([]);
  });

  it("loads the active theme, then imports from the editor and activates the result", async () => {
    let active = DARK_PLUS_CODE_THEME;
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url === "api/code-themes/active" && method === "GET") return Response.json({ id: active.id, codeTheme: active });
      if (url === "api/code-themes/active" && method === "PUT") {
        active = CURSOR_THEME;
        return Response.json({ id: active.id, codeTheme: active });
      }
      if (url === "api/code-themes/import") return Response.json({ codeTheme: CURSOR_THEME, warnings: [] }, { status: 201 });
      if (url === "api/code-themes") {
        const list = [DARK_PLUS_CODE_THEME, LIGHT_PLUS_CODE_THEME, ...(active === CURSOR_THEME ? [CURSOR_THEME] : [])];
        return Response.json({ codeThemes: list.map(codeThemeListEntry) });
      }
      return new Response("unexpected", { status: 500 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useCodeTheme());
    await settle();
    expect(result.current.theme?.id).toBe("dark-plus");
    expect(result.current.controls.themes).toHaveLength(2);

    act(() => result.current.controls.onImport());
    await settle();
    expect(result.current.controls.status?.text).toBe("Imported Default Dark+ (Cursor)");
    expect(result.current.theme?.id).toBe("cursor-dark-plus");
    expect(result.current.controls.activeId).toBe("cursor-dark-plus");
    expect(result.current.controls.themes.map((entry) => entry.id)).toContain("cursor-dark-plus");
    expect(calls).toContain("POST api/code-themes/import");
    expect(calls).toContain("PUT api/code-themes/active");
  });
});
