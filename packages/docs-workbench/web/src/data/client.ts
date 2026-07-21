import type { DocsClient } from "@codecaine-ai/docs-viewer/client";

import {
  IS_STATIC,
  acquireDraftLock,
  getBundle,
  getTree,
  heartbeatDraftLock,
  releaseDraftLock,
} from "./api";
import { getSessionId } from "./session";

/**
 * The standalone host's DocsClient — the docs-viewer integration seam
 * (client.tsx) bound to the serve app's `/api/*` surface. Counterpart of
 * Spectre's `docs-host.tsx` provider wiring.
 *
 * `projectId` is part of the seam's signature but meaningless standalone
 * (one docs root per server); it is accepted and ignored.
 *
 * SESSION IDS: DocEditor mints a fresh lock session id per mount, but the
 * server's mutation guard only admits writes whose `session_id` matches the
 * current lock holder — and our `/api/ops` calls always send the per-tab
 * session id (see api.ts/session.ts). So the lock methods here substitute
 * the tab session id for the editor's per-mount id: locks and ops then
 * agree, same-tab saves pass the guard, and other tabs/sessions still
 * conflict correctly (each tab has its own id).
 *
 * In static/export mode only the read methods (`getDocsTree`,
 * `getDocBundle`) exist — the mutation-capable methods are omitted entirely,
 * which DocEditor treats as "no lock management" (moot anyway: static builds
 * never render the editor).
 */
export function createStandaloneDocsClient(): DocsClient {
  const client: DocsClient = {
    getDocsTree: async () => getTree(),
    // Doc-peek read seam: the seam's contract is "null when not found", but
    // getBundle throws the same ApiError shape for 404s and transport/server
    // failures — all load failures conflate to null here.
    getDocBundle: async (_projectId, path) => {
      try {
        const payload = await getBundle(path);
        return { doc: payload.doc, documentPath: payload.document_path };
      } catch {
        return null;
      }
    },
  };
  if (IS_STATIC) return client;

  client.acquireDraftLock = (_projectId, path, kind, _sessionId) =>
    acquireDraftLock(path, kind, getSessionId());
  client.heartbeatDraftLock = (_projectId, path, kind, _sessionId) =>
    heartbeatDraftLock(path, kind, getSessionId());
  client.releaseDraftLock = (_projectId, path, kind, _sessionId) =>
    releaseDraftLock(path, kind, getSessionId());
  return client;
}
