import { useEffect, useMemo, useState } from "react";
import { BlocksIcon } from "lucide-react";
import { DocsClientProvider, type DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

import { IS_STATIC, getTheme, getThemes, getTree, saveTheme, type ThemeListEntry } from "../data/api";
import { createStandaloneDocsClient } from "../data/client";
import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";
import { BlocksPage } from "../pages/BlocksPage";
import { DocPage } from "../pages/DocPage";
import { Sidebar } from "./Sidebar";
import {
  StyleRail,
  StyleRailOverlay,
  applyStyleRailVars,
  loadStyleRailSettings,
  normalizeSettings,
  saveStyleRailSettings,
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
 * Standalone docs workbench shell: left sidebar (docs tree + block-library
 * nav + theme toggle) and the main surface — either the block library
 * (#/blocks) or a doc workbench page (#/<bundle path>, see DocPage for the
 * edit/annotate modes). Hash-based navigation so both `docs-cli serve`
 * and the static export deep-link from any host/subpath; the light/dark
 * toggle drives the docs theme tokens (.dark class +
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
  let definition = BUILTIN_THEMES.find((theme) => theme.id === id) ?? null;
  if (!definition && !IS_STATIC) {
    try {
      const { theme } = await getTheme(id);
      definition = readThemeDefinition(theme.id, theme, "repo");
    } catch {
      return null;
    }
  }
  if (!definition) return null;
  return resolveThemeChain(definition, (baseId) =>
    BUILTIN_THEMES.find((theme) => theme.id === baseId),
  );
}

/** "My Theme!" -> "my-theme" (the server's slug rule). */
function themeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
/** `#/blocks` — the block library route (unless the tree really has a bundle at that path). */
const BLOCKS_ROUTE = "blocks";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function readHashPath(): string | null {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return null;
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
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

function hasBundleAt(nodes: DocsTreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.path === path && node.kind === "bundle") return true;
    if (node.children && hasBundleAt(node.children, path)) return true;
  }
  return false;
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
  const [repoThemes, setRepoThemes] = useState<ThemeListEntry[]>([]);

  // Theme-folder boot: re-inject the persisted theme's CSS layer (WITHOUT
  // its railDefaults — the user's own knob state persisted separately) and
  // load the repo themes/ catalogue.
  useEffect(() => {
    void resolveThemeById(themeId).then((resolved) => applyThemeCss(resolved));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot only; selection re-applies explicitly
  }, []);
  useEffect(() => {
    void getThemes()
      .then(({ themes }) => setRepoThemes(themes))
      .catch(() => setRepoThemes([]));
  }, []);

  const handleSelectTheme = (id: string) => {
    void resolveThemeById(id).then((resolved) => {
      if (!resolved) return;
      applyThemeCss(resolved);
      // Selecting a theme applies its rail defaults + dark flag ONCE (the
      // rail stays a personal overlay afterwards — see 40-theming).
      if (resolved.manifest.railDefaults) {
        setStyleSettings(normalizeSettings(resolved.manifest.railDefaults));
      }
      if (resolved.manifest.dark !== undefined) setDark(resolved.manifest.dark);
      setThemeId(id);
      localStorage.setItem(THEME_FOLDER_KEY, id);
    });
  };

  const handleSaveTheme = (name: string) => {
    const id = themeSlug(name);
    if (!id) return;
    // Component overrides become REAL theme component files; the remaining
    // knobs ride as railDefaults (selection-time preset). One value covers
    // both modes — the picker edits whatever mode you're in.
    const { components, ...railDefaults } = styleSettings;
    void saveTheme({
      id,
      manifest: {
        name,
        // Snapshot semantics: layer over the active theme, capture the
        // current knobs + mode as the theme's selection defaults.
        base: themeId === id ? "default" : themeId,
        dark,
        railDefaults: { ...railDefaults, components: {} },
      },
      components,
    })
      .then(() => getThemes())
      .then(({ themes }) => {
        setRepoThemes(themes);
        setThemeId(id);
        localStorage.setItem(THEME_FOLDER_KEY, id);
      })
      .catch(() => {});
  };

  const themePickerEntries: ThemePickerEntry[] = [
    ...BUILTIN_THEMES.map((theme) => ({
      id: theme.id,
      name: theme.manifest.name,
      source: "builtin" as const,
    })),
    ...repoThemes
      .filter((theme) => !BUILTIN_THEMES.some((builtin) => builtin.id === theme.id))
      .map((theme) => ({ ...theme, source: "repo" as const })),
  ];

  useEffect(() => {
    applyTheme(dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    applyStyleRailVars(styleSettings);
    saveStyleRailSettings(styleSettings);
  }, [styleSettings]);

  useEffect(() => {
    localStorage.setItem(STYLE_RAIL_COLLAPSE_KEY, String(styleRailCollapsed));
  }, [styleRailCollapsed]);

  useEffect(() => {
    const onHashChange = () => setPath(readHashPath());
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

  const isBlocksRoute = path === BLOCKS_ROUTE && !(tree ? hasBundleAt(tree, BLOCKS_ROUTE) : false);

  return (
    <DocsClientProvider client={client} canvasEmbed={StandaloneCanvasEmbed}>
      <div className="docs-style-shell flex h-screen w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
            <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
              Docs
              {IS_STATIC && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  static export
                </span>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {treeError ? (
              <div className="p-3 text-sm text-destructive">{treeError}</div>
            ) : tree ? (
              <Sidebar tree={tree} selectedPath={isBlocksRoute ? null : path} />
            ) : (
              <div className="p-3 text-sm text-muted-foreground">Loading tree...</div>
            )}
          </div>
          <div className="shrink-0 border-t p-2">
            <a
              href={`#/${BLOCKS_ROUTE}`}
              data-docs-nav="blocks"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm no-underline",
                isBlocksRoute
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <BlocksIcon className="h-3.5 w-3.5" />
              Block library
            </a>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isBlocksRoute ? (
            <BlocksPage />
          ) : path ? (
            <DocPage path={path} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Select a doc from the tree
            </div>
          )}
        </main>
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
          onSaveTheme={IS_STATIC ? undefined : handleSaveTheme}
        />
      </div>
      <StyleRailOverlay settings={styleSettings} dark={dark} />
    </DocsClientProvider>
  );
}
