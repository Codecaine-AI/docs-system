import { centralProjectId, projectStorage } from "../data/project-storage";
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
import { ExportDialog } from "./ExportDialog";
import {
  StyleRail,
  StyleRailOverlay,
  applyBlockLayoutOverrideCss,
  applyStyleRailVars,
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
  type ThemeManifest,
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
  // Repo folder FIRST: the active theme folder is the durable rail authority
  // and overrides the compiled-in fallback of the same id.
  let definition: ThemeDefinition | null = null;
  try {
    // Static exports generate data/theme.json behind this same helper. Do not
    // skip it merely because there is no live theme route: the exported repo
    // theme is still the durable authority for that build.
    const { theme } = await getTheme(id);
    definition = readThemeDefinition(theme.id, theme, "repo");
  } catch {
    definition = null;
  }
  definition ??= BUILTIN_THEMES.find((theme) => theme.id === id) ?? null;
  if (!definition) return null;
  const resolved = resolveThemeChain(definition, (baseId) =>
    BUILTIN_THEMES.find((theme) => theme.id === baseId),
  );
  // resolveThemeChain deliberately flattens the runtime definition. Retain
  // the child folder's base id for write-back so editing a derived theme does
  // not silently sever its inheritance relationship.
  if (definition.manifest.base) resolved.manifest.base = definition.manifest.base;
  return resolved;
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
 * body writing `themes/<active-id>/theme.json` (+ `components/*.json`).
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
export function themeWritePayload(
  settings: StyleRailSettings,
  dark: boolean,
  themeId: string,
  activeTheme?: Pick<ThemeDefinition, "manifest" | "components">,
) {
  const { components, ...railDefaults } = settings;
  const preservedManifest: ThemeManifest = {
    ...(activeTheme?.manifest ?? { name: themeId === "default" ? "Default" : themeId }),
  };
  delete preservedManifest.railDefaults;
  delete preservedManifest.dark;
  // A settings component is sparse: changing one token must not replace the
  // whole active component file and erase its untouched sibling tokens.
  // Only files with rail edits are included, preserving the server's
  // additive behavior for every untouched file.
  const mergedComponents = Object.fromEntries(
    Object.entries(components).map(([file, overrides]) => [
      file,
      { ...(activeTheme?.components[file] ?? {}), ...overrides },
    ]),
  );
  return {
    id: themeId,
    manifest: {
      ...preservedManifest,
      dark,
      railDefaults: { ...railDefaults, components: {} },
    },
    components: mergedComponents,
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
  const [exportOpen, setExportOpen] = useState(false);
  const [tree, setTree] = useState<DocsTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(readHashPath());
  const [sidePeekOpen, setSidePeekOpen] = useState(false);
  const [dark, setDark] = useState<boolean>(
    () => projectStorage.getItem(THEME_STORAGE_KEY) === "dark",
  );
  const [styleSettings, setStyleSettings] = useState<StyleRailSettings>(() =>
    loadStyleRailSettings(),
  );
  const [styleRailCollapsed, setStyleRailCollapsed] = useState<boolean>(
    () => projectStorage.getItem(STYLE_RAIL_COLLAPSE_KEY) === "true",
  );
  const [themeId, setThemeId] = useState<string>(
    () => projectStorage.getItem(THEME_FOLDER_KEY) ?? "default",
  );
  // Serve-level theme lock (`docs-cli serve --theme-locked`): null until
  // GET /api/serve-config answers. Secondary apps serving their docs with
  // this framework are theme CONSUMERS — the repo default theme is law, the
  // rail is hidden, and NOTHING persists (localStorage rail state or the
  // themes/default folder) while the answer is unknown or locked.
  const [themeLocked, setThemeLocked] = useState<boolean | null>(null);
  // Lock status and the active theme are two separate async reads. The rail
  // stays unavailable until both have settled so a fast unlocked-config
  // response cannot expose controls whose edits would be overwritten by the
  // still-pending authoritative theme response.
  const [themeReady, setThemeReady] = useState(false);
  // False until the active repo/export theme has been read. A localStorage
  // blob may paint the first frame, but it is only a cache: it must never get
  // a chance to write over the repo while the authoritative read is pending.
  const settingsSeededRef = useRef(false);
  const activeThemeRef = useRef<ThemeDefinition | null>(null);
  const lastPersistedThemeRef = useRef<string | null>(null);
  // Theme-folder boot, gated on the serve config so the locked/unlocked
  // branch is decided before any theme state applies.
  //
  // The first thing that happens either way is installing the resolved
  // theme's railDefaults as the rail BASELINE: from here on "default" means
  // the repo file, not the compiled-in stock constant. That single call is
  // what carries the repo's style settings to a locked serve, a static
  // export, and any browser that has never seen this rail.
  //
  // A repo/export theme with railDefaults is authoritative in both unlocked
  // and locked hosts. localStorage is used only when no repo-side settings
  // exist, which keeps it useful as an offline/first-frame cache without
  // making it a competing source of truth. Locked hosts always ignore it.
  useEffect(() => {
    void getServeConfig().then(({ themeLocked: locked }) => {
      setThemeLocked(locked);
      void resolveThemeById(locked ? "default" : themeId).then((resolved) => {
        applyThemeCss(resolved);
        activeThemeRef.current = resolved;
        if (resolved && resolved.id !== themeId) setThemeId(resolved.id);
        const baseline = setStyleRailBaseline(resolved?.manifest.railDefaults);
        const repoSettingsAreAuthoritative =
          resolved?.source === "repo" && resolved.manifest.railDefaults !== undefined;
        const nextSettings =
          locked || repoSettingsAreAuthoritative ? baseline : loadStyleRailSettings();
        const nextDark =
          (locked || resolved?.source === "repo") && resolved?.manifest.dark !== undefined
            ? resolved.manifest.dark
            : dark;
        const persistedThemeId = resolved?.id ?? themeId;
        lastPersistedThemeRef.current = JSON.stringify(
          themeWritePayload(nextSettings, nextDark, persistedThemeId, resolved ?? undefined),
        );
        settingsSeededRef.current = true;
        setStyleSettings(nextSettings);
        setDark(nextDark);
        setThemeReady(true);
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
          activeThemeRef.current = resolved;
          const nextSettings = setStyleRailBaseline(resolved?.manifest.railDefaults);
          const nextDark = resolved?.manifest.dark ?? dark;
          lastPersistedThemeRef.current = JSON.stringify(
            themeWritePayload(nextSettings, nextDark, "default", resolved ?? undefined),
          );
          setStyleSettings(nextSettings);
          setDark(nextDark);
        })
        .finally(() => {
          inheritInFlightRef.current = false;
        });
    };
    window.addEventListener("focus", reapply);
    return () => window.removeEventListener("focus", reapply);
  }, [themeLocked, dark]);

  const handleSelectTheme = (id: string) => {
    void resolveThemeById(id).then((resolved) => {
      if (!resolved) return;
      applyThemeCss(resolved);
      activeThemeRef.current = resolved;
      // Selecting a theme rebases the rail on THAT theme's saved settings:
      // its railDefaults become both the running knobs and the baseline, so
      // the Reset button and the override dots follow the selection rather
      // than pointing back at the previous theme (or at stock).
      const nextSettings = setStyleRailBaseline(resolved.manifest.railDefaults);
      const nextDark = resolved.manifest.dark ?? dark;
      lastPersistedThemeRef.current = JSON.stringify(
        themeWritePayload(nextSettings, nextDark, resolved.id, resolved),
      );
      setStyleSettings(nextSettings);
      setDark(nextDark);
      setThemeId(id);
      projectStorage.setItem(THEME_FOLDER_KEY, id);
    });
  };

  // Every knob change updates the active theme: debounce-write the current
  // look (knobs + mode + component overrides as real token files) to the
  // repo's themes/<active-id> folder. localStorage still carries an instant
  // cache; the folder is the durable, committable record every consumer reads.
  //
  // `canAuthorTheme` is the ONE place that decides whether this host may
  // write the theme at all. A theme-locked serve is a CONSUMER of
  // themes/default, never an author — and until the serve config answers,
  // this serve must be ASSUMED locked (a write racing the config fetch
  // could clobber the primary theme with this origin's stale rail state).
  // The server independently refuses the POST with 403 when locked; this
  // flag just keeps a doomed request (and the Save button) off screen.
  const canAuthorTheme = !IS_STATIC && themeReady && themeLocked === false;
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canAuthorTheme) return;
    // Never write the theme folder before the boot seed has resolved — a
    // fresh browser would otherwise overwrite it with stock defaults.
    if (!settingsSeededRef.current) return;
    const payload = themeWritePayload(
      styleSettings,
      dark,
      themeId,
      activeThemeRef.current ?? undefined,
    );
    const signature = JSON.stringify(payload);
    // Theme boot/selection loaded this exact value from the repo. Do not
    // rewrite it merely because async initialization caused a React render.
    if (signature === lastPersistedThemeRef.current) return;
    if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(() => {
      themeSaveTimer.current = null;
      void saveTheme(payload)
        .then(() => {
          lastPersistedThemeRef.current = signature;
        })
        .catch(() => {
          // Offline/static hosts just keep the localStorage copy.
        });
    }, 1500);
    return () => {
      if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    };
  }, [styleSettings, dark, themeId, canAuthorTheme]);

  // Bumped whenever the baseline changes without the knobs changing, purely
  // to re-render: the baseline lives in a module, so React has no other way
  // to learn that the override dots and the Reset target just moved.
  const [, setBaselineVersion] = useState(0);

  // Explicit "save to repo": skips the debounce, writes the active theme now,
  // and promotes what was written to the baseline so the rail immediately
  // reports zero overrides — the knobs and the committed file agree.
  const handleSaveStyleToRepo = () => {
    if (!canAuthorTheme) return;
    if (themeSaveTimer.current !== null) {
      clearTimeout(themeSaveTimer.current);
      themeSaveTimer.current = null;
    }
    const payload = themeWritePayload(
      styleSettings,
      dark,
      themeId,
      activeThemeRef.current ?? undefined,
    );
    void saveTheme(payload)
      .then(() => {
        lastPersistedThemeRef.current = JSON.stringify(payload);
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
    if (!themeReady || themeLocked !== false) return;
    projectStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, themeLocked, themeReady]);

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
    if (!themeReady || themeLocked !== false) return;
    saveStyleRailSettings(styleSettings);
  }, [styleSettings, themeLocked, themeReady]);

  useEffect(() => {
    if (!themeReady || themeLocked !== false) return;
    projectStorage.setItem(STYLE_RAIL_COLLAPSE_KEY, String(styleRailCollapsed));
  }, [styleRailCollapsed, themeLocked, themeReady]);

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
              {centralProjectId() ? <a href="/" title="All documentation projects">Docs · Projects</a> : "Docs"}
              {IS_STATIC && (
                <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  static export
                </span>
              )}
            </div>
            {!IS_STATIC && <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-muted" disabled={!tree} onClick={() => setExportOpen(true)}>Export</button>}
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
              sidePeekOpen={sidePeekOpen}
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
          onOpenChange={setSidePeekOpen}
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
        {themeReady && themeLocked === false && (
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
      {exportOpen && tree && <ExportDialog tree={tree} currentPath={path} onClose={() => setExportOpen(false)} />}
    </DocsClientProvider>
  );
}
