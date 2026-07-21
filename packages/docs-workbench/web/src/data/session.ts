/**
 * Per-tab docs session id.
 *
 * One id per browser tab, persisted in sessionStorage so it survives SPA
 * reloads but is never shared across tabs. This single id is used for:
 *
 *  - `session_id` on every mutation (`/api/ops`, annotations) — the server
 *    records it as the change event's `actor`, so the SSE stream can be
 *    filtered for self-echoes;
 *  - draft-lock ownership (`/api/draft-lock/*`). The server's mutation
 *    guard only admits writes whose `session_id` matches the lock holder,
 *    so locks and ops MUST share this id (see client.ts).
 */

const STORAGE_KEY = "docs-workbench-session-id";

let fallbackId: string | null = null;

export function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage unavailable (sandboxed iframe, some test setups) —
    // degrade to a stable per-load id.
    fallbackId ??= crypto.randomUUID();
    return fallbackId;
  }
}
