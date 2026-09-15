/** Server-side connection to the shared Docs authority. Never sent to the SPA. */
export interface SharedDocsApiOptions {
  url: string;
  projectId: string;
  token: string;
  /** Explicit loopback dev UI origins when Vite proxies through another port. */
  allowedBrowserOrigins?: string[];
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function sharedDocsApiFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): SharedDocsApiOptions | undefined {
  const url = env.DOCS_SHARED_API_URL;
  const projectId = env.DOCS_SHARED_PROJECT_ID;
  const token = env.DOCS_SHARED_API_TOKEN;
  if (!url && !projectId && !token) return undefined;
  if (!url || !projectId || !token) {
    throw new Error("Shared Docs API requires DOCS_SHARED_API_URL, DOCS_SHARED_PROJECT_ID, and DOCS_SHARED_API_TOKEN together.");
  }
  return { url, projectId, token };
}

export function createSharedDocsApiProxy(options: SharedDocsApiOptions) {
  const base = new URL(options.url);
  if (
    base.protocol !== "http:" || !LOOPBACK_HOSTS.has(base.hostname) ||
    base.username || base.password || base.search || base.hash || base.pathname !== "/"
  ) {
    throw new Error("Shared Docs API URL must be a loopback HTTP origin.");
  }
  if (!options.projectId.trim() || !options.token.trim()) {
    throw new Error("Shared Docs API requires a project ID and token.");
  }

  const allowedOrigins = new Set(options.allowedBrowserOrigins ?? []);
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) || url.origin !== origin) {
      throw new Error("Shared Docs browser origins must be loopback HTTP origins.");
    }
  }

  return async (request: Request): Promise<Response> => {
    const incoming = new URL(request.url);
    // This proxy adds credentials. Refuse foreign browser origins so an
    // unrelated website cannot use it to edit the local documentation.
    const origin = request.headers.get("origin");
    if (!LOOPBACK_HOSTS.has(incoming.hostname) || (origin && origin !== incoming.origin && !allowedOrigins.has(origin))) {
      return Response.json({ detail: "Shared Docs API accepts same-origin local requests only." }, { status: 403 });
    }
    const target = new URL(`/projects/${encodeURIComponent(options.projectId)}${incoming.pathname}${incoming.search}`, base);
    const headers = new Headers(request.headers);
    for (const name of ["host", "origin", "referer", "content-length", "connection", "cookie"]) {
      headers.delete(name);
    }
    headers.set("authorization", `Bearer ${options.token}`);
    try {
      // Returning the upstream response preserves binary assets and SSE.
      return await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        signal: request.signal,
        redirect: "error",
      });
    } catch {
      return Response.json({ detail: "Shared Docs service is unavailable. Relaunch through the Codecaine UI command." }, { status: 502 });
    }
  };
}
