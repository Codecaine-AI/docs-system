"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DocBlockRenderContext } from "../../render/block-registry";

/**
 * TipTap NodeViews are mounted deep inside ProseMirror's DOM tree — they
 * can't receive arbitrary render props the way a normal React child would,
 * only what the node's own attrs carry. `DocEditor` needs to thread the same
 * `renderCanvas`/`resolveAssetSrc` host wiring that `DocBlockRenderer`
 * accepts as props (so canvas embeds and asset URLs behave identically
 * in-editor and in the read surface) — a React context is the standard way
 * to reach that deep without prop-drilling through TipTap's node view API.
 */
export type DocEditorNodeViewContextValue = {
  renderCanvas?: DocBlockRenderContext["renderCanvas"];
  renderSequence?: DocBlockRenderContext["renderSequence"];
  resolveAssetSrc?: DocBlockRenderContext["resolveAssetSrc"];
};

const DocEditorNodeViewContext = createContext<DocEditorNodeViewContextValue>({});

export function DocEditorNodeViewProvider({
  value,
  children,
}: {
  value: DocEditorNodeViewContextValue;
  children: ReactNode;
}) {
  return (
    <DocEditorNodeViewContext.Provider value={value}>
      {children}
    </DocEditorNodeViewContext.Provider>
  );
}

export function useDocEditorNodeViewContext(): DocEditorNodeViewContextValue {
  return useContext(DocEditorNodeViewContext);
}
