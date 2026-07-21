/**
 * Pure state model for the doc-reference side peek (Notion-style right-docked
 * preview). DOM-free on purpose: the reducer below is the single source of
 * truth for what the panel shows, and `use-doc-peek.ts` is the only place
 * that touches events/effects. Unit tests exercise the reducer directly.
 */

import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";

/**
 * The reference-chip navigation event. Dispatched on `document` by
 * `ReferenceChipView` (editor/menus/reference-node.tsx); consumed by
 * `useDocPeek` and by any host that wants to observe navigation directly.
 */
export const DOC_REFERENCE_NAVIGATE_EVENT = "spectre:doc-reference-navigate";

/**
 * "peek": open the target read-only in the side panel (plain click on a doc
 * ref). "navigate": the host should perform full navigation (Cmd/Ctrl-click
 * or source refs).
 */
export type DocReferenceNavigateIntent = "peek" | "navigate";

/** `CustomEvent.detail` shape for `DOC_REFERENCE_NAVIGATE_EVENT`. */
export type DocReferenceNavigateDetail = {
  ref: SpectreRef;
  intent: DocReferenceNavigateIntent;
};

/** Loading progression for the peeked doc's content. */
export type DocPeekLoadState =
  | { status: "loading" }
  | { status: "loaded"; document: DocDocument; documentPath?: string }
  | { status: "error"; message: string };

/**
 * Panel state: closed, or open on a ref with its load progression. Opening
 * while already open REPLACES the peeked ref (Notion behavior — one panel,
 * latest target wins). `requestId` increments on every open so the loading
 * effect re-fires even when the same chip is clicked twice (the ref object
 * identity can be unchanged between clicks).
 */
export type DocPeekState =
  | { open: false }
  | { open: true; ref: SpectreRef; requestId: number; load: DocPeekLoadState };

export type DocPeekAction =
  | { type: "open"; ref: SpectreRef }
  | { type: "close" }
  | { type: "load-success"; ref: SpectreRef; document: DocDocument; documentPath?: string }
  | { type: "load-error"; ref: SpectreRef; message: string };

export const CLOSED_PEEK_STATE: DocPeekState = { open: false };

/** Two refs peek the same target when kind and path agree (label/line/etc. are display detail). */
export function isSamePeekTarget(a: SpectreRef, b: SpectreRef): boolean {
  return a.kind === b.kind && a.path === b.path;
}

/**
 * Load results carry the ref they were fetched FOR, and are dropped unless
 * the panel is still open on that same target — a slow fetch for a replaced
 * or closed peek can never clobber the current content.
 */
export function docPeekReducer(state: DocPeekState, action: DocPeekAction): DocPeekState {
  switch (action.type) {
    case "open":
      return {
        open: true,
        ref: action.ref,
        requestId: state.open ? state.requestId + 1 : 1,
        load: { status: "loading" },
      };
    case "close":
      return CLOSED_PEEK_STATE;
    case "load-success":
      if (!state.open || !isSamePeekTarget(state.ref, action.ref)) return state;
      return {
        ...state,
        load: { status: "loaded", document: action.document, documentPath: action.documentPath },
      };
    case "load-error":
      if (!state.open || !isSamePeekTarget(state.ref, action.ref)) return state;
      return { ...state, load: { status: "error", message: action.message } };
  }
}
