// The upstream guard of the docs supervisor: with CODECAINE_DOCS_UPSTREAM_KEY_FILE set, each request must carry
// X-KB-Upstream-Key with the key from that file. A gateway in front of the supervisor adds the header, so other local
// users cannot call the supervisor port. With the setting unset, the guard is off.
import { readFileSync } from 'node:fs';
import { timingSafeEqual, createHash } from 'node:crypto';

export const UPSTREAM_KEY_HEADER = 'x-kb-upstream-key';

/** The key, or null when the setting is unset. A missing or empty key file throws: the supervisor exits 78. */
export function loadUpstreamKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = env.CODECAINE_DOCS_UPSTREAM_KEY_FILE;
  if (!file) return null;
  let key: string;
  try { key = readFileSync(file, 'utf8').trim(); } catch { throw new Error(`CODECAINE_DOCS_UPSTREAM_KEY_FILE names a file that cannot be read: ${file}`); }
  if (!key) throw new Error(`CODECAINE_DOCS_UPSTREAM_KEY_FILE names an empty file: ${file}`);
  return key;
}

/** Hashing both sides first gives equal lengths, so the compare takes the same time for any header value. */
const digest = (value: string) => createHash('sha256').update(value).digest();

/** The request carries the key, or the guard is off. */
export function hasUpstreamKey(request: Request, key: string | null): boolean {
  if (key === null) return true;
  const sent = request.headers.get(UPSTREAM_KEY_HEADER);
  return sent !== null && timingSafeEqual(digest(sent), digest(key));
}

/** The 401 for a request without the right key, or null when it may pass. The log line names the path, never the header. */
export function upstreamRefusal(request: Request, key: string | null, log: (line: string) => void = line => console.error(line)): Response | null {
  if (hasUpstreamKey(request, key)) return null;
  const { pathname } = new URL(request.url);
  log(`[docs] Refused ${request.method} ${pathname}: no valid upstream key`);
  return new Response('Unauthorized', { status: 401 });
}

/** CODECAINE_DOCS_VIEWER=0 turns the Vite viewer off. Any other value, or none, keeps it on. */
export const viewerEnabled = (env: NodeJS.ProcessEnv = process.env) => env.CODECAINE_DOCS_VIEWER !== '0';
