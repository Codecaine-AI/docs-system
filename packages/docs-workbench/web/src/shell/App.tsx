import { useEffect, useMemo, useRef, useState } from "react";
import { DocsClientProvider, type DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { DocPeekPanel } from "@codecaine-ai/docs-viewer/doc-peek-panel";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";

import { IS_STATIC, assetUrl, getServeConfig, getTheme, getTree, saveTheme } from "../data/api";
import { createStandaloneDocsClient } from "../data/client";
import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";
import { StandaloneSequenceEmbed } from "../pages/SequenceEmbed";
import { DocPage } from "../pages/DocPage";
import { Sidebar } from "./Sidebar";
import {
  StyleRail,
  StyleRailOverlay,
  applyBlockLayoutOverrideCss,
  applyStyleRailVars,
  hasStoredStyleRailSettings,
  loadStyleRailSettings,
  saveStyleRailSettings,
  setStyleRailBaseline,
  type StyleRailSettings,
  type ThemePickerEntry,
} from "./StyleRail";
import {
  BUILTIN_THEMES,
  applyThemeCss,
  readThemeDefinition,
  resolveThemeChain,
  type ThemeDefinition,
} from "../theme/theme-folders";

/**
 * Standalone docs workbench shell: left sidebar (docs tree + theme toggle)
 * and the main surface — a doc workbench page (#/<bundle path>, see DocPage
 * for the edit/annotate modes). Hash-based navigation so both `docs-cli
 * serve` and the static export deep-link from any host/subpath; the
 * light/dark toggle drives the docs theme tokens (.dark class +
 * data-theme attribute).
 */

const THEME_STORAGE_KEY = "docs-viewer-theme";
const THEME_FOLDER_KEY = "docs-theme-folder-id";
const STYLE_RAIL_COLLAPSE_KEY = "docs-style-rail-collapsed";

/**
 * Resolve a theme id to its flattened definition: built-ins from the
 * compiled-in catalogue, anything else fetched from the repo's themes/
 * folder via the server. Base chains resolve against BUILT-INS only (a repo
 * theme basing on another repo theme is a documented v1 limitation).
 */
async function resolveThemeById(id: string): Promise<ThemeDefinition | null> {
  // Repo folder FIRST: themes/default (auto-saved from the rail) is Ford's
  // living core theme and overrides the compiled-in fallback of the same id.
  let definition: ThemeDefinition | null = null;
  if (!IS_STATIC) {
    try {
      const { theme } = await getTheme(id);
      definition = readThemeDefinition(theme.id, theme, "repo");
    } catch {
      definition = null;
    }
  }
  definition ??= BUILTIN_THEMES.find((theme) => theme.id === id) ?? null;
  if (!definition) return null;
  return resolveThemeChain(definition, (baseId) =>
    BUILTIN_THEMES.find((theme) => theme.id === baseId),
  );
}

/**
 * Retired section intros lived at `<section>/00-overview`. Collapse only
 * trailing overview segments, keeping a parentless `00-overview` bundle valid.
 */
function collapseOverviewPath(path: string): string {
  const withoutTrailingSlash = path.replace(/\/+$/, "");
  let collapsed = withoutTrailingSlash;

  while (collapsed.includes("/") && collapsed.endsWith("/00-overview")) {
    collapsed = collapsed.slice(0, -"/00-overview".length);
  }

  return collapsed === withoutTrailingSlash ? path : collapsed;
}

/**
 * The repo-side shape of the style rail's settings: one `POST /api/themes`
 * body writing `themes/default/theme.json` (+ `components/*.json`).
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
function themeWritePayload(settings: StyleRailSettings, dark: boolean) {
  const { components, ...railDefaults } = settings;
  return {
    id: "default",
    manifest: {
      name: "Default",
      dark,
      railDefaults: { ...railDefaults, components: {} },
    },
    components,
  };
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function readHashPath(): string | null {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return null;
  try {
    return collapseOverviewPath(decodeURIComponent(hash));
  } catch {
    return collapseOverviewPath(hash);
  }
}

function normalizeLegacyOverviewHash(): void {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return;

  let decodedHash: string;
  try {
    decodedHash = decodeURIComponent(hash);
  } catch {
    decodedHash = hash;
  }

  const collapsed = collapseOverviewPath(decodedHash);
  if (collapsed === decodedHash) return;

  // replaceState adds no history entry and does not fire hashchange, so this
  // canonicalization cannot start a navigation loop.
  window.history.replaceState(window.history.state, "", `#/${collapsed}`);
}

function firstBundlePath(nodes: DocsTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "bundle") return node.path;
    if (node.children) {
      const nested = firstBundlePath(node.children);
      if (nested) return nested;
    }
  }
  return null;
}

export function App() {
  const [tree, setTree] = useState<DocsTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(readHashPath());
  const [dark, setDark] = useState<boolean>(
    () => localStorage.getItem(THEME_STORAGE_KEY) === "dark",
  );
  const [styleSettings, setStyleSettings] = useState<StyleRailSettings>(() =>
    loadStyleRailSettings(),
  );
  const [styleRailCollapsed, setStyleRailCollapsed] = useState<boolean>(
    () => localStorage.getItem(STYLE_RAIL_COLLAPSE_KEY) === "true",
  );
  const [themeId, setThemeId] = useState<string>(
    () => localStorage.getItem(THEME_FOLDER_KEY) ?? "default",
  );
  // Serve-level theme lock (`docs-cli serve --theme-locked`): null until
  // GET /api/serve-config answers. Secondary apps serving their docs with
  // this framework are theme CONSUMERS — the repo default theme is law, the
  // rail is hidden, and NOTHING persists (localStorage rail state or the
  // themes/default folder) while the answer is unknown or locked.
  const [themeLocked, setThemeLocked] = useState<boolean | null>(null);
  // True once this browser's rail state is trustworthy: either it was
  // already persisted locally, or the boot effect below seeded it from the
  // repo's saved default theme. Guards the theme-folder auto-save so a fresh
  // browser can never overwrite the saved theme with stock settings.
  const settingsSeededRef = useRef(hasStoredStyleRailSettings());
  // Theme-folder boot, gated on the serve config so the locked/unlocked
  // branch is decided before any theme state applies.
  //
  // The first thing that happens either way is installing the resolved
  // theme's railDefaults as the rail BASELINE: from here on "default" means
  // the repo file, not the compiled-in stock constant. That single call is
  // what carries the repo's style settings to a locked serve, a static
  // export, and any browser that has never seen this rail.
  //
  // Unlocked: re-inject the theme's CSS layer, then decide the knobs. A
  // fresh browser has no stored blob, so it simply RUNS at the baseline. A
  // browser that does have one keeps it — but re-read through
  // loadStyleRailSettings now that the baseline is known, so keys the blob
  // lacks (a partial or stale-schema blob) resolve to the repo's values
  // instead of stock. Locked: the repo theme's CSS layer AND its
  // railDefaults both apply, unconditionally — this origin's localStorage
  // rail state is exactly the drift the lock exists to override.
  useEffect(() => {
    void getServeConfig().then(({ themeLocked: locked }) => {
      setThemeLocked(locked);
      void resolveThemeById(locked ? "default" : themeId).then((resolved) => {
        applyThemeCss(resolved);
        const baseline = setStyleRailBaseline(resolved?.manifest.railDefaults);
        if (locked) {
          setStyleSettings(baseline);
          if (resolved?.manifest.dark !== undefined) setDark(resolved.manifest.dark);
          settingsSeededRef.current = true;
          return;
        }
        if (!settingsSeededRef.current) {
          setStyleSettings(baseline);
          if (resolved?.manifest.dark !== undefined) setDark(resolved.manifest.dark);
          settingsSeededRef.current = true;
          return;
        }
        setStyleSettings(loadStyleRailSettings());
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot only; selection re-applies explicitly
  }, []);

  // Live inherit (locked serves only): the primary app auto-saves rail
  // tuning to themes/default, so tab-back is the natural "did it propagate"
  // moment — re-fetch and re-apply the theme on window focus rather than
  // demanding a reload. The in-flight ref keeps focus flapping from
  // stacking fetches whose out-of-order responses could apply stale theme.
  const inheritInFlightRef = useRef(false);
  useEffect(() => {
    if (themeLocked !== true) return;
    const reapply = () => {
      if (inheritInFlightRef.current) return;
      inheritInFlightRef.current = true;
      void resolveThemeById("default")
        .then((resolved) => {
          applyThemeCss(resolved);
          // Re-install the baseline too, not just the knobs: the repo file
          // is the authority on this serve, so "default" must track it.
          setStyleSettings(setStyleRailBaseline(resolved?.manifest.railDefaults));
          if (resolved?.manifest.dark !== undefined) setDark(resolved.manifest.dark);
        })
        .finally(() => {
          inheritInFlightRef.current = false;
        });
    };
    window.addEventListener("focus", reapply);
    return () => window.removeEventListener("focus", reapply);
  }, [themeLocked]);

  const handleSelectTheme = (id: string) => {
    void resolveThemeById(id).then((resolved) => {
      if (!resolved) return;
      applyThemeCss(resolved);
      // Selecting a theme rebases the rail on THAT theme's saved settings:
      // its railDefaults become both the running knobs and the baseline, so
      // the Reset button and the override dots follow the selection rather
      // than pointing back at the previous theme (or at stock).
      setStyleSettings(setStyleRailBaseline(resolved.manifest.railDefaults));
      if (resolved.manifest.dark !== undefined) setDark(resolved.manifest.dark);
      setThemeId(id);
      localStorage.setItem(THEME_FOLDER_KEY, id);
    });
  };

  // While Ford iterates on WHAT the default theme is, every knob change IS
  // the default theme: debounce-write the current look (knobs + mode +
  // component overrides as real token files) to the repo's themes/default
  // folder. localStorage still carries the instant per-session state; the
  // folder is the durable, committable record every consumer reads.
  //
  // `canAuthorTheme` is the ONE place that decides whether this host may
  // write the theme at all. A theme-locked serve is a CONSUMER of
  // themes/default, never an author — and until the serve config answers,
  // this serve must be ASSUMED locked (a write racing the config fetch
  // could clobber the primary theme with this origin's stale rail state).
  // The server independently refuses the POST with 403 when locked; this
  // flag just keeps a doomed request (and the Save button) off screen.
  const canAuthorTheme = !IS_STATIC && themeLocked === false;
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canAuthorTheme) return;
    // Never write the theme folder before the boot seed has resolved — a
    // fresh browser would otherwise overwrite it with stock defaults.
    if (!settingsSeededRef.current) return;
    if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(() => {
      themeSaveTimer.current = null;
      void saveTheme(themeWritePayload(styleSettings, dark)).catch(() => {
        // Offline/static hosts just keep the localStorage copy.
      });
    }, 1500);
    return () => {
      if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    };
  }, [styleSettings, dark, canAuthorTheme]);

  // Bumped whenever the baseline changes without the knobs changing, purely
  // to re-render: the baseline lives in a module, so React has no other way
  // to learn that the override dots and the Reset target just moved.
  const [, setBaselineVersion] = useState(0);

  // Explicit "make this the repo default": skips the debounce, writes now,
  // and promotes what was written to the baseline so the rail immediately
  // reports zero overrides — the knobs and the committed file agree.
  const handleSaveStyleToRepo = () => {
    if (!canAuthorTheme) return;
    if (themeSaveTimer.current !== null) {
      clearTimeout(themeSaveTimer.current);
      themeSaveTimer.current = null;
    }
    const payload = themeWritePayload(styleSettings, dark);
    void saveTheme(payload)
      .then(() => {
        setStyleRailBaseline(payload.manifest.railDefaults);
        setBaselineVersion((version) => version + 1);
      })
      .catch(() => {
        // A refused write (403 on a locked serve, or an offline host) must
        // NOT move the baseline: the repo file is unchanged, so the knobs
        // stay reported as local overrides.
      });
  };

  // The picker shows ONLY Default (Ford: still figuring the theme out —
  // nothing clickable that could wipe the working look).
  const themePickerEntries: ThemePickerEntry[] = [
    { id: "default", name: "Default", source: "builtin" },
  ];

  useEffect(() => {
    applyTheme(dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    applyStyleRailVars(styleSettings);
    // Per-block-type lane overrides ride alongside the custom properties.
    // They cannot BE custom properties — each one targets a different
    // `[data-doc-lane][data-doc-block-type]` pair — so they go out as real
    // rules in a managed <style> element. Applied in the same effect so the
    // two halves of the rail's output can never drift a frame apart.
    applyBlockLayoutOverrideCss(styleSettings);
    // Rail state never persists on a locked (or not-yet-resolved) serve:
    // the settings in play are the repo theme's, and echoing them into this
    // origin's localStorage would seed drift for any future unlocked run.
    if (themeLocked !== false) return;
    saveStyleRailSettings(styleSettings);
  }, [styleSettings, themeLocked]);

  useEffect(() => {
    localStorage.setItem(STYLE_RAIL_COLLAPSE_KEY, String(styleRailCollapsed));
  }, [styleRailCollapsed]);

  useEffect(() => {
    // The initializer already gave state the collapsed path; canonicalize the
    // visible URL after mount to keep render free of navigation side effects.
    normalizeLegacyOverviewHash();

    const onHashChange = () => {
      const nextPath = readHashPath();
      normalizeLegacyOverviewHash();
      setPath(nextPath);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    void getTree()
      .then(({ tree: nodes }) => {
        setTree(nodes);
        // No selection yet — land on the first doc in the tree.
        if (!readHashPath()) {
          const first = firstBundlePath(nodes);
          if (first) window.location.hash = `#/${first}`;
        }
      })
      .catch((error) => {
        setTreeError(error instanceof Error ? error.message : "Failed to load docs tree");
      });
  }, []);

  const client = useMemo(() => createStandaloneDocsClient(), []);

  return (
    <DocsClientProvider
      client={client}
      canvasEmbed={StandaloneCanvasEmbed}
      sequenceEmbed={StandaloneSequenceEmbed}
    >
      <div className="docs-style-shell flex h-screen w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
            <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
              Docs
              {IS_STATIC && (
                <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  static export
                </span>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {treeError ? (
              <div className="p-3 text-sm text-destructive">{treeError}</div>
            ) : tree ? (
              <Sidebar tree={tree} selectedPath={path} />
            ) : (
              <div className="p-3 text-sm text-muted-foreground">Loading tree...</div>
            )}
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {path ? (
            <DocPage
              path={path}
              onDocMoved={(newPath) => {
                // A title rename moved the bundle: follow it and let the
                // sidebar pick up the new name.
                window.location.hash = `#/${newPath}`;
                void getTree()
                  .then(({ tree: nodes }) => setTree(nodes))
                  .catch(() => {});
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Select a doc from the tree
            </div>
          )}
        </main>
        {/* Side-peek push drawer: a self-contained width-animated flex
            sibling (collapsed to w-0 when closed) docked against the doc
            content. It listens for spectre:doc-reference-navigate itself;
            the host only supplies navigation + asset resolution. */}
        <DocPeekPanel
          projectId="local"
          onNavigate={(ref: SpectreRef) => {
            if (ref.kind === "doc") {
              window.location.hash = `#/${ref.path}`;
            }
            // "source" refs have no navigation target in the workbench yet.
          }}
          // Same underlying helper DocPage's resolver closes over. Only the
          // panel knows the peeked doc's bundle path, so bundle-relative
          // (`./assets/...`) canonicalization has to happen viewer-side —
          // the host can only map docs-root-relative srcs to fetchable URLs.
          resolveAssetSrc={assetUrl}
        />

        {/* Hidden entirely on a theme-locked serve (rail + its collapse
            tab): the rail IS the authoring surface, and locked viewers only
            consume. The grain overlay below is part of the theme's look,
            not a tuning affordance, so it renders regardless. */}
        {themeLocked !== true && (
          <StyleRail
            collapsed={styleRailCollapsed}
            onCollapsedChange={setStyleRailCollapsed}
            settings={styleSettings}
            onSettingsChange={setStyleSettings}
            dark={dark}
            onDarkChange={setDark}
            themes={themePickerEntries}
            activeThemeId={themeId}
            onSelectTheme={handleSelectTheme}
            onSaveStyleToRepo={canAuthorTheme ? handleSaveStyleToRepo : undefined}
          />
        )}
      </div>
      <StyleRailOverlay settings={styleSettings} dark={dark} />
    </DocsClientProvider>
  );
}
