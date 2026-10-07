import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { getTree, getSiteConfig, type SiteConfig } from "../data/api";
import { docTitleFromPath } from "../shared/doc-title";
import { readHashPath, normalizeLegacyOverviewHash, firstBundlePath } from "./hash-route";

export type DocsShellEffectsOptions = {
  themeReady: boolean; isStatic: boolean; path: string | null;
  setPath: Dispatch<SetStateAction<string | null>>;
  setTree: Dispatch<SetStateAction<DocsTreeNode[] | null>>;
  setTreeError: Dispatch<SetStateAction<string | null>>;
  setSiteConfig: Dispatch<SetStateAction<SiteConfig>>;
};

export function useDocsShellEffects({ themeReady, isStatic, path, setPath, setTree, setTreeError, setSiteConfig }: DocsShellEffectsOptions) {
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

  return { booting };
}
