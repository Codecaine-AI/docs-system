"use client";

/**
 * Effectful half of the side peek: subscribes to the reference-chip
 * navigation event and the close event, owns Escape-to-close unless the host
 * does, and loads peeked content through the host's `loadPeek` or, without
 * it, `DocsClient.getDocBundle`. All state transitions go through the pure
 * reducer in peek-state.ts.
 *
 * Degradation contract: with no loader (no `loadPeek`, and no DocsClient or
 * one without `getDocBundle`), a "peek" intent downgrades to `onNavigate`, so
 * reference chips keep working as plain navigation. A load that fails or
 * returns null also downgrades: the panel closes and calls `onNavigate`, so a
 * reader never sees a not-found preview for a link that full navigation can
 * still resolve.
 */

import { useEffect, useReducer, useRef } from "react";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { useDocsClient } from "../client";
import {
  CLOSED_PEEK_STATE,
  DOC_PEEK_CLOSE_EVENT,
  DOC_REFERENCE_NAVIGATE_EVENT,
  docPeekReducer,
  type DocBundle,
  type DocPeekState,
  type DocReferenceNavigateDetail,
} from "./peek-state";

export type UseDocPeekOptions = {
  projectId: string;
  /** Full-navigation requests (navigate intent, downgraded peeks, "Open in full"). */
  onNavigate: (ref: SpectreRef) => void;
  /**
   * Host loader for a peeked ref, used instead of `DocsClient.getDocBundle`
   * when given. It receives the ref as the chip sent it, so a host can
   * resolve refs that point outside `projectId`. Null or a rejection
   * downgrades to `onNavigate`.
   */
  loadPeek?: (ref: SpectreRef) => Promise<DocBundle | null>;
  /**
   * The host handles Escape itself (for example, one Escape closes only the
   * top layer). The panel then adds no Escape listener; the host closes it
   * with `DOC_PEEK_CLOSE_EVENT`.
   */
  hostOwnsEscape?: boolean;
};

export type UseDocPeekResult = {
  state: DocPeekState;
  close: () => void;
};

/**
 * Mirrors the `00-overview` compatibility in docs-index's
 * `ref-match.ts` (`normalizeDocRefPath`). This stays local because
 * docs-viewer cannot depend on docs-index.
 */
export function collapseLegacyOverviewPath(path: string): string {
  let candidate = path.replace(/\/+$/, "");
  let collapsed = false;

  // A bare `00-overview` has no parent section, so it remains addressable.
  while (candidate !== "00-overview" && candidate.endsWith("/00-overview")) {
    candidate = candidate.slice(0, -"/00-overview".length);
    collapsed = true;
  }

  return collapsed ? candidate : path;
}

export function useDocPeek({ projectId, onNavigate, loadPeek, hostOwnsEscape = false }: UseDocPeekOptions): UseDocPeekResult {
  const [state, dispatch] = useReducer(docPeekReducer, CLOSED_PEEK_STATE);
  const client = useDocsClient();

  // Latest-callback refs so the document listener below never detaches and
  // re-attaches on host re-renders (onNavigate is typically an inline prop).
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const clientRef = useRef(client);
  clientRef.current = client;
  const loadPeekRef = useRef(loadPeek);
  loadPeekRef.current = loadPeek;

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<DocReferenceNavigateDetail>).detail;
      if (!detail?.ref) return;
      if (detail.intent === "peek" && (loadPeekRef.current || clientRef.current?.getDocBundle)) {
        dispatch({ type: "open", ref: detail.ref });
      } else {
        onNavigateRef.current(detail.ref);
      }
    };
    const handleClose = () => dispatch({ type: "close" });
    document.addEventListener(DOC_REFERENCE_NAVIGATE_EVENT, handleNavigate);
    document.addEventListener(DOC_PEEK_CLOSE_EVENT, handleClose);
    return () => {
      document.removeEventListener(DOC_REFERENCE_NAVIGATE_EVENT, handleNavigate);
      document.removeEventListener(DOC_PEEK_CLOSE_EVENT, handleClose);
    };
  }, []);

  // Escape closes — listener mounted only while open (mirrors the fullscreen
  // canvas viewer's close-on-Escape wiring in the workbench host). A host
  // that owns Escape closes the panel with DOC_PEEK_CLOSE_EVENT instead.
  useEffect(() => {
    if (!state.open || hostOwnsEscape) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "close" });
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [state.open, hostOwnsEscape]);

  // Content loading, keyed on requestId so a repeat click on the same chip
  // (same ref identity) still refetches. Stale responses are dropped both
  // here (cancelled flag) and in the reducer (ref match).
  const pendingRef = state.open && state.load.status === "loading" ? state.ref : null;
  const pendingRequestId = state.open ? state.requestId : 0;
  useEffect(() => {
    if (!pendingRef) return;
    const getDocBundle = clientRef.current?.getDocBundle?.bind(clientRef.current);
    const host = loadPeekRef.current;
    const load: ((ref: SpectreRef) => Promise<DocBundle | null>) | undefined = host
      ?? (getDocBundle && ((ref) => getDocBundle(projectId, collapseLegacyOverviewPath(ref.path))));
    // A failed or missing load hands the ref to full navigation, which can
    // still resolve it (or show the host's own not-found page).
    const downgrade = () => {
      dispatch({ type: "close" });
      onNavigateRef.current(pendingRef);
    };
    if (!load) {
      downgrade();
      return;
    }
    let request: Promise<DocBundle | null>;
    try {
      request = load(pendingRef);
    } catch {
      downgrade();
      return;
    }
    let cancelled = false;
    request
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          downgrade();
          return;
        }
        const validation = validateDocDocument(result.doc);
        if (!validation.ok) {
          dispatch({ type: "load-error", ref: pendingRef, message: "Doc failed validation." });
          return;
        }
        dispatch({
          type: "load-success",
          ref: pendingRef,
          document: validation.document,
          documentPath: result.documentPath,
        });
      })
      .catch(() => {
        if (!cancelled) downgrade();
      });
    return () => {
      cancelled = true;
    };
  }, [pendingRef, pendingRequestId, projectId]);

  const closeRef = useRef(() => dispatch({ type: "close" }));
  return { state, close: closeRef.current };
}
