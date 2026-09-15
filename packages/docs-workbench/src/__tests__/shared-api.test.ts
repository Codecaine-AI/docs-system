import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, afterEach, describe, expect, test } from "bun:test";
import { createDocsServeApp } from "../server";
import { createSharedDocsApiProxy, sharedDocsApiFromEnvironment } from "../shared-api";

// These are server transport tests. Happy DOM replaces fetch with browser
// CORS behavior; restore Bun networking for the duration of this file.
beforeAll(() => GlobalRegistrator.unregister());
afterAll(() => GlobalRegistrator.register());

const servers: Array<ReturnType<typeof Bun.serve>> = [];
afterEach(() => { for (const server of servers.splice(0)) server.stop(true); });
function authority(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  servers.push(server);
  return { url: server.url.origin, projectId: "project one", token: "server-only-secret" };
}

describe("shared Docs authority workbench connection", () => {
  test("proxies writes with explicit project and server credentials, preserving conflict details", async () => {
    let received: { url: string; auth: string | null; origin: string | null; body: unknown } | undefined;
    const sharedApi = authority(async (request) => {
      received = { url: request.url, auth: request.headers.get("authorization"), origin: request.headers.get("origin"), body: await request.json() };
      return Response.json({ detail: "stale", current_hash: "current" }, { status: 409 });
    });
    // No local corpus or index is needed in proxy mode.
    const app = createDocsServeApp({ docsRoot: "/does-not-exist/shared-proxy", sharedApi, watchFs: true });
    const response = await app.handle(new Request("http://localhost/api/ops?path=guide%2Fpart", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", authorization: "Bearer client-must-not-win" },
      body: JSON.stringify({ path: "guide/part", ops: [] }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "stale", current_hash: "current" });
    expect(received).toEqual({
      url: `${sharedApi.url}/projects/project%20one/api/ops?path=guide%2Fpart`,
      auth: "Bearer server-only-secret", origin: null, body: { path: "guide/part", ops: [] },
    });
  });

  test("local shell configuration stays local and never exposes credentials", async () => {
    let calls = 0;
    const sharedApi = authority(() => { calls++; return Response.json({ wrong: true }); });
    const app = createDocsServeApp({ docsRoot: "/unused", sharedApi, themeLocked: true, kernelUrl: "http://127.0.0.1:4840", corpus: "canvas" });
    const serve = await app.handle(new Request("http://localhost/api/serve-config"));
    expect(await serve.json()).toEqual({ themeLocked: true });
    const lab = await app.handle(new Request("http://localhost/api/lab-config"));
    expect(await lab.json()).toEqual({ kernelUrl: "http://127.0.0.1:4840", corpus: "canvas" });
    const themeWrite = await app.handle(new Request("http://localhost/api/themes", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(themeWrite.status).toBe(403);
    expect(calls).toBe(0);
  });

  test("preserves binary assets and streams the first SSE event without waiting for completion", async () => {
    const sharedApi = authority((request) => {
      if (request.url.endsWith("/api/asset")) return new Response(new Uint8Array([0, 255, 128]), { headers: { "content-type": "image/png" } });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: changed\n\n")); } }), { headers: { "content-type": "text/event-stream" } });
    });
    const app = createDocsServeApp({ docsRoot: "/unused", sharedApi });
    const asset = await app.handle(new Request("http://localhost/api/asset"));
    expect(asset.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await asset.arrayBuffer())]).toEqual([0, 255, 128]);
    const events = await app.handle(new Request("http://localhost/api/events"));
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    const reader = events.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("data: changed\n\n");
    await reader.cancel();
  });

  test("rejects foreign origins and rebinding hosts before adding authority credentials", async () => {
    let calls = 0;
    const proxy = createSharedDocsApiProxy(authority(() => { calls++; return new Response("unexpected"); }));
    const foreign = await proxy(new Request("http://localhost/api/ops", { method: "POST", headers: { origin: "https://foreign.example" } }));
    expect(foreign.status).toBe(403);
    expect((await proxy(new Request("http://foreign.example/api/ops", { method: "POST", headers: { origin: "http://foreign.example" } }))).status).toBe(403);
    expect(calls).toBe(0);
  });

  test("permits an explicitly configured Vite origin while rejecting other ports", async () => {
    const sharedApi = authority(() => Response.json({ ok: true }));
    const proxy = createSharedDocsApiProxy({ ...sharedApi, allowedBrowserOrigins: ["http://localhost:4801"] });
    expect((await proxy(new Request("http://localhost:4800/api/tree", { headers: { origin: "http://localhost:4801" } }))).status).toBe(200);
    expect((await proxy(new Request("http://localhost:4800/api/tree", { headers: { origin: "http://localhost:4802" } }))).status).toBe(403);
  });

  test("rejects partial setup and remote destinations", () => {
    expect(sharedDocsApiFromEnvironment({})).toBeUndefined();
    expect(() => sharedDocsApiFromEnvironment({ DOCS_SHARED_API_URL: "http://127.0.0.1:4842" })).toThrow("requires");
    expect(sharedDocsApiFromEnvironment({ DOCS_SHARED_API_URL: "http://127.0.0.1:4842", DOCS_SHARED_PROJECT_ID: "docs", DOCS_SHARED_API_TOKEN: "secret" })).toEqual({ url: "http://127.0.0.1:4842", projectId: "docs", token: "secret" });
    for (const url of ["https://example.com", "http://127.0.0.1:4842/path", "http://user:pass@localhost"]) {
      expect(() => createSharedDocsApiProxy({ url, projectId: "docs", token: "secret" })).toThrow("loopback");
    }
  });
});
