/**
 * In-process docs/canvas change-event pub/sub (CP9, TG9.2/TG9.3). Deliberately
 * as dumb as the draft-lock store (§8.4): no external broker, no persistence,
 * no cross-process fanout — a plain `Set` of per-connection listener
 * callbacks that `GET /projects/:id/docs/events` (an SSE route in
 * `index.ts`) subscribes to per request and unsubscribes on stream close.
 * Matches the frontend's already-built `subscribeToProjectDocsEvents` client
 * (`projects-api.ts`), which expects one `EventSource` per project emitting
 * `DocsChangeEvent`-shaped JSON messages.
 *
 * Scoped per-process, per-`data-backend`-instance — acceptable for the same
 * reason draft locks are: this is a single-instance dev/local tool today,
 * not a horizontally-scaled multi-instance deployment.
 */

import type { AnnotationIntent } from "@codecaine-ai/docs-model/annotations-schema";

/** Which annotation a change touched, so a listener can act without a diff. */
export type DocsAnnotationChange = {
  id: string;
  intent: AnnotationIntent;
  change: "created" | "replied" | "resolved" | "thread";
};

export type DocsChangeEvent = {
  path: string;
  changedIds: string[];
  patchId: string;
  actor: string;
  /** Present only when the change created, replied to, resolved, or bound a thread on one annotation. */
  annotation?: DocsAnnotationChange;
};

type Listener = (event: DocsChangeEvent) => void;

const listenersByProject = new Map<string, Set<Listener>>();

/** Publishes a change event to every current subscriber of `projectId`. */
export function publishDocsChangeEvent(projectId: string, event: DocsChangeEvent): void {
  const listeners = listenersByProject.get(projectId);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    listener(event);
  }
}

/** Subscribes to `projectId`'s change events; returns an unsubscribe function. */
export function subscribeToDocsChangeEvents(projectId: string, listener: Listener): () => void {
  let listeners = listenersByProject.get(projectId);
  if (!listeners) {
    listeners = new Set();
    listenersByProject.set(projectId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      listenersByProject.delete(projectId);
    }
  };
}

/** Test-only: how many live subscribers a project currently has. */
export function subscriberCountForTest(projectId: string): number {
  return listenersByProject.get(projectId)?.size ?? 0;
}
