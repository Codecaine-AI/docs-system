import { projectStorage, themeStorage } from "../data/project-storage";
import { PanelRightClose, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import {
  BLOCK_LAYOUT_STYLE_ELEMENT_ID,
  CODE_PANEL_STYLE_ELEMENT_ID,
  DEFAULT_STYLE_RAIL_SETTINGS,
  PAGE_COLOR_STYLE_ELEMENT_ID,
  PAGE_COLOR_VARS,
  blockLayoutOverrideCss,
  codePanelOverrideCss,
  getStyleRailBaseline,
  normalizeSettings,
  pageColorOverrideCss,
  styleRailVars,
  type StyleRailSettings,
} from "./style-rail-settings";
import type { CodeThemeControls } from "../theme/use-code-theme";
import { useState } from "react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import { StyleRailNav, isStyleRailPaneId, type StyleRailPaneId } from "./style-rail-nav";
import { StyleRailPane } from "./style-rail-panes";

/**
 * Style rail — right-docked panel for live-tuning the docs theme, styled
 * with the docs' own semantic tokens so it follows light/dark. Every knob
 * resolves to CSS custom properties written onto <html>
 * (applyStyleRailVars), layered over theme/semantic.css; a knob at STOCK
 * REMOVES its override so the theme files stay authoritative.
 *
 * PERSISTENCE is two-layered (see the baseline block below
 * DEFAULT_STYLE_RAIL_SETTINGS): the durable, committable copy is the
 * `railDefaults` block of the repo's `themes/<id>/theme.json`, which every
 * consumer reads — a --theme-locked serve, a static export, a different
 * browser. A localStorage JSON blob sits ON TOP of it as this browser's
 * private override. Both are clamped on load.
 * Grain/softening effects ported from ccbcu client-dashboard's style rail.
 */

export * from "./style-rail-settings";

/**
 * v2 = the stock reading metrics moved (14px / 1.7 / 100ch → 18px / 1.45 /
 * 60ch). The cache always stores the FULL normalized settings, so every v1
 * blob pinned the old stock metrics even when nobody touched those knobs —
 * and on a project with no repo theme the cache is the authority, so those
 * stale values kept winning. v1 blobs are read once through
 * migrateLegacyStyleRailBlob; the next save lands under v2.
 */
const STORAGE_KEY = "docs-style-rail-settings.v2";
/**
 * Exported so App can recognise a `storage` event for this cache. The cache
 * lives in `themeStorage`: one origin-wide key while the shared global theme
 * is active (so a stale per-project v1/v2 blob can never override it), the
 * per-project key otherwise.
 */
export const STYLE_RAIL_STORAGE_KEY = STORAGE_KEY;
const LEGACY_STORAGE_KEY = "docs-style-rail-settings.v1";

/** The v1 stock reading metrics. A v1 value equal to one of these is untouched stock, not a choice. */
const LEGACY_STOCK_METRICS = { fontSize: 14, lineHeight: 1.7, contentWidth: 100 } as const;

/**
 * Drops v1 reading metrics that still sit at the v1 stock values so they fall
 * through to the current baseline. A metric the user actually moved (any
 * other value) survives. Exported for tests.
 */
export function migrateLegacyStyleRailBlob(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const blob = { ...(raw as Record<string, unknown>) };
  const dropStock = (section: string, key: keyof typeof LEGACY_STOCK_METRICS) => {
    const value = blob[section];
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const next = { ...(value as Record<string, unknown>) };
    if (next[key] === LEGACY_STOCK_METRICS[key]) delete next[key];
    blob[section] = next;
  };
  dropStock("typography", "fontSize");
  dropStock("typography", "lineHeight");
  // contentWidth lived under typography in the oldest blobs, then layout
  // (or `surfaces`); normalizeSettings reads all three.
  dropStock("typography", "contentWidth");
  dropStock("layout", "contentWidth");
  dropStock("surfaces", "contentWidth");
  return blob;
}


/**
 * Reads the browser cache, filling any omitted keys from the installed
 * baseline. App uses this only as the first-frame/offline fallback when the
 * active repo theme has no railDefaults; a repo railDefaults block is the
 * durable authority and replaces stale cache during normal boot.
 */
export function loadStyleRailSettings(): StyleRailSettings {
  try {
    const raw = themeStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
    // Read-only migration: a locked host calls this too and must not write
    // storage, so the v1 blob is left in place and simply superseded by the
    // first v2 save on an unlocked host.
    const legacy = themeStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return normalizeSettings(migrateLegacyStyleRailBlob(JSON.parse(legacy)));
    return getStyleRailBaseline();
  } catch {
    return getStyleRailBaseline();
  }
}

/** True when a browser cache exists; retained for cache-aware hosts/tests. */
export function hasStoredStyleRailSettings(): boolean {
  try {
    return (
      themeStorage.getItem(STORAGE_KEY) !== null ||
      themeStorage.getItem(LEGACY_STORAGE_KEY) !== null
    );
  } catch {
    return false;
  }
}

export function saveStyleRailSettings(settings: StyleRailSettings) {
  try {
    themeStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session if storage is unavailable.
  }
}


function writeManagedStyle(id: string, css: string) {
  let element = document.getElementById(id) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = id;
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Writes the rail onto <html>: every var as an inline custom property except
 * the page colors, the Code panels knob as `data-code-panels` (the attribute
 * the dark-panel CSS keys on), the page colors into their mode-scoped
 * managed <style> (pageColorOverrideCss), and the panel restatement into its
 * managed <style> element.
 */
export function applyStyleRailVars(settings: StyleRailSettings) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(styleRailVars(settings))) {
    if (value === null || PAGE_COLOR_VARS.has(key)) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
  root.setAttribute("data-code-panels", settings.typography.codePanels);
  writeManagedStyle(PAGE_COLOR_STYLE_ELEMENT_ID, pageColorOverrideCss(settings));
  writeManagedStyle(CODE_PANEL_STYLE_ELEMENT_ID, codePanelOverrideCss(settings));
}


/**
 * Sibling of applyStyleRailVars for the rules that cannot be expressed as
 * custom properties. Maintains ONE <style> element in <head>, created once
 * and then only ever refilled, so the overrides can never accumulate stale
 * copies. No overrides = an empty element, not a removed one.
 */
export function applyBlockLayoutOverrideCss(settings: StyleRailSettings) {
  if (typeof document === "undefined") return;
  let element = document.getElementById(BLOCK_LAYOUT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = BLOCK_LAYOUT_STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  const css = blockLayoutOverrideCss(settings);
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Full-viewport SVG turbulence grain (ported from ccbcu's
 * DashboardStyleOverlay). Opacity/blend come from the CSS vars;
 * frequency/contrast bind here.
 */
export function StyleRailOverlay({ settings, dark }: { settings: StyleRailSettings; dark: boolean }) {
  const { grain } = settings;
  if (!grain.enabled) return null;
  // Static noise, the original recipe. Overlay is symmetric around the
  // base, so it gets plain mid-gray-centered noise. Multiply can only
  // darken and screen can only lighten, so for those the noise is biased
  // into the band next to the blend's neutral point (just below white for
  // multiply, just above black for screen) — the static lands without
  // shifting the page's average luminance.
  const blend = grain.blendMode === "auto" ? (dark ? "screen" : "overlay") : grain.blendMode;
  const bias =
    blend === "multiply"
      ? { scale: 0.45, offset: 0.55 }
      : blend === "screen"
        ? { scale: 0.45, offset: 0 }
        : { scale: 1, offset: 0 };
  const slope = grain.contrast * bias.scale;
  const intercept = ((1 - grain.contrast) / 2) * bias.scale + bias.offset;
  return (
    <div aria-hidden="true" className="docs-grain-layer">
      <svg className="h-full w-full" focusable="false" preserveAspectRatio="none">
        <filter id="docs-grain-filter" colorInterpolationFilters="sRGB">
          <feTurbulence
            baseFrequency={String(grain.frequency)}
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncG type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncB type="linear" slope={String(slope)} intercept={String(intercept)} />
            {/* feTurbulence emits noisy alpha too; make the layer opaque so
                the blend result depends only on the luminance above. */}
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
        </filter>
        <rect filter="url(#docs-grain-filter)" height="100%" width="100%" />
      </svg>
    </div>
  );
}

/** `global` = the host's shared theme, stored outside every repo. */
export type ThemePickerEntry = { id: string; name: string; source: "builtin" | "repo" | "global" };

const SELECTED_PANE_STORAGE_KEY = "docs-style-rail-selected";

export function StyleRail({
  collapsed,
  onCollapsedChange,
  settings,
  onSettingsChange,
  dark,
  onDarkChange,
  themes,
  activeThemeId,
  onSelectTheme,
  onSaveTheme,
  onSaveStyleToRepo,
  saveStyleLabel = "Save style to repo",
  codeTheme,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  settings: StyleRailSettings;
  onSettingsChange: (settings: StyleRailSettings) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  /** Theme catalogue: built-ins plus the repo's themes/ folders. */
  themes: ThemePickerEntry[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  /** Absent in static exports (no server to write the folder). */
  onSaveTheme?: (name: string) => void;
  /**
   * Promotes the current knobs to the repo BASELINE by writing them into
   * `themes/<id>/theme.json`. Absent whenever this host may not author the
   * theme — a static export, or a serve that is (or might still be)
   * `--theme-locked`; the server refuses such a write with 403 regardless.
   */
  onSaveStyleToRepo?: () => void;
  /** Button text for onSaveStyleToRepo; the shared global theme is not a repo file. */
  saveStyleLabel?: string;
  /** Central code theme picker (Typography pane); absent when it cannot be changed. */
  codeTheme?: CodeThemeControls;
}) {
  const [selectedPaneId, setSelectedPaneId] = useState<StyleRailPaneId>(() => {
    // docs-style-rail-section:* keys are retired; selection is the persisted pane UI state.
    try {
      const stored = projectStorage.getItem(SELECTED_PANE_STORAGE_KEY);
      return isStyleRailPaneId(stored) ? stored : "theme.presets";
    } catch {
      return "theme.presets";
    }
  });

  const selectPane = (paneId: StyleRailPaneId) => {
    setSelectedPaneId(paneId);
    try {
      projectStorage.setItem(SELECTED_PANE_STORAGE_KEY, paneId);
    } catch {
      // Session-only state when storage is unavailable.
    }
  };

  const activeThemeName =
    themes.find((theme) => theme.id === activeThemeId)?.name ?? activeThemeId ?? "Default";

  // Theme files: the exported JSON is exactly the persisted settings blob
  // plus the dark flag — importing runs it through normalizeSettings, so a
  // hand-edited or stale-schema file degrades to clamped defaults instead
  // of breaking the rail. See docs/20-implementation/40-theming.
  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ version: 1, dark, settings }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "docs-theme.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importTheme = (file: File) => {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as { dark?: unknown; settings?: unknown };
        onSettingsChange(normalizeSettings(parsed.settings ?? parsed));
        if (typeof parsed.dark === "boolean") onDarkChange(parsed.dark);
      } catch {
        // Not a theme file — leave the current theme untouched.
      }
    });
  };

  return (
    <aside
      className={cn(
        "relative z-20 hidden h-screen shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[3.25rem]" : "w-[46rem]",
      )}
    >
      <div
        className={cn(
          "flex h-11 shrink-0 items-center border-b px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        {!collapsed && (
          <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
            Style
          </div>
        )}
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand style controls" : "Collapse style controls"}
          className="style-icon-button"
          onClick={() => onCollapsedChange(!collapsed)}
          type="button"
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-1 items-start justify-center pt-4">
          <SlidersHorizontal className="h-4 w-4 text-foreground" />
        </div>
      ) : (
        <>
          <div className="style-rail-two-pane">
            <StyleRailPane
              activeThemeId={activeThemeId}
              activeThemeName={activeThemeName}
              codeTheme={codeTheme}
              dark={dark}
              onDarkChange={onDarkChange}
              onSaveTheme={onSaveTheme}
              onSelectTheme={onSelectTheme}
              onSettingsChange={onSettingsChange}
              selectedId={selectedPaneId}
              settings={settings}
              themes={themes}
            />
            <StyleRailNav
              dark={dark}
              onSelect={selectPane}
              selectedId={selectedPaneId}
              settings={settings}
            />
          </div>

          <div className="shrink-0 space-y-1.5 border-t p-2">
            <div className="flex gap-1.5">
              <button
                className="flex-1 rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={exportTheme}
                type="button"
              >
                Export theme
              </button>
              <label className="flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-center text-xs text-foreground hover:bg-muted hover:text-foreground">
                Import theme
                <input
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) importTheme(file);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
            {/* Writes the current knobs into the repo theme file, making
                them the baseline every consumer inherits. The debounced
                auto-save in App.tsx already does this in the background;
                this is the explicit, immediate affordance for "make what I
                am looking at the repo default". */}
            {onSaveStyleToRepo && (
              <button
                className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={onSaveStyleToRepo}
                type="button"
              >
                {saveStyleLabel}
              </button>
            )}
            {/* "Defaults" means the REPO baseline, not stock: resetting
                returns to the committed theme file, so a reset here matches
                what every other consumer of this repo already renders. */}
            <button
              className="w-full rounded-md border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSettingsChange(getStyleRailBaseline())}
              type="button"
            >
              Reset to defaults
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
