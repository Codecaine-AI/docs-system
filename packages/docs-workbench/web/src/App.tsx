import { useEffect, useMemo, useState } from "react";
import { BlocksIcon } from "lucide-react";
import { DocsClientProvider, type DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

import { IS_STATIC, getTree } from "./api";
import { createStandaloneDocsClient } from "./client";
import { StandaloneCanvasEmbed } from "./CanvasEmbed";
import { BlocksPage } from "./BlocksPage";
import { DocPage } from "./DocPage";
import { Sidebar } from "./Sidebar";

/**
 * Standalone docs workbench shell: left sidebar (docs tree + block-library
 * nav + theme toggle) and the main surface — either the block library
 * (#/blocks) or a doc workbench page (#/<bundle path>, see DocPage for the
 * edit/annotate modes). Hash-based navigation so both `docs-cli serve`
 * and the static export deep-link from any host/subpath; the light/dark
 * toggle drives the baked Spectre theme variables (.dark class +
 * data-theme attribute).
 */

const THEME_STORAGE_KEY = "docs-viewer-theme";
/** `#/blocks` — the block library route (unless the tree really has a bundle at that path). */
const BLOCKS_ROUTE = "blocks";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "spectre-dark" : "spectre-light");
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

  useEffect(() => {
    applyTheme(dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

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
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
              Docs
              {IS_STATIC && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                  static export
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDark((prev) => !prev)}
              className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              aria-label="Toggle dark mode"
            >
              {dark ? "Light" : "Dark"}
            </button>
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
      </div>
    </DocsClientProvider>
  );
}
