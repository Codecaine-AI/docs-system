import {
  centralProjectId,
  globalStorageKey,
  projectStorage,
  setGlobalThemeActive,
  isGlobalThemeActive,
  themeStorage,
} from "../data/project-storage";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { GitBranchIcon, SlidersHorizontal } from "lucide-react";
import { DocsClientProvider, type DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { DocPeekPanel } from "@codecaine-ai/docs-viewer/doc-peek-panel";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";

import {
  ApiError,
  GLOBAL_THEME_ID,
  IS_STATIC,
  assetUrl,
  getServeConfig,
  getSiteConfig,
  getTheme,
  getTree,
  saveTheme,
  type SiteConfig,
} from "../data/api";
import { createStandaloneDocsClient } from "../data/client";
import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";
import { StandaloneSequenceEmbed } from "../pages/SequenceEmbed";
import { DocPage } from "../pages/DocPage";
import { RouterShell } from "../_components/RouterShell";
import { docTitleFromPath } from "../lib/doc-title";
import { ExportDialog } from "./ExportDialog";
import {
  StyleRailOverlay,
  StyleRailPanel,
  applyBlockLayoutOverrideCss,
  applyStyleRailVars,
  STYLE_RAIL_STORAGE_KEY,
  loadStyleRailSettings,
  normalizeSettings,
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
import { applyCodeThemeStyle } from "../theme/code-theme-style";
import { useCodeTheme } from "../theme/use-code-theme";

/**
 * Standalone docs workbench shell: the design-system app shell
 * (_components/RouterShell) with the docs tree in its collapsible sidebar,
 * the page title and actions in its topbar, the Style rail in its inspector,
 * and the main surface — a doc workbench page (#/<bundle path>, see DocPage
 * for the edit/annotate modes). Hash-based navigation so both `docs-cli
 * serve` and the static export deep-link from any host/subpath; the
 * light/dark toggle drives the docs theme tokens (.dark class +
 * data-theme attribute).
 *
 * Static exports (`isStatic`, the IS_STATIC build) are public reading sites:
 * the exported theme is applied as a locked consumer (nothing persists to
 * localStorage, nothing is written back), and every authoring surface is
 * absent — no style rail or its toggle, no Export button, and DocPage runs
 * read-only. The header shows the site title and repository link from
 * `data/site.json` (see getSiteConfig) instead.
 */

const THEME_STORAGE_KEY = "docs-viewer-theme";
const THEME_FOLDER_KEY = "docs-theme-folder-id";
const STYLE_RAIL_COLLAPSE_KEY = "docs-style-rail-collapsed";

/**
 * Whether the Style inspector starts open. The stored choice keeps the old
 * rail's key and values ("true" = collapsed). It opens on load only where the
 * old rail used to show (1024px and up), when stored open or with no stored
 * choice. Below 1024px it opens only on an explicit click: at 801–1023px it
 * would squeeze the page, and at 800px and below it covers it (rule 13).
 */
function initialStyleOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!window.matchMedia("(min-width: 1024px)").matches) return false;
  return projectStorage.getItem(STYLE_RAIL_COLLAPSE_KEY) !== "true";
}

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
  return flattenTheme(definition);
}

/**
 * The shared GLOBAL theme, as it renders before anyone has saved it: stock
 * rail settings and no token files. The first rail change writes it.
 */
function stockGlobalTheme(): ThemeDefinition {
  return {
    id: GLOBAL_THEME_ID,
    source: "builtin",
    manifest: { name: "Global", dark: false, railDefaults: {} },
    components: {},
  };
}

/**
 * Reads the shared global theme. A 404 means "not created yet": render stock
 * and let the first change create it (`writable`). Any OTHER failure also
 * renders stock but is NOT writable — a transient error must never let this
 * tab overwrite the one theme every project shares with stock-plus-one-knob.
 */
async function resolveGlobalTheme(): Promise<{ theme: ThemeDefinition; writable: boolean }> {
  try {
    const { theme } = await getTheme(GLOBAL_THEME_ID);
    const definition = readThemeDefinition(GLOBAL_THEME_ID, theme, "repo");
    if (definition) return { theme: flattenTheme(definition), writable: true };
    return { theme: stockGlobalTheme(), writable: false };
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return { theme: stockGlobalTheme(), writable: missing };
  }
}

function flattenTheme(definition: ThemeDefinition): ThemeDefinition {
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
    ...(activeTheme?.manifest ?? {
      name: themeId === "default" ? "Default" : themeId === GLOBAL_THEME_ID ? "Global" : themeId,
    }),
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

/** Header label for a repository link: "GitHub" for github.com, else generic. */
function repoLinkLabel(repoUrl: string): string {
  try {
    const host = new URL(repoUrl).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com") ? "GitHub" : "Repository";
  } catch {
    return "Repository";
  }
}

export interface AppProps {
  /**
   * Read-only public-site shell. Defaults to the build-time IS_STATIC flag;
   * a prop so tests can render the static shell (mirrors DocPage).
   */
  isStatic?: boolean;
}

export function App({ isStatic = IS_STATIC }: AppProps = {}) {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [tree, setTree] = useState<DocsTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(readHashPath());
  const [sidePeekOpen, setSidePeekOpen] = useState(false);
  // Light/dark and the rail settings are part of the theme's look, so their
  // instant cache follows the theme: origin-wide under the shared global
  // theme (themeStorage), per-project otherwise.
  const [dark, setDark] = useState<boolean>(
    () => themeStorage.getItem(THEME_STORAGE_KEY) === "dark",
  );
  const [styleSettings, setStyleSettings] = useState<StyleRailSettings>(() =>
    loadStyleRailSettings(),
  );
  // The machine-wide active code theme (docs-server code-themes.ts): applied
  // to every code pane below; null until (or unless) the API answers.
  const { theme: codeTheme, controls: codeThemeControls } = useCodeTheme();
  const [styleOpen, setStyleOpen] = useState<boolean>(initialStyleOpen);
  const styleButtonRef = useRef<HTMLButtonElement | null>(null);
  // DocPage portals its page actions into this topbar slot.
  const [topbarSlot, setTopbarSlot] = useState<HTMLSpanElement | null>(null);
  const [themeId, setThemeId] = useState<string>(() =>
    isGlobalThemeActive() ? GLOBAL_THEME_ID : projectStorage.getItem(THEME_FOLDER_KEY) ?? "default",
  );
  // `globalTheme` from GET /api/serve-config: the host serves one shared
  // theme (reserved id `global`, stored outside every repo) and EVERY project
  // renders it. A per-project THEME_FOLDER_KEY is ignored (not rewritten)
  // while it is on, so a host without it falls back to exactly today's pick.
  const [globalTheme, setGlobalTheme] = useState(false);
  // False only when the global theme read failed for a reason other than
  // "not created yet" — see resolveGlobalTheme.
  const [themeWritable, setThemeWritable] = useState(true);
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
    void getServeConfig().then(({ themeLocked: serverLocked, globalTheme: useGlobal }) => {
      // A static export is a theme CONSUMER exactly like a locked serve:
      // the exported theme is law, and no reader-side state persists.
      const locked = isStatic || serverLocked;
      // Decide the cache scope FIRST so every read below (and every later
      // write) targets the shared keys when the global theme is on. A locked
      // host persists nothing, including this flag.
      setGlobalThemeActive(useGlobal, !locked);
      setGlobalTheme(useGlobal);
      setThemeLocked(locked);
      // Re-read the per-project pick rather than trusting the initial state:
      // the first frame may have guessed "global" from the last visit.
      const requestedThemeId = useGlobal
        ? GLOBAL_THEME_ID
        : locked
          ? "default"
          : projectStorage.getItem(THEME_FOLDER_KEY) ?? "default";
      const cachedDark = themeStorage.getItem(THEME_STORAGE_KEY) === "dark";
      const load = useGlobal
        ? resolveGlobalTheme()
        : resolveThemeById(requestedThemeId).then((theme) => ({ theme, writable: true }));
      void load.then(({ theme: resolved, writable }) => {
        applyThemeCss(resolved);
        activeThemeRef.current = resolved;
        setThemeWritable(writable);
        const persistedThemeId = resolved?.id ?? requestedThemeId;
        setThemeId(persistedThemeId);
        const baseline = setStyleRailBaseline(resolved?.manifest.railDefaults);
        const repoSettingsAreAuthoritative =
          resolved?.source === "repo" && resolved.manifest.railDefaults !== undefined;
        // Under the global theme the server copy is the ONLY authority (stock
        // until it exists): the shared cache just paints the first frame, and
        // a stale per-project cache is never even read.
        const nextSettings =
          locked || useGlobal || repoSettingsAreAuthoritative ? baseline : loadStyleRailSettings();
        // A static site never reads the origin's cache (GitHub Pages shares
        // one origin across every project site): the export decides.
        const nextDark = useGlobal || isStatic
          ? resolved?.manifest.dark ?? false
          : (locked || resolved?.source === "repo") && resolved?.manifest.dark !== undefined
            ? resolved.manifest.dark
            : cachedDark;
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
    // Static exports are immutable: nothing upstream can change to inherit.
    if (isStatic || themeLocked !== true) return;
    const lockedThemeId = globalTheme ? GLOBAL_THEME_ID : "default";
    const reapply = () => {
      if (inheritInFlightRef.current) return;
      inheritInFlightRef.current = true;
      const load = globalTheme
        ? resolveGlobalTheme().then(({ theme }) => theme)
        : resolveThemeById("default");
      void load
        .then((resolved) => {
          applyThemeCss(resolved);
          // Re-install the baseline too, not just the knobs: the repo file
          // is the authority on this serve, so "default" must track it.
          activeThemeRef.current = resolved;
          const nextSettings = setStyleRailBaseline(resolved?.manifest.railDefaults);
          const nextDark = resolved?.manifest.dark ?? dark;
          lastPersistedThemeRef.current = JSON.stringify(
            themeWritePayload(nextSettings, nextDark, lockedThemeId, resolved ?? undefined),
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
  }, [isStatic, themeLocked, globalTheme, dark]);

  const handleSelectTheme = (id: string) => {
    const load =
      id === GLOBAL_THEME_ID
        ? resolveGlobalTheme().then(({ theme, writable }) => {
            setThemeWritable(writable);
            return theme;
          })
        : resolveThemeById(id);
    void load.then((resolved) => {
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
      // The global theme is chosen by the host, not remembered per project.
      if (id !== GLOBAL_THEME_ID) projectStorage.setItem(THEME_FOLDER_KEY, id);
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
  const canAuthorTheme = !isStatic && themeReady && themeLocked === false && themeWritable;
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

  // The picker shows ONE theme (Ford: still figuring the theme out —
  // nothing clickable that could wipe the working look): the shared Global
  // theme when the host serves it (or when a static export snapshotted it),
  // otherwise the repo's Default.
  const themePickerEntries: ThemePickerEntry[] = globalTheme || themeId === GLOBAL_THEME_ID
    ? [{ id: GLOBAL_THEME_ID, name: "Global", source: "global" }]
    : [{ id: "default", name: "Default", source: "builtin" }];

  // Other tabs (any project on this origin) changing the global theme write
  // the shared cache instantly; follow them without a reload. The incoming
  // value is recorded as already persisted so this tab does not echo the
  // other tab's debounced POST back to the server.
  const styleSettingsRef = useRef(styleSettings);
  styleSettingsRef.current = styleSettings;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  useEffect(() => {
    if (!globalTheme || !themeReady || themeLocked !== false) return;
    const settingsKey = globalStorageKey(STYLE_RAIL_STORAGE_KEY);
    const darkKey = globalStorageKey(THEME_STORAGE_KEY);
    const onStorage = (event: StorageEvent) => {
      if (event.newValue === null) return;
      let nextSettings = styleSettingsRef.current;
      let nextDark = darkRef.current;
      if (event.key === settingsKey) {
        try {
          nextSettings = normalizeSettings(JSON.parse(event.newValue));
        } catch {
          return;
        }
      } else if (event.key === darkKey) {
        nextDark = event.newValue === "dark";
      } else {
        return;
      }
      lastPersistedThemeRef.current = JSON.stringify(
        themeWritePayload(nextSettings, nextDark, GLOBAL_THEME_ID, activeThemeRef.current ?? undefined),
      );
      setStyleSettings(nextSettings);
      setDark(nextDark);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [globalTheme, themeLocked, themeReady]);

  useEffect(() => {
    applyTheme(dark);
    if (!themeReady || themeLocked !== false) return;
    themeStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
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
    // The active code theme, scoped to code panes. It reads the rail's vars
    // so an explicit rail override of a code token keeps winning.
    applyCodeThemeStyle(codeTheme, styleSettings);
  }, [codeTheme, styleSettings]);

  // The Style inspector exists only where the rail did: an unlocked live
  // serve whose theme has loaded. Only an explicit open or close is stored,
  // and only there, so static and locked hosts persist nothing.
  const styleAvailable = !isStatic && themeReady && themeLocked === false;
  // Set while the side peek has closed an open Style inspector: closing the
  // peek reopens it, unless the user opened or closed Style meanwhile.
  const peekClosedStyleRef = useRef(false);
  const styleOpenRef = useRef(styleOpen);
  styleOpenRef.current = styleOpen;
  const setStyleOpenByUser = useCallback(
    (next: boolean) => {
      peekClosedStyleRef.current = false;
      setStyleOpen(next);
      if (styleAvailable) projectStorage.setItem(STYLE_RAIL_COLLAPSE_KEY, String(!next));
    },
    [styleAvailable],
  );
  // Every close path (the topbar button, the close button, Escape) returns
  // focus to the Style button, including when the inspector mounted open.
  const closeStyle = useCallback(() => {
    setStyleOpenByUser(false);
    styleButtonRef.current?.focus({ preventScroll: true });
  }, [setStyleOpenByUser]);
  const handleStyleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // IME composition owns Escape: keep the inspector open.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation();
      event.nativeEvent.stopPropagation();
      return;
    }
    // Handled here, so the shell's own Escape handler leaves it alone.
    event.preventDefault();
    closeStyle();
  };
  // One Escape inside the inspector closes only the inspector: the side
  // peek (window listener) and DocPage's AI mode (document listener) never
  // see it. This also covers the inspector header's close button, whose
  // Escape the shell handles. React dispatches at the root, before both.
  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (event.target instanceof Element && event.target.closest(".ds-inspector")) {
      event.nativeEvent.stopPropagation();
    }
  };
  // The side peek and the Style inspector share the right edge: opening a
  // peek closes an open Style inspector without storing that (as the peek
  // already hides the AI dock), and closing the peek reopens it.
  const handlePeekOpenChange = useCallback((open: boolean) => {
    setSidePeekOpen(open);
    if (open) {
      if (styleOpenRef.current) {
        peekClosedStyleRef.current = true;
        setStyleOpen(false);
      }
    } else if (peekClosedStyleRef.current) {
      peekClosedStyleRef.current = false;
      setStyleOpen(true);
    }
  }, []);

  // No shell transition while the theme boots: the inspector appears once the
  // theme has loaded, and must not slide in on page load.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    if (!booting) return;
    let frame = 0;
    const settle = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setBooting(false));
      });
    };
    if (themeReady) {
      settle();
      return () => cancelAnimationFrame(frame);
    }
    // A serve that never answers still gets its transitions back.
    const timer = setTimeout(settle, 3000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [booting, themeReady]);

  // Layout rule 10: the topbar h1 and the window title name the same page. A
  // static export keeps its site title as the window title.
  useEffect(() => {
    if (isStatic) return;
    document.title = path ? docTitleFromPath(path) : "Docs";
  }, [isStatic, path]);

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

  useEffect(() => {
    if (!isStatic) return;
    let active = true;
    void getSiteConfig(isStatic).then((config) => {
      if (!active) return;
      setSiteConfig(config);
      if (config.title) document.title = config.title;
    });
    return () => {
      active = false;
    };
  }, [isStatic]);

  const client = useMemo(() => createStandaloneDocsClient(), []);

  return (
    <DocsClientProvider
      client={client}
      canvasEmbed={StandaloneCanvasEmbed}
      sequenceEmbed={StandaloneSequenceEmbed}
    >
      {/* The style engine's root (.docs-style-shell: the softening effects)
          wraps the whole shell so its knobs reach the sidebar, topbar and
          inspector too. */}
      <div
        className="docs-style-shell docs-app"
        data-docs-booting={booting ? "" : undefined}
        onKeyDown={handleShellKeyDown}
      >
        <RouterShell
          appName={
            siteConfig.title ? (
              <span data-docs-site-title="">{siteConfig.title}</span>
            ) : centralProjectId() ? (
              <a href="/" title="All documentation projects">Docs · Projects</a>
            ) : (
              "Docs"
            )
          }
          title={
            path ? (
              <>
                {/* The old DocPage header's breadcrumb, above the page title. */}
                <span className="docs-topbar-crumb" title={path} aria-hidden="true">
                  docs/{path}
                </span>
                <span className="docs-topbar-page">{docTitleFromPath(path)}</span>
              </>
            ) : (
              siteConfig.title ?? "Docs"
            )
          }
          actions={
            <>
              {/* DocPage's page actions (save state, undo, AI panel) portal in here. */}
              <span key="page-actions" ref={setTopbarSlot} className="contents" />
              {isStatic && siteConfig.repoUrl && (
                <a
                  key="repo"
                  href={siteConfig.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-docs-repo-link=""
                  title={`Source repository: ${siteConfig.repoUrl}`}
                  className="ds-shell-button"
                >
                  <GitBranchIcon aria-hidden="true" />
                  {repoLinkLabel(siteConfig.repoUrl)}
                </a>
              )}
              {styleAvailable && (
                <button
                  key="style"
                  ref={styleButtonRef}
                  type="button"
                  className="ds-shell-button"
                  aria-expanded={styleOpen}
                  aria-controls="ds-inspector"
                  // The side peek owns the right edge while it is open (it
                  // closed Style and reopens it on close), as for the AI
                  // toggle: Style beside it would leave the doc no room.
                  disabled={sidePeekOpen}
                  title={sidePeekOpen ? "Close the document preview to use Style" : undefined}
                  onClick={() => (styleOpen ? closeStyle() : setStyleOpenByUser(true))}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  Style
                </button>
              )}
              {/* Last: when the bar runs out of room (Style open at laptop
                  widths), the actions scroll and Export goes first. */}
              {!isStatic && (
                <button
                  key="export"
                  type="button"
                  className="ds-shell-button"
                  disabled={!tree}
                  onClick={() => setExportOpen(true)}
                >
                  Export
                </button>
              )}
            </>
          }
          tree={tree}
          treeError={treeError}
          selectedPath={path}
          isStatic={isStatic}
          persistSidebar={themeReady && themeLocked === false}
          inspector={
            // The Style rail is the one inspector: the chrome panel this
            // host persists. Hidden entirely on a theme-locked serve or a
            // static export (the rail IS the authoring surface). The doc
            // preview (DocPeekPanel) and the AI dock stay page panels inside
            // the doc column: they belong to the document, not the chrome.
            styleAvailable
              ? {
                  title: "Style",
                  open: styleOpen,
                  onClose: closeStyle,
                  content: (
                    <div className="docs-style-inspector" onKeyDown={handleStyleKeyDown}>
                      <StyleRailPanel
                        settings={styleSettings}
                        onSettingsChange={setStyleSettings}
                        dark={dark}
                        onDarkChange={setDark}
                        themes={themePickerEntries}
                        activeThemeId={themeId}
                        onSelectTheme={handleSelectTheme}
                        onSaveStyleToRepo={canAuthorTheme ? handleSaveStyleToRepo : undefined}
                        saveStyleLabel={globalTheme ? "Save global style" : undefined}
                        codeTheme={codeThemeControls}
                      />
                    </div>
                  ),
                }
              : undefined
          }
        >
          <div className="docs-workspace flex min-h-0">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {path ? (
                <DocPage
                  path={path}
                  isStatic={isStatic}
                  sidePeekOpen={sidePeekOpen}
                  topbarActionsTarget={topbarSlot}
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
                <div className="flex h-full items-center justify-center p-8 text-ui-lg text-muted-foreground">
                  Select a doc from the tree
                </div>
              )}
            </div>
            {/* Side-peek push drawer: a self-contained width-animated flex
                sibling (collapsed to w-0 when closed) docked against the doc
                content. It listens for spectre:doc-reference-navigate itself;
                the host only supplies navigation + asset resolution. */}
            <DocPeekPanel
              projectId="local"
              onOpenChange={handlePeekOpenChange}
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
          </div>
        </RouterShell>
      </div>
      <StyleRailOverlay settings={styleSettings} dark={dark} />
      {!isStatic && exportOpen && tree && <ExportDialog tree={tree} currentPath={path} onClose={() => setExportOpen(false)} />}
    </DocsClientProvider>
  );
}
