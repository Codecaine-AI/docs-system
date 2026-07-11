import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";
import { draftLockStore } from "../draft-locks";
import type { DocsChangeEvent } from "../docs-events";

const BUNDLE_PATH = "guide";
const CANVAS_SRC = "./assets/canvases/flow.canvas.json";
const CANVAS_REL_PATH = "guide/assets/canvases/flow.canvas.json";

const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "canvas-guide",
  title: "Canvas guide",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["canvas-1", "p1"] },
    "canvas-1": {
      id: "canvas-1",
      type: "canvas",
      props: { src: CANVAS_SRC },
      children: [],
    },
    p1: {
      id: "p1",
      type: "paragraph",
      props: {},
      text: [{ insert: "Before" }],
      children: [],
    },
  },
};

const SAMPLE_CANVAS = {
  schemaVersion: 1,
  id: "flow",
  mode: "diagram",
  objects: [
    {
      id: "obj-1",
      type: "process",
      label: "Step one",
      parentId: null,
      geometry: { x: 0, y: 0, width: 120, height: 64 },
    },
  ],
  connections: [],
  links: [],
  annotations: [],
};

const ADD_OBJECT_OP = {
  type: "blockAction",
  blockId: "canvas-1",
  action: "canvas.addObject",
  params: {
    object: {
      id: "obj-2",
      type: "process",
      label: "Step two",
      geometry: { x: 200, y: 0, width: 120, height: 64 },
    },
  },
};

describe("POST /api/ops forwarded canvas actions", () => {
  let docsRoot: string;
  let store: DocsStore;
  let app: ReturnType<typeof createDocsRoutes>;
  let initialDocBytes: string;
  let initialCanvasBytes: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-canvas-forward-"));
    await mkdir(join(docsRoot, BUNDLE_PATH, "assets", "canvases"), { recursive: true });
    initialDocBytes = `${JSON.stringify(SAMPLE_DOC, null, 2)}\n`;
    initialCanvasBytes = `${JSON.stringify(SAMPLE_CANVAS, null, 2)}\n`;
    await writeFile(join(docsRoot, BUNDLE_PATH, "doc.json"), initialDocBytes, "utf8");
    await writeFile(join(docsRoot, CANVAS_REL_PATH), initialCanvasBytes, "utf8");
    store = createDocsStore(docsRoot);
    app = createDocsRoutes(store);
  });

  afterEach(async () => {
    draftLockStore.release({ kind: "canvas", path: CANVAS_REL_PATH }, "editor-session");
    draftLockStore.release({ kind: "canvas", path: CANVAS_REL_PATH }, "agent-session");
    await rm(docsRoot, { recursive: true, force: true });
  });

  function postJson(path: string, body: unknown): Promise<Response> {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  async function currentHashes(): Promise<{ docHash: string; canvasHash: string }> {
    const [bundleResponse, canvasResponse] = await Promise.all([
      get(`/api/bundle?path=${BUNDLE_PATH}`),
      get(`/api/canvas?src=${CANVAS_REL_PATH}`),
    ]);
    expect(bundleResponse.status).toBe(200);
    expect(canvasResponse.status).toBe(200);
    const bundle = (await bundleResponse.json()) as { doc_hash: string };
    const canvas = (await canvasResponse.json()) as { content_hash: string };
    return { docHash: bundle.doc_hash, canvasHash: canvas.content_hash };
  }

  async function forward(body: Record<string, unknown> = {}): Promise<Response> {
    return postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [ADD_OBJECT_OP],
      session_id: "agent-session",
      ...body,
    });
  }

  test("forwards one addObject, persists it, and publishes a canvas event", async () => {
    const { docHash, canvasHash } = await currentHashes();
    const events: DocsChangeEvent[] = [];
    const unsubscribe = store.subscribeChanges((event) => events.push(event));
    try {
      const response = await forward({
        expected_hash: docHash,
        expected_canvas_hash: canvasHash,
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown> & {
        canvas: { objects: Array<{ id: string }> };
        canvas_hash: string;
        patch_id: string;
      };
      expect(body.canvas.objects.map((object) => object.id)).toEqual(["obj-1", "obj-2"]);
      expect(body.canvas_hash).toBeTruthy();
      expect(body.patch_id).toBeTruthy();
      expect("doc" in body).toBe(false);
      expect("hash" in body).toBe(false);

      const persisted = JSON.parse(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")) as {
        objects: Array<{ id: string }>;
      };
      expect(persisted.objects.map((object) => object.id)).toEqual(["obj-1", "obj-2"]);
      expect(await readFile(join(docsRoot, BUNDLE_PATH, "doc.json"), "utf8")).toBe(
        initialDocBytes,
      );
      expect(events).toEqual([
        {
          path: CANVAS_REL_PATH,
          changedIds: ["obj-2"],
          patchId: body.patch_id,
          actor: "agent-session",
        },
      ]);

    } finally {
      unsubscribe();
    }
  });

  test("undo restores the forwarded canvas patch to its prior bytes", async () => {
    const response = await forward();
    expect(response.status).toBe(200);
    const { patch_id } = (await response.json()) as { patch_id: string };

    const undoResponse = await postJson("/api/undo", { patch_id });
    expect(undoResponse.status).toBe(200);
    const undone = (await undoResponse.json()) as { ok: boolean; canvas: unknown; hash: string };
    expect(undone.ok).toBe(true);
    expect(undone.canvas).toEqual(SAMPLE_CANVAS);
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 409 for a stale expected_canvas_hash without writing", async () => {
    const response = await forward({ expected_canvas_hash: "stale-canvas-hash" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { current_hash: string; expected_hash: string };
    expect(body.current_hash).toBeTruthy();
    expect(body.expected_hash).toBe("stale-canvas-hash");
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 409 for a stale doc expected_hash before touching the sidecar", async () => {
    const response = await forward({ expected_hash: "stale-doc-hash" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { current_hash: string; expected_hash: string };
    expect(body.current_hash).toBeTruthy();
    expect(body.expected_hash).toBe("stale-doc-hash");
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 423 when another session holds the canvas draft lock", async () => {
    const acquireResponse = await postJson("/api/draft-lock/acquire", {
      path: CANVAS_REL_PATH,
      kind: "canvas",
      sessionId: "editor-session",
    });
    expect(acquireResponse.status).toBe(200);

    const response = await forward();
    expect(response.status).toBe(423);
    const body = (await response.json()) as { held_by?: { sessionId: string } };
    expect(body.held_by?.sessionId).toBe("editor-session");
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("rejects a mixed forward/doc batch atomically with the $.ops issue", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [
        ADD_OBJECT_OP,
        { type: "updateBlock", blockId: "p1", text: [{ insert: "After" }] },
      ],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detail: "Forwarded actions must be sent alone.",
      issues: [{ path: "$.ops", message: "Forwarded actions must be sent alone." }],
    });
    expect(await readFile(join(docsRoot, BUNDLE_PATH, "doc.json"), "utf8")).toBe(
      initialDocBytes,
    );
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 4xx when the canvas block points at an unknown sidecar", async () => {
    const missingDoc = structuredClone(SAMPLE_DOC);
    missingDoc.blocks["canvas-1"].props.src = "./assets/canvases/missing.canvas.json";
    await writeFile(
      join(docsRoot, BUNDLE_PATH, "doc.json"),
      `${JSON.stringify(missingDoc, null, 2)}\n`,
      "utf8",
    );

    const response = await forward();
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 400 when a forwarded canvas action targets a non-canvas block", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{ ...ADD_OBJECT_OP, blockId: "p1" }],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain('not a "canvas" block');
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("validates forwarded params at $.params before calling the canvas authority", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [
        {
          type: "blockAction",
          blockId: "canvas-1",
          action: "canvas.addObject",
          params: {},
        },
      ],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.issues).toContainEqual({
      path: "$.params.object",
      message: expect.any(String),
    });
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("keeps ordinary doc-op batches on the existing response path", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{ type: "updateBlock", blockId: "p1", text: [{ insert: "After" }] }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown> & {
      doc: { blocks: Record<string, { text?: Array<{ insert: string }> }> };
      hash: string;
      patch_id: string;
    };
    expect(body.doc.blocks.p1?.text).toEqual([{ insert: "After" }]);
    expect(body.hash).toBeTruthy();
    expect(body.patch_id).toBeTruthy();
    expect("canvas" in body).toBe(false);
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });
});
