"use client";

/**
 * Effectful half of the side peek: subscribes to the reference-chip
 * navigation event, owns Escape-to-close, and loads peeked content through
 * the host's `DocsClient.getDocBundle`. All state transitions go through the
 * pure reducer in peek-state.ts.
 *
 * Degradation contract: when no DocsClient is provided, or the client omits
 * `getDocBundle`, a "peek" intent downgrades to `onNavigate` — reference
 * chips keep working as plain navigation in hosts that never opted into the
 * panel's data seam.
 */

import { useEffect, useReducer, useRef } from "react";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { useDocsClient } from "../client";
import {
  CLOSED_PEEK_STATE,
  DOC_REFERENCE_NAVIGATE_EVENT,
  docPeekReducer,
  type DocPeekState,
  type DocReferenceNavigateDetail,
} from "./peek-state";

export type UseDocPeekOptions = {
  projectId: string;
  /** Full-navigation requests (navigate intent, downgraded peeks, "Open in full"). */
  onNavigate: (ref: SpectreRef) => void;
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

export function useDocPeek({ projectId, onNavigate }: UseDocPeekOptions): UseDocPeekResult {
  const [state, dispatch] = useReducer(docPeekReducer, CLOSED_PEEK_STATE);
  const client = useDocsClient();

  // Latest-callback refs so the document listener below never detaches and
  // re-attaches on host re-renders (onNavigate is typically an inline prop).
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<DocReferenceNavigateDetail>).detail;
      if (!detail?.ref) return;
      if (detail.intent === "peek" && clientRef.current?.getDocBundle) {
        dispatch({ type: "open", ref: detail.ref });
      } else {
        onNavigateRef.current(detail.ref);
      }
    };
    document.addEventListener(DOC_REFERENCE_NAVIGATE_EVENT, handleNavigate);
    return () => document.removeEventListener(DOC_REFERENCE_NAVIGATE_EVENT, handleNavigate);
  }, []);

  // Escape closes — listener mounted only while open (mirrors the fullscreen
  // canvas viewer's close-on-Escape wiring in the workbench host).
  useEffect(() => {
    if (!state.open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "close" });
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [state.open]);

  // Content loading, keyed on requestId so a repeat click on the same chip
  // (same ref identity) still refetches. Stale responses are dropped both
  // here (cancelled flag) and in the reducer (ref match).
  const pendingRef = state.open && state.load.status === "loading" ? state.ref : null;
  const pendingRequestId = state.open ? state.requestId : 0;
  useEffect(() => {
    if (!pendingRef) return;
    const getDocBundle = clientRef.current?.getDocBundle?.bind(clientRef.current);
    if (!getDocBundle) {
      dispatch({ type: "load-error", ref: pendingRef, message: "Doc preview is unavailable." });
      return;
    }
    let cancelled = false;
    getDocBundle(projectId, collapseLegacyOverviewPath(pendingRef.path))
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          dispatch({ type: "load-error", ref: pendingRef, message: "Doc not found." });
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
      .catch((error: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "load-error",
          ref: pendingRef,
          message: error instanceof Error ? error.message : "Failed to load doc.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pendingRef, pendingRequestId, projectId]);

  const closeRef = useRef(() => dispatch({ type: "close" }));
  return { state, close: closeRef.current };
}
