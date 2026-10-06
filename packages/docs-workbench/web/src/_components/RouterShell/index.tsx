import type { ReactNode } from "react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { AppShell, type AppShellProps } from "../AppShell";
import { Sidebar } from "../../shell/Sidebar";
import { SectionRail } from "./_components/SectionRail";

/** localStorage key for the sidebar state (layout.md rule 4; the registry's verify.sidebar key). */
export const SIDEBAR_STORAGE_KEY = "docs-workbench.sidebar";

export type RouterShellProps = {
  /** Sidebar title: the site title, the projects link or "Docs". */
  appName: ReactNode;
  /** Topbar h1 content. */
  title: ReactNode;
  actions?: ReactNode;
  tree: DocsTreeNode[] | null;
  treeError: string | null;
  /** The open doc's bundle path (the hash route). */
  selectedPath: string | null;
  /** A static export neither reads nor writes the sidebar state. */
  isStatic: boolean;
  /** False until the serve is known to be unlocked: a locked serve persists nothing. */
  persistSidebar: boolean;
  inspector?: AppShellProps["inspector"];
  children: ReactNode;
};

/**
 * The workbench's wiring of the design-system app shell (templates/react-app-shell).
 * The app routes by hash (`#/<bundle path>`), so nav rows are plain anchors and
 * need no link adapter. The sidebar body is the docs tree while expanded and
 * its top-level section rail while collapsed. The page is a tool view on the
 * `full` lane: the doc column keeps its own scroller (rule 12), and the block
 * lanes inside it are the docs lanes (60ch text, 88ch code, 1100px wide), which
 * read `--ds-layout-lane-*` through the Style rail's knobs.
 */
export function RouterShell({
  appName,
  title,
  actions,
  tree,
  treeError,
  selectedPath,
  isStatic,
  persistSidebar,
  inspector,
  children,
}: RouterShellProps) {
  return (
    <AppShell
      appName={appName}
      sections={[]}
      title={title}
      actions={actions}
      lane="full"
      storageKey={isStatic ? null : SIDEBAR_STORAGE_KEY}
      persistSidebar={!isStatic && persistSidebar}
      sidebarBody={({ collapsed }) =>
        treeError ? (
          collapsed ? null : <div className="p-3 text-ui-lg text-destructive">{treeError}</div>
        ) : !tree ? (
          collapsed ? null : <div className="p-3 text-ui-lg text-muted-foreground">Loading tree...</div>
        ) : collapsed ? (
          <SectionRail tree={tree} selectedPath={selectedPath} />
        ) : (
          <Sidebar tree={tree} selectedPath={selectedPath} />
        )
      }
      inspector={inspector}
    >
      {children}
    </AppShell>
  );
}
