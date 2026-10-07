import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { resetGlobalThemeActive } from "../data/project-storage";
import { App } from "../App";
import { DEFAULT_STYLE_RAIL_SETTINGS, resetStyleRailBaseline } from "../shared/style-rail-settings";

/**
 * The shared GLOBAL theme, against a fake host that implements the contract:
 *
 *  - GET  api/serve-config   -> { themeLocked, globalTheme }
 *  - GET  api/themes         -> global FIRST, then repo themes
 *  - GET  api/themes/:id     -> { theme } | 404 (global 404 = not created yet)
 *  - POST api/themes         -> writes { id, manifest, components }
 *
 * The page sits under a central-service project path so per-project storage
 * is namespaced (`docs-project:p1:`) exactly as it is on the live service.
 */

type Call = { method: string; path: string; body?: Record<string, unknown> };

type FakeHost = {
  serveConfig: Record<string, unknown>;
  themes: Record<string, Record<string, unknown>>;
  /** Status for GET api/themes/global when no global theme is stored (default 404). */
  globalReadStatus?: number;
};

const PROJECT_PREFIX = "docs-project:p1:";
// v3: the cache key since the rail's color controls were hidden (StyleRail.tsx).
const SHARED_SETTINGS_KEY = "docs-global:docs-style-rail-settings.v3";

let calls: Call[] = [];
let realFetch: typeof fetch;
let realHref: string;

/** happy-dom's navigation hook (GlobalRegistrator preload); not on the DOM Window type. */
function setPageUrl(url: string) {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFakeHost(host: FakeHost) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    const method = (init?.method ?? "GET").toUpperCase();
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const path = url.pathname.replace(/^\/projects\/p1\/docs\//, "");
    calls.push({ method, path, body });

    if (path === "api/serve-config") return json(host.serveConfig);
    if (path === "api/tree") return json({ tree: [] });
    if (path === "api/themes" && method === "GET") {
      const ids = Object.keys(host.themes).filter((id) => id !== "global");
      return json({
        themes: [
          ...(host.serveConfig.globalTheme ? [{ id: "global", name: "Global", global: true }] : []),
          ...ids.map((id) => ({ id, name: id })),
        ],
      });
    }
    if (path === "api/themes" && method === "POST" && body) {
      const id = String(body.id);
      host.themes[id] = { manifest: body.manifest, components: body.components };
      return json({ theme: { id, ...host.themes[id] } });
    }
    const themeMatch = path.match(/^api\/themes\/([^/]+)$/);
    if (themeMatch && method === "GET") {
      const id = decodeURIComponent(themeMatch[1]!);
      const stored = host.themes[id];
      if (stored) return json({ theme: { id, ...stored } });
      const status = id === "global" ? host.globalReadStatus ?? 404 : 404;
      return json({ detail: `No theme named "${id}".` }, status);
    }
    return json({ detail: "not found" }, 404);
  }) as typeof fetch;
}

function themeReads(): string[] {
  return calls
    .filter((call) => call.method === "GET" && call.path.startsWith("api/themes/"))
    .map((call) => call.path);
}

function themeWrites(): Call[] {
  return calls.filter((call) => call.method === "POST" && call.path === "api/themes");
}

function styleVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

async function waitForRail() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Close Style" })).toBeTruthy();
  });
}

function changeAiPanelWidth(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
  fireEvent.change(screen.getByLabelText(/AI panel width/), { target: { value } });
}

/** A project that was previously on its repo theme, with stale caches in every legacy slot. */
function seedStaleProjectState() {
  localStorage.setItem(`${PROJECT_PREFIX}docs-theme-folder-id`, "default");
  localStorage.setItem(`${PROJECT_PREFIX}docs-viewer-theme`, "dark");
  localStorage.setItem(
    `${PROJECT_PREFIX}docs-style-rail-settings.v2`,
    JSON.stringify({ typography: { fontSize: 13 }, annotate: { actionPaneWidth: 390 } }),
  );
  localStorage.setItem(
    `${PROJECT_PREFIX}docs-style-rail-settings.v1`,
    JSON.stringify({ typography: { fontSize: 15 } }),
  );
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  realHref = window.location.href;
  calls = [];
  setPageUrl("http://localhost/projects/p1/docs/");
  localStorage.clear();
  resetGlobalThemeActive();
  resetStyleRailBaseline();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  // Other suites share this window; a project path would namespace their storage keys.
  setPageUrl(realHref);
  localStorage.clear();
  resetGlobalThemeActive();
  resetStyleRailBaseline();
  document.getElementById("docs-theme-folder-css")?.remove();
});

describe("shared global theme", () => {
  it("lands every project on global, ignoring a stored repo theme id and stale per-project caches", async () => {
    seedStaleProjectState();
    installFakeHost({
      serveConfig: { themeLocked: false, globalTheme: true },
      themes: {
        global: {
          manifest: { name: "Global", dark: false, railDefaults: { typography: { fontSize: 21 } } },
          components: {},
        },
        default: {
          manifest: { name: "Default", dark: true, railDefaults: { typography: { fontSize: 11 } } },
          components: {},
        },
      },
    });

    render(<App />);
    await waitForRail();

    await waitFor(() => {
      expect(styleVar("--style-font-size")).toBe("21px");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
    // The repo theme is never even read: global is the only active theme.
    expect(themeReads()).toEqual(["api/themes/global"]);
    // The picker offers Global and nothing else.
    expect(screen.getByRole("button", { name: "Global" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Default" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save global style" })).toBeTruthy();
    // Stale per-project keys stay on disk untouched; the cache now lives in the shared slot.
    expect(localStorage.getItem(`${PROJECT_PREFIX}docs-theme-folder-id`)).toBe("default");
    await waitFor(() => {
      const shared = JSON.parse(localStorage.getItem(SHARED_SETTINGS_KEY) ?? "null") as {
        typography: { fontSize: number };
      } | null;
      expect(shared?.typography.fontSize).toBe(21);
    });
    expect(themeWrites()).toEqual([]);
  });

  it("renders stock when global does not exist yet, and the first change creates it", async () => {
    seedStaleProjectState();
    const host: FakeHost = {
      serveConfig: { themeLocked: false, globalTheme: true },
      themes: {},
    };
    installFakeHost(host);

    render(<App />);
    await waitForRail();
    // Stock, not the stale per-project 13px / 390px cache.
    expect(styleVar("--style-font-size")).toBe("");
    expect(styleVar("--docs-action-pane-width")).toBe("");

    changeAiPanelWidth("644");

    await waitFor(
      () => {
        expect(themeWrites()).toHaveLength(1);
      },
      { timeout: 4000, interval: 100 },
    );
    const write = themeWrites()[0]!.body as {
      id: string;
      manifest: { name: string; railDefaults: Record<string, Record<string, unknown>> };
    };
    expect(write.id).toBe("global");
    expect(write.manifest.name).toBe("Global");
    expect(write.manifest.railDefaults.annotate!.actionPaneWidth).toBe(644);
    expect(write.manifest.railDefaults.typography!.fontSize).toBe(
      DEFAULT_STYLE_RAIL_SETTINGS.typography.fontSize,
    );
    expect(host.themes.global).toBeTruthy();
    // The per-project cache is never written while global is active.
    expect(
      JSON.parse(localStorage.getItem(`${PROJECT_PREFIX}docs-style-rail-settings.v2`) ?? "{}")
        .annotate.actionPaneWidth,
    ).toBe(390);
  });

  it("writes the explicit save to global", async () => {
    installFakeHost({
      serveConfig: { themeLocked: false, globalTheme: true },
      themes: {
        global: { manifest: { name: "Global", railDefaults: {} }, components: {} },
      },
    });

    render(<App />);
    await waitForRail();
    changeAiPanelWidth("600");
    fireEvent.click(screen.getByRole("button", { name: "Save global style" }));

    await waitFor(() => {
      expect(themeWrites()).toHaveLength(1);
    });
    expect(themeWrites()[0]!.body!.id).toBe("global");
  });

  it("follows another tab's change to the shared cache without echoing it back", async () => {
    installFakeHost({
      serveConfig: { themeLocked: false, globalTheme: true },
      themes: {
        global: {
          manifest: { name: "Global", railDefaults: { typography: { fontSize: 18 } } },
          components: {},
        },
      },
    });

    render(<App />);
    await waitForRail();
    expect(styleVar("--style-font-size")).toBe("");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SHARED_SETTINGS_KEY,
          newValue: JSON.stringify({
            ...DEFAULT_STYLE_RAIL_SETTINGS,
            typography: { ...DEFAULT_STYLE_RAIL_SETTINGS.typography, fontSize: 22 },
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(styleVar("--style-font-size")).toBe("22px");
    });
    // Longer than the write debounce: the originating tab owns the POST.
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(themeWrites()).toEqual([]);
  });

  it("never writes global after a read failure other than 404", async () => {
    installFakeHost({
      serveConfig: { themeLocked: false, globalTheme: true },
      themes: {},
      globalReadStatus: 500,
    });

    render(<App />);
    await waitForRail();
    expect(screen.queryByRole("button", { name: "Save global style" })).toBeNull();
    changeAiPanelWidth("600");
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(themeWrites()).toEqual([]);
  });

  it("keeps the per-project repo theme when the host does not offer global", async () => {
    seedStaleProjectState();
    localStorage.setItem(`${PROJECT_PREFIX}docs-theme-folder-id`, "product-theme");
    // A leftover shared flag from an earlier global host must not win.
    localStorage.setItem("docs-global:theme-active", "true");
    installFakeHost({
      serveConfig: { themeLocked: false },
      themes: {
        "product-theme": {
          manifest: {
            name: "Product Theme",
            dark: false,
            railDefaults: { typography: { fontSize: 19 } },
          },
          components: {},
        },
      },
    });

    render(<App />);
    await waitForRail();
    await waitFor(() => {
      expect(styleVar("--style-font-size")).toBe("19px");
    });
    expect(themeReads()).toContain("api/themes/product-theme");
    expect(themeReads()).not.toContain("api/themes/global");
    expect(screen.getByRole("button", { name: "Save style to repo" })).toBeTruthy();
    expect(localStorage.getItem("docs-global:theme-active")).toBeNull();

    changeAiPanelWidth("644");
    await waitFor(
      () => {
        expect(themeWrites()).toHaveLength(1);
      },
      { timeout: 4000, interval: 100 },
    );
    expect(themeWrites()[0]!.body!.id).toBe("product-theme");
    expect(
      JSON.parse(localStorage.getItem(`${PROJECT_PREFIX}docs-style-rail-settings.v3`) ?? "{}")
        .annotate.actionPaneWidth,
    ).toBe(644);
    expect(localStorage.getItem(SHARED_SETTINGS_KEY)).toBeNull();
  });
});
