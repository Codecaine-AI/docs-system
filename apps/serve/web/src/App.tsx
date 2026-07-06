import { useEffect, useMemo, useState } from "react";
import {
  DocsClientProvider,
  type DocsClient,
  type DocsTreeNode,
} from "@codecaine-ai/docs-viewer/client";

import { getTree } from "./api";
import { StandaloneCanvasEmbed } from "./CanvasEmbed";
import { DocPage } from "./DocPage";
import { Sidebar } from "./Sidebar";

/**
 * Standalone docs viewer shell: left sidebar tree + document view, hash-based
 * navigation (#/<bundle path>) so both `docs-cli serve` and the static export
 * deep-link from any host/subpath, and a light/dark toggle driving the baked
 * Spectre theme variables (.dark class + data-theme attribute).
 */

const THEME_STORAGE_KEY = "docs-viewer-theme";

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

  // Read-only DocsClient: the tree feeds the viewer's reference picker; all
  // draft-lock/mutation methods are intentionally omitted.
  const client = useMemo<DocsClient>(
    () => ({ getDocsTree: async () => ({ tree: tree ?? (await getTree()).tree }) }),
    [tree],
  );

  return (
    <DocsClientProvider client={client} canvasEmbed={StandaloneCanvasEmbed}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="truncate font-display text-sm font-medium uppercase tracking-wider">
              Docs
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
              <Sidebar tree={tree} selectedPath={path} />
            ) : (
              <div className="p-3 text-sm text-muted-foreground">Loading tree...</div>
            )}
          </div>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {path ? (
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
