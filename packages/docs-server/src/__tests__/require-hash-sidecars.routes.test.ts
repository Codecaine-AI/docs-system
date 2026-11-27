import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

/**
 * CODECAINE_DOCS_REQUIRE_HASH=1 on the legacy .mdx page rewrites
 * (POST /api/canvas with insert_mdx, DELETE /api/canvas with remove_reference)
 * and the whole-sidecar saves (PUT /api/canvas, PUT /api/sequence).
 */

const MDX_PATH = "guide/page.mdx";
const MDX_TEXT = "# Guide page\n";
const CANVAS_SRC = "./assets/canvases/flow.canvas.json";
const CANVAS_FILE = "guide/assets/canvases/flow.canvas.json";
const NEW_CANVAS_SRC = "./assets/canvases/new.canvas.json";
const NEW_CANVAS_FILE = "guide/assets/canvases/new.canvas.json";
const SEQUENCE_SRC = "./assets/sequences/flow.sequence.json";
const SEQUENCE_FILE = "guide/assets/sequences/flow.sequence.json";

const canvas = (id: string, text: string) => ({
  schemaVersion: 1,
  id,
  mode: "diagram",
  objects: [{ id: "obj-1", type: "process", text, parentId: null, geometry: { x: 0, y: 0, width: 120, height: 64 } }],
  connections: [],
  annotations: [],
});
const sequence = (title: string) => ({
  version: 1,
  id: "flow",
  title,
  participants: [
    { id: "a", name: "a", kind: "participant" },
    { id: "b", name: "b", kind: "participant" },
  ],
  items: [{ kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "hello" }],
  style: {},
});

describe("CODECAINE_DOCS_REQUIRE_HASH on legacy page rewrites and sidecar saves", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;
  const saved = process.env.CODECAINE_DOCS_REQUIRE_HASH;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-require-hash-sidecars-"));
    await mkdir(join(docsRoot, "guide/assets/canvases"), { recursive: true });
    await mkdir(join(docsRoot, "guide/assets/sequences"), { recursive: true });
    await writeFile(join(docsRoot, MDX_PATH), MDX_TEXT, "utf8");
    await writeFile(join(docsRoot, CANVAS_FILE), JSON.stringify(canvas("flow", "Before")), "utf8");
    await writeFile(join(docsRoot, SEQUENCE_FILE), JSON.stringify(sequence("Before")), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.CODECAINE_DOCS_REQUIRE_HASH;
    else process.env.CODECAINE_DOCS_REQUIRE_HASH = saved;
    await rm(docsRoot, { recursive: true, force: true });
  });

  const send = (method: string, path: string, body?: Record<string, unknown>) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const text = (file: string) => readFile(join(docsRoot, file), "utf8");
  const exists = (file: string) => Bun.file(join(docsRoot, file)).exists();

  const writes = {
    "POST /api/canvas with insert_mdx": {
      send: (hash?: string) =>
        send("POST", "/api/canvas", {
          path: MDX_PATH,
          src: NEW_CANVAS_SRC,
          canvas: canvas("fresh", "New"),
          insert_mdx: true,
          ...(hash ? { original_hash: hash } : {}),
        }),
      unchanged: async () => (await text(MDX_PATH)) === MDX_TEXT && !(await exists(NEW_CANVAS_FILE)),
    },
    "DELETE /api/canvas with remove_reference": {
      send: (hash?: string) =>
        send(
          "DELETE",
          `/api/canvas?path=${encodeURIComponent(MDX_PATH)}&src=${encodeURIComponent(CANVAS_SRC)}&remove_reference=true${hash ? `&original_hash=${encodeURIComponent(hash)}` : ""}`,
        ),
      unchanged: async () => (await text(MDX_PATH)) === MDX_TEXT && (await exists(CANVAS_FILE)),
    },
    "PUT /api/canvas by page": {
      send: (hash?: string) =>
        send("PUT", "/api/canvas", {
          path: MDX_PATH,
          src: CANVAS_SRC,
          canvas: canvas("flow", "After"),
          ...(hash ? { original_hash: hash } : {}),
        }),
      unchanged: async () => (await text(CANVAS_FILE)).includes("Before"),
    },
    "PUT /api/canvas by src": {
      send: (hash?: string) =>
        send("PUT", "/api/canvas", {
          src: "guide/assets/canvases/flow.canvas.json",
          canvas: canvas("flow", "After"),
          ...(hash ? { original_hash: hash } : {}),
        }),
      unchanged: async () => (await text(CANVAS_FILE)).includes("Before"),
    },
    "PUT /api/sequence": {
      send: (hash?: string) =>
        send("PUT", "/api/sequence", {
          path: MDX_PATH,
          src: SEQUENCE_SRC,
          sequence: sequence("After"),
          ...(hash ? { original_hash: hash } : {}),
        }),
      unchanged: async () => (await text(SEQUENCE_FILE)).includes("Before"),
    },
  };

  for (const [name, write] of Object.entries(writes)) {
    test(`${name}: with the setting on, no hash gets 428 and writes nothing, and the returned hash then lands`, async () => {
      process.env.CODECAINE_DOCS_REQUIRE_HASH = "1";
      const refused = await write.send();
      expect(refused.status).toBe(428);
      const body = (await refused.json()) as { detail: string; current_hash: string };
      expect(body.detail).toContain("requires the file hash");
      expect(body.current_hash).toBeTruthy();
      expect(await write.unchanged()).toBe(true);

      const retry = await write.send(body.current_hash);
      expect(retry.status).toBeLessThan(300);
      expect(await write.unchanged()).toBe(false);
    });

    test(`${name}: with the setting off, no hash lands as before`, async () => {
      delete process.env.CODECAINE_DOCS_REQUIRE_HASH;
      const res = await write.send();
      expect(res.status).toBeLessThan(300);
      expect(await write.unchanged()).toBe(false);
    });
  }

  test("with the setting on, a new sidecar that does not rewrite the page needs no hash", async () => {
    process.env.CODECAINE_DOCS_REQUIRE_HASH = "1";
    const res = await send("POST", "/api/canvas", { path: MDX_PATH, src: NEW_CANVAS_SRC, canvas: canvas("fresh", "New") });
    expect(res.status).toBe(201);
    expect(await text(MDX_PATH)).toBe(MDX_TEXT);
  });
});
