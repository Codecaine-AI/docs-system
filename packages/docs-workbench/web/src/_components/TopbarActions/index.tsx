import type { Ref } from "react";
import { GitBranchIcon, SlidersHorizontal } from "lucide-react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import type { SiteConfig } from "../../data/api";
import { repoLinkLabel } from "../../_lib/utils";

export type TopbarActionsProps = {
  setTopbarSlot: Ref<HTMLSpanElement>;
  isStatic: boolean;
  siteConfig: SiteConfig;
  styleAvailable: boolean;
  styleButtonRef: Ref<HTMLButtonElement>;
  styleOpen: boolean;
  sidePeekOpen: boolean;
  closeStyle: () => void;
  setStyleOpenByUser: (open: boolean) => void;
  tree: DocsTreeNode[] | null;
  setExportOpen: (open: boolean) => void;
};

export function TopbarActions({
  setTopbarSlot, isStatic, siteConfig, styleAvailable, styleButtonRef,
  styleOpen, sidePeekOpen, closeStyle, setStyleOpenByUser, tree, setExportOpen,
}: TopbarActionsProps) {
  return (
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
  );
}
