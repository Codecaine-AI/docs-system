"use client";

/**
 * Host-integration seam for @codecaine-ai/docs-viewer.
 *
 * The docs components own zero HTTP logic: everything they need from a
 * backend is expressed as the `DocsClient` interface below (method names and
 * shapes deliberately mirror Spectre's `lib/projects-api` functions the
 * components called before extraction), and canvas embedding is expressed as
 * the `CanvasEmbedComponent` slot (the prop surface of Spectre's
 * `CanvasSidecarEmbed`). Hosts wire both through `DocsClientProvider`.
 *
 * Mutation-capable methods are OPTIONAL on `DocsClient`: a read-only client
 * simply omits them and the components degrade gracefully (e.g. DocEditor
 * skips draft-lock acquire/heartbeat/release entirely when the client can't
 * provide them — the backend hash precondition remains the real safety net).
 */

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Shared backend shapes (mirrored from Spectre lib/projects-api)
// ---------------------------------------------------------------------------

/** One node of the project docs tree (the `@`-mention picker's data source). */
export type DocsTreeNode = {
  name: string;
  path: string;
  /**
   * "bundle": a doc.json bundle folder — a selectable DOC whose `path` is a
   * docs-root-relative bundle path. May carry `children` when the bundle
   * folder nests other docs.
   */
  kind: "dir" | "file" | "bundle";
  children?: DocsTreeNode[];
};

/**
 * Draft-lock kind: which document type a lock is guarding (D22 — dumb TTL
 * locks, not CRDT merge, for concurrent doc/canvas editing).
 */
export type DraftLockKind = "doc" | "canvas";

export type DraftLockInfo = {
  sessionId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AcquireDraftLockResult =
  | { ok: true; lock: DraftLockInfo }
  | { ok: false; reason: "held-by-other"; heldBy: DraftLockInfo };

// ---------------------------------------------------------------------------
// DocsClient
// ---------------------------------------------------------------------------

export interface DocsClient {
  /**
   * Loads the project docs tree (feeds the editor's `@`-mention / reference
   * picker). Read-only — every client should provide it; the picker shows an
   * empty list when it fails or when no client is provided at all.
   */
  getDocsTree(projectId: string): Promise<{ tree: DocsTreeNode[] }>;

  /**
   * Acquires a draft lock for a doc/canvas so only one session edits at a
   * time (D22). A conflict is surfaced as `{ ok: false, heldBy }`, never
   * thrown. OPTIONAL — omit on read-only clients; DocEditor then skips lock
   * management entirely.
   */
  acquireDraftLock?(
    projectId: string,
    path: string,
    kind: DraftLockKind,
    sessionId: string,
  ): Promise<AcquireDraftLockResult>;

  /** Renews a held draft lock before it expires. OPTIONAL (see acquire). */
  heartbeatDraftLock?(
    projectId: string,
    path: string,
    kind: DraftLockKind,
    sessionId: string,
  ): Promise<AcquireDraftLockResult>;

  /** Releases a held draft lock; idempotent. OPTIONAL (see acquire). */
  releaseDraftLock?(
    projectId: string,
    path: string,
    kind: DraftLockKind,
    sessionId: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Canvas embed slot
// ---------------------------------------------------------------------------

/**
 * Prop surface of the injected canvas embed — exactly the props Spectre's
 * `CanvasSidecarEmbed` exposes, so the host can pass that component (or any
 * stand-in) straight through.
 */
export type CanvasEmbedProps = {
  projectId?: string | null;
  documentPath?: string | null;
  canvasId?: string;
  /** Canvas sidecar src (already bundle-canonicalized by DocBlockRenderer). */
  src?: string;
  id: string;
  title?: string;
  /** Named container to crop the embedded viewer to (D4 view-cropping). */
  view?: string;
  /** Canvas-object click, for Plannotator canvas-object targeting. */
  onObjectSelect?: (objectId: string) => void;
};

export type CanvasEmbedComponent = ComponentType<CanvasEmbedProps>;

/** Neutral fallback rendered where a canvas would embed when no `CanvasEmbedComponent` is provided. */
export function CanvasEmbedUnavailable({ title, src }: { title?: string; src?: string }) {
  return (
    <div
      data-canvas-embed-unavailable="true"
      className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground"
    >
      <div className="font-medium">Canvas embed unavailable</div>
      <div className="mt-0.5 text-xs">
        {title ?? "Interactive canvas"}
        {src ? ` (${src})` : ""} — no canvas renderer is wired into this viewer.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider + hooks
// ---------------------------------------------------------------------------

type DocsIntegrationContextValue = {
  client: DocsClient | null;
  canvasEmbed: CanvasEmbedComponent | null;
};

const DocsIntegrationContext = createContext<DocsIntegrationContextValue>({
  client: null,
  canvasEmbed: null,
});

export function DocsClientProvider({
  client,
  canvasEmbed,
  children,
}: {
  client?: DocsClient | null;
  canvasEmbed?: CanvasEmbedComponent | null;
  children: ReactNode;
}) {
  return (
    <DocsIntegrationContext.Provider
      value={{ client: client ?? null, canvasEmbed: canvasEmbed ?? null }}
    >
      {children}
    </DocsIntegrationContext.Provider>
  );
}

/** The host-provided DocsClient, or null when rendering fully standalone. */
export function useDocsClient(): DocsClient | null {
  return useContext(DocsIntegrationContext).client;
}

/** The host-provided canvas embed component, or null (fallback card renders). */
export function useCanvasEmbed(): CanvasEmbedComponent | null {
  return useContext(DocsIntegrationContext).canvasEmbed;
}
