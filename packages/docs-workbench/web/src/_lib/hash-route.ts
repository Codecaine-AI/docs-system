import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

/**
 * Retired section intros lived at `<section>/00-overview`. Collapse only
 * trailing overview segments, keeping a parentless `00-overview` bundle valid.
 */
export function collapseOverviewPath(path: string): string {
  const withoutTrailingSlash = path.replace(/\/+$/, "");
  let collapsed = withoutTrailingSlash;

  while (collapsed.includes("/") && collapsed.endsWith("/00-overview")) {
    collapsed = collapsed.slice(0, -"/00-overview".length);
  }

  return collapsed === withoutTrailingSlash ? path : collapsed;
}

export function readHashPath(): string | null {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return null;
  try {
    return collapseOverviewPath(decodeURIComponent(hash));
  } catch {
    return collapseOverviewPath(hash);
  }
}

export function normalizeLegacyOverviewHash(): void {
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

export function firstBundlePath(nodes: DocsTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "bundle") return node.path;
    if (node.children) {
      const nested = firstBundlePath(node.children);
      if (nested) return nested;
    }
  }
  return null;
}

