import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

import { createContentHash } from "../bundle";
import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";
import { draftLockStore } from "../draft-locks";
import type { DocsChangeEvent } from "../docs-events";
import { withPathLock } from "../path-mutex";

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
  type: "componentAction",
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
      expect(body.patch_id).toBeTruthy();
      expect("doc" in body).toBe(false);
      expect("hash" in body).toBe(false);

      const persistedBytes = await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8");
      const persisted = JSON.parse(persistedBytes) as {
        objects: Array<{ id: string }>;
      };
      expect(body.canvas_hash).toBe(createContentHash(persistedBytes));
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

  test("forwards updateObject and persists the patched label", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "componentAction",
        blockId: "canvas-1",
        action: "canvas.updateObject",
        params: { objectId: "obj-1", patch: { label: "Updated step" } },
      }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvas_hash: string };
    const persistedBytes = await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8");
    const persisted = JSON.parse(persistedBytes) as { objects: Array<{ id: string; label: string }> };
    expect(persisted.objects.find((object) => object.id === "obj-1")?.label).toBe("Updated step");
    expect(body.canvas_hash).toBe(createContentHash(persistedBytes));
  });

  test("forwards addConnection between two objects and persists it", async () => {
    const canvas = structuredClone(SAMPLE_CANVAS);
    canvas.objects.push({
      id: "obj-2",
      type: "process",
      label: "Step two",
      parentId: null,
      geometry: { x: 200, y: 0, width: 120, height: 64 },
    });
    await writeFile(join(docsRoot, CANVAS_REL_PATH), `${JSON.stringify(canvas, null, 2)}\n`, "utf8");

    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "componentAction",
        blockId: "canvas-1",
        action: "canvas.addConnection",
        params: {
          connection: {
            id: "obj-1-to-obj-2",
            from: { objectId: "obj-1", anchor: "right" },
            to: { objectId: "obj-2", anchor: "left" },
            style: "elbow",
            arrow: "forward",
          },
        },
      }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvas_hash: string };
    const persistedBytes = await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8");
    const persisted = JSON.parse(persistedBytes) as { connections: unknown[] };
    expect(persisted.connections).toEqual([{
      id: "obj-1-to-obj-2",
      from: { objectId: "obj-1", anchor: "right" },
      to: { objectId: "obj-2", anchor: "left" },
      style: "elbow",
      arrow: "forward",
    }]);
    expect(body.canvas_hash).toBe(createContentHash(persistedBytes));
  });

  test("forwards an object-targeted addAnnotation and persists it", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "componentAction",
        blockId: "canvas-1",
        action: "canvas.addAnnotation",
        params: {
          annotation: {
            id: "review-obj-1",
            target: { kind: "object", objectId: "obj-1" },
            body: "Review this step.",
            intent: "note",
            status: "open",
            createdBy: "agent",
          },
        },
      }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvas_hash: string };
    const persistedBytes = await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8");
    const persisted = JSON.parse(persistedBytes) as { annotations: unknown[] };
    expect(persisted.annotations).toEqual([{
      id: "review-obj-1",
      target: { kind: "object", objectId: "obj-1" },
      body: "Review this step.",
      intent: "note",
      status: "open",
      createdBy: "agent",
    }]);
    expect(body.canvas_hash).toBe(createContentHash(persistedBytes));
  });

  test("forwards fitContainerToChildren and persists changed container geometry", async () => {
    const canvas = structuredClone(SAMPLE_CANVAS);
    canvas.objects = [
      {
        id: "container-1",
        type: "container",
        label: "Container",
        parentId: null,
        geometry: { x: 0, y: 0, width: 500, height: 500 },
      },
      {
        id: "child-1",
        type: "process",
        label: "Child",
        parentId: "container-1",
        geometry: { x: 100, y: 120, width: 120, height: 64 },
      },
    ];
    await writeFile(join(docsRoot, CANVAS_REL_PATH), `${JSON.stringify(canvas, null, 2)}\n`, "utf8");

    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "componentAction",
        blockId: "canvas-1",
        action: "canvas.fitContainerToChildren",
        params: { containerId: "container-1", padding: 20 },
      }],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canvas_hash: string };
    const persistedBytes = await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8");
    const persisted = JSON.parse(persistedBytes) as {
      objects: Array<{ id: string; geometry: { x: number; y: number; width: number; height: number } }>;
    };
    expect(persisted.objects.find((object) => object.id === "container-1")?.geometry).toEqual({
      x: 80,
      y: 96,
      width: 160,
      height: 112,
    });
    expect(body.canvas_hash).toBe(createContentHash(persistedBytes));
  });

  test("refuses a forwarded write through a canvases symlink outside docsRoot", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "docs-server-canvas-outside-"));
    const outsideCanvas = join(outsideRoot, "flow.canvas.json");
    try {
      await writeFile(outsideCanvas, initialCanvasBytes, "utf8");
      const canvasesDir = join(docsRoot, BUNDLE_PATH, "assets", "canvases");
      await rm(canvasesDir, { recursive: true, force: true });
      await symlink(outsideRoot, canvasesDir, "dir");

      const response = await forward();
      expect(response.status).toBe(400);
      const body = (await response.json()) as { detail: string };
      expect(body.detail).toBe(`Invalid canvas sidecar path: ${CANVAS_REL_PATH}`);
      expect(await readFile(outsideCanvas, "utf8")).toBe(initialCanvasBytes);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("holds the doc path lock until the forwarded canvas apply completes", async () => {
    const canvasAbs = join(docsRoot, CANVAS_REL_PATH);
    let markCanvasLockHeld: () => void = () => {};
    const canvasLockHeld = new Promise<void>((resolve) => {
      markCanvasLockHeld = resolve;
    });
    let releaseCanvasLock: () => void = () => {};
    const canvasLockRelease = new Promise<void>((resolve) => {
      releaseCanvasLock = resolve;
    });
    const heldCanvasLock = withPathLock(canvasAbs, async () => {
      markCanvasLockHeld();
      await canvasLockRelease;
    });
    await canvasLockHeld;

    let forwardedPromise: ReturnType<DocsStore["forwardCanvasAction"]> | undefined;
    let docMutationPromise: ReturnType<DocsStore["applyDocOps"]> | undefined;
    try {
      forwardedPromise = store.forwardCanvasAction(
        BUNDLE_PATH,
        ADD_OBJECT_OP as Extract<DocOp, { type: "componentAction" }>,
        undefined,
        undefined,
        "agent-session",
      );

      let docMutationSettled = false;
      docMutationPromise = store
        .applyDocOps(
          BUNDLE_PATH,
          [{ type: "deleteBlock", blockId: "canvas-1", mode: "subtree" }],
          undefined,
          "editor-session",
        )
        .then((result) => {
          docMutationSettled = true;
          return result;
        });

      await Bun.sleep(100);
      expect(docMutationSettled).toBe(false);

      releaseCanvasLock();
      const [forwarded, docMutation] = await Promise.all([
        forwardedPromise,
        docMutationPromise,
      ]);
      expect(forwarded.ok).toBe(true);
      expect(docMutation.ok).toBe(true);
    } finally {
      releaseCanvasLock();
      await heldCanvasLock;
      await Promise.allSettled(
        [forwardedPromise, docMutationPromise].filter(
          (promise): promise is Promise<unknown> => promise !== undefined,
        ),
      );
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

  test("action-derived canvas operation type overrides a stray params type", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        ...ADD_OBJECT_OP,
        params: {
          ...ADD_OBJECT_OP.params,
          type: "fitContainerToChildren",
          containerId: "obj-1",
        },
      }],
    });
    expect(response.status).toBe(200);
    const persisted = JSON.parse(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")) as {
      objects: Array<{ id: string; geometry: { width: number; height: number } }>;
    };
    expect(persisted.objects.map((object) => object.id)).toEqual(["obj-1", "obj-2"]);
    expect(persisted.objects[0]?.geometry).toEqual(SAMPLE_CANVAS.objects[0]?.geometry);
  });

  test("routes a canvas block with both src and canvasId via src", async () => {
    const doc = structuredClone(SAMPLE_DOC);
    doc.blocks["canvas-1"].props.canvasId = "central-canvas-id";
    await writeFile(join(docsRoot, BUNDLE_PATH, "doc.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    const response = await forward();
    expect(response.status).toBe(200);
    const persisted = JSON.parse(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")) as {
      objects: Array<{ id: string }>;
    };
    expect(persisted.objects.map((object) => object.id)).toEqual(["obj-1", "obj-2"]);
  });

  test("returns 400 for a canvasId-only central canvas reference", async () => {
    const doc = structuredClone(SAMPLE_DOC);
    delete doc.blocks["canvas-1"].props.src;
    doc.blocks["canvas-1"].props.canvasId = "central-canvas-id";
    await writeFile(join(docsRoot, BUNDLE_PATH, "doc.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    const response = await forward();
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe(
      "Central canvas references are not routable by this server yet; only sidecar canvases are supported.",
    );
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
    const body = (await response.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.detail).toContain('targets "canvas" blocks');
    expect(body.issues).toContainEqual({ path: "$.op.blockId", message: body.detail });
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("returns 400 with a structured issue when the target block is missing", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{ ...ADD_OBJECT_OP, blockId: "missing" }],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.issues).toEqual([{ path: "$.op.blockId", message: body.detail }]);
    expect(await readFile(join(docsRoot, CANVAS_REL_PATH), "utf8")).toBe(initialCanvasBytes);
  });

  test("validates forwarded params at $.params before calling the canvas authority", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [
        {
          type: "componentAction",
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
