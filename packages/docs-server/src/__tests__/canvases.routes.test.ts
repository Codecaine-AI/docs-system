import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";

const FLOW_REL_PATH = "guide/assets/canvases/flow.canvas.json";
const ARCH_REL_PATH = "systems/overview/assets/canvases/arch.canvas.json";
const BROKEN_REL_PATH = "guide/assets/canvases/broken.canvas.json";

const FLOW_CANVAS = {
  schemaVersion: 1,
  id: "flow",
  title: "Request flow",
  mode: "diagram",
  objects: [],
  connections: [],
  links: [],
  annotations: [],
};

const ARCH_CANVAS = {
  schemaVersion: 1,
  id: "arch",
  mode: "diagram",
  objects: [],
  connections: [],
  links: [],
  annotations: [],
};

type CanvasListEntry = {
  src: string;
  canvas_path: string;
  id: string | null;
  title: string | null;
  updated_at: string;
};

describe("GET /api/canvases", () => {
  let docsRoot: string;
  let store: DocsStore;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-canvases-"));
    store = createDocsStore(docsRoot);
    app = createDocsRoutes(store);
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  async function writeFixtures(): Promise<void> {
    await mkdir(join(docsRoot, "guide", "assets", "canvases"), { recursive: true });
    await mkdir(join(docsRoot, "systems", "overview", "assets", "canvases"), {
      recursive: true,
    });
    await writeFile(
      join(docsRoot, FLOW_REL_PATH),
      `${JSON.stringify(FLOW_CANVAS, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(docsRoot, ARCH_REL_PATH),
      `${JSON.stringify(ARCH_CANVAS, null, 2)}\n`,
      "utf8",
    );
  }

  test("lists sidecar fixtures with src/canvas_path/id/title/updated_at", async () => {
    await writeFixtures();

    const response = await get("/api/canvases");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvases: CanvasListEntry[] };
    expect(body.canvases.map((entry) => entry.canvas_path)).toEqual([
      FLOW_REL_PATH,
      ARCH_REL_PATH,
    ]);

    const flow = body.canvases.find((entry) => entry.canvas_path === FLOW_REL_PATH);
    expect(flow).toEqual({
      src: FLOW_REL_PATH,
      canvas_path: FLOW_REL_PATH,
      id: "flow",
      title: "Request flow",
      updated_at: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(flow!.updated_at))).toBe(false);

    // No `title` field in the sidecar -> null (file still listed).
    const arch = body.canvases.find((entry) => entry.canvas_path === ARCH_REL_PATH);
    expect(arch?.id).toBe("arch");
    expect(arch?.title).toBeNull();

    // Every listed src round-trips through the existing single-canvas read.
    for (const entry of body.canvases) {
      const single = await get(`/api/canvas?src=${entry.src}`);
      expect(single.status).toBe(200);
      const singleBody = (await single.json()) as { canvas_path: string };
      expect(singleBody.canvas_path).toBe(entry.canvas_path);
    }
  });

  test("still lists an unparsable sidecar, with null id/title", async () => {
    await writeFixtures();
    await writeFile(join(docsRoot, BROKEN_REL_PATH), "{ not json", "utf8");

    const response = await get("/api/canvases");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvases: CanvasListEntry[] };
    const broken = body.canvases.find((entry) => entry.canvas_path === BROKEN_REL_PATH);
    expect(broken).toEqual({
      src: BROKEN_REL_PATH,
      canvas_path: BROKEN_REL_PATH,
      id: null,
      title: null,
      updated_at: expect.any(String),
    });
  });

  test("excludes *.canvas.json files outside an assets/canvases/ segment", async () => {
    await writeFixtures();
    await writeFile(
      join(docsRoot, "stray.canvas.json"),
      `${JSON.stringify(FLOW_CANVAS, null, 2)}\n`,
      "utf8",
    );

    const response = await get("/api/canvases");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvases: CanvasListEntry[] };
    expect(body.canvases.map((entry) => entry.canvas_path)).toEqual([
      FLOW_REL_PATH,
      ARCH_REL_PATH,
    ]);
  });

  test("returns an empty list for an empty docs root", async () => {
    const response = await get("/api/canvases");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ canvases: [] });
  });
});

describe("PUT /api/canvas", () => {
  let docsRoot: string;
  let store: DocsStore;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-canvas-put-"));
    store = createDocsStore(docsRoot);
    app = createDocsRoutes(store);
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  function put(body: unknown): Promise<Response> {
    return app.handle(
      new Request("http://localhost/api/canvas", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async function writeFlowFixture(): Promise<void> {
    await mkdir(join(docsRoot, "guide", "assets", "canvases"), { recursive: true });
    await writeFile(
      join(docsRoot, FLOW_REL_PATH),
      `${JSON.stringify(FLOW_CANVAS, null, 2)}\n`,
      "utf8",
    );
  }

  test("src-rooted form saves an existing sidecar and rotates content_hash", async () => {
    await writeFlowFixture();

    const read = await get(`/api/canvas?src=${FLOW_REL_PATH}`);
    expect(read.status).toBe(200);
    const { content_hash: originalHash } = (await read.json()) as { content_hash: string };

    const nextCanvas = { ...FLOW_CANVAS, title: "Request flow v2" };
    const response = await put({
      src: FLOW_REL_PATH,
      original_hash: originalHash,
      canvas: nextCanvas,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string | null;
      document_path: string | null;
      canvas_path: string;
      canvas_document_path: string;
      content_hash: string;
      canvas: { title?: string };
    };
    expect(body.path).toBeNull();
    expect(body.document_path).toBeNull();
    expect(body.canvas_path).toBe(FLOW_REL_PATH);
    expect(body.canvas_document_path).toBe(`docs/${FLOW_REL_PATH}`);
    expect(body.content_hash).not.toBe(originalHash);
    expect(body.canvas.title).toBe("Request flow v2");

    // The sidecar file on disk was rewritten with the server's formatting.
    const onDisk = await readFile(join(docsRoot, FLOW_REL_PATH), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(nextCanvas, null, 2)}\n`);

    // A follow-up read serves the new hash + payload.
    const reread = await get(`/api/canvas?src=${FLOW_REL_PATH}`);
    const rereadBody = (await reread.json()) as { content_hash: string };
    expect(rereadBody.content_hash).toBe(body.content_hash);
  });

  test("src-rooted form 409s on a stale original_hash, reporting current_hash", async () => {
    await writeFlowFixture();

    const read = await get(`/api/canvas?src=${FLOW_REL_PATH}`);
    const { content_hash: currentHash } = (await read.json()) as { content_hash: string };

    const response = await put({
      src: FLOW_REL_PATH,
      original_hash: "stale-hash",
      canvas: { ...FLOW_CANVAS, title: "Never lands" },
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      detail: string;
      current_hash: string;
      original_hash: string;
    };
    expect(body.detail).toContain("stale");
    expect(body.current_hash).toBe(currentHash);
    expect(body.original_hash).toBe("stale-hash");

    // Original file untouched.
    const onDisk = await readFile(join(docsRoot, FLOW_REL_PATH), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(FLOW_CANVAS, null, 2)}\n`);
  });

  test("src-rooted form 404s on a missing sidecar", async () => {
    const response = await put({
      src: "guide/assets/canvases/missing.canvas.json",
      canvas: FLOW_CANVAS,
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("not found");
  });

  test("legacy doc-relative form (path + src) still saves", async () => {
    await writeFlowFixture();
    await writeFile(join(docsRoot, "guide", "page.mdx"), "# Guide\n", "utf8");

    const read = await get(`/api/canvas?src=${FLOW_REL_PATH}`);
    const { content_hash: originalHash } = (await read.json()) as { content_hash: string };

    const nextCanvas = { ...FLOW_CANVAS, title: "Doc-relative save" };
    const response = await put({
      path: "guide/page.mdx",
      src: "./assets/canvases/flow.canvas.json",
      original_hash: originalHash,
      canvas: nextCanvas,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string;
      document_path: string;
      canvas_path: string;
      content_hash: string;
    };
    expect(body.path).toBe("guide/page.mdx");
    expect(body.document_path).toBe("docs/guide/page.mdx");
    expect(body.canvas_path).toBe(FLOW_REL_PATH);
    expect(body.content_hash).not.toBe(originalHash);

    const onDisk = await readFile(join(docsRoot, FLOW_REL_PATH), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(nextCanvas, null, 2)}\n`);
  });
});

describe("dev CORS for cross-origin canvas editors", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-canvases-cors-"));
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  test("OPTIONS /api/canvases preflight answers 204 with permissive headers", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/canvases", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3999",
          "access-control-request-method": "GET",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, PUT, POST, DELETE, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });

  test("PUT /api/canvas preflight and GET /api/canvases responses carry CORS headers", async () => {
    const preflight = await app.handle(
      new Request("http://localhost/api/canvas", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3999",
          "access-control-request-method": "PUT",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const list = await app.handle(new Request("http://localhost/api/canvases"));
    expect(list.status).toBe(200);
    expect(list.headers.get("access-control-allow-origin")).toBe("*");
  });
});
