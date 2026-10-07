/**
 * Data layer for the standalone docs workbench, with two build-time variants:
 *
 *  - serve mode (IS_STATIC === false): the full read+write `/api/*` surface
 *    of @codecaine-ai/docs-server (ops with hash preconditions, annotations,
 *    draft locks, undo, SSE change events).
 *  - static/export mode (IS_STATIC === true): fetches the pregenerated JSON
 *    the exporter emitted under `data/` (tree.json, per-bundle snapshots,
 *    copied asset/canvas files, backlinks.json). No write routes exist in an
 *    export — every mutation helper throws, and the UI hides all
 *    edit/annotate affordances (see App/DocPage).
 *
 * ALL paths are RELATIVE (no leading slash) so the built site works from any
 * static host and from a subpath — combined with `base: "./"` in the vite
 * config and hash-based navigation.
 */

/**
 * Build-time static flag. `__DOCS_STATIC__` is a vite `define`; the `typeof`
 * guard keeps this module loadable under plain bun (tests, smoke scripts)
 * where no define ran — those environments are always "serve" mode.
 */
export const IS_STATIC: boolean =
  typeof __DOCS_STATIC__ !== "undefined" ? __DOCS_STATIC__ : false;

/** Error carrying the HTTP status + parsed body, so callers can branch on 409/423/404. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown> | null;

  constructor(message: string, status: number, payload: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseErrorPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    return body;
  } catch {
    return null;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    const detail =
      payload && typeof payload.detail === "string" ? payload.detail : `${response.status}`;
    throw new ApiError(detail, response.status, payload);
  }
  return (await response.json()) as T;
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function assertWritable(operation: string): void {
  if (IS_STATIC) {
    throw new ApiError(`${operation} is unavailable in a static docs export.`, 405);
  }
}

/** Encodes a docs-root-relative path for use as URL path segments. */
export function encodePathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Draft locks and mutations key on the bare docs-root-relative bundle path;
 * strip a `docs/`-prefixed document_path defensively so both shapes work.
 */
export function bundlePathOf(path: string): string {
  return path.replace(/^docs\//i, "");
}

