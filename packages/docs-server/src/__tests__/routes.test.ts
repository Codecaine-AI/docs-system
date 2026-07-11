import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsStore } from "../store";
import { createDocsRoutes } from "../routes";
import { uploadDocVideoAsset } from "../assets";
import { MAX_VIDEO_ASSET_BYTES } from "../confine";
import { draftLockStore } from "../draft-locks";
import type { DocsChangeEvent } from "../docs-events";

/**
 * Route-factory CONTRACT tests: the write routes must mirror the reference
 * host's `/projects/:id/docs/*` semantics — `expected_hash` -> 409 with
 * current/expected hashes, foreign draft lock -> 423 with `held_by`,
 * comments add/resolve shapes, single-use undo that fails loudly.
 */

const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["h1"] },
    h1: {
      id: "h1",
      type: "heading",
      props: { level: 1 },
      text: [{ insert: "Title" }],
      children: [],
    },
  },
};

describe("createDocsRoutes (write contracts)", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-routes-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    draftLockStore.release({ kind: "doc", path: "guide" }, "session-a");
    draftLockStore.release({ kind: "doc", path: "guide" }, "session-b");
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

  test("GET /api/tree and /api/bundle keep the read shapes", async () => {
    const treeRes = await get("/api/tree");
    expect(treeRes.status).toBe(200);
    const tree = (await treeRes.json()) as { tree: Array<{ path: string; kind: string }> };
    expect(tree.tree[0]?.kind).toBe("bundle");
    expect(tree.tree[0]?.path).toBe("guide");

    const bundleRes = await get("/api/bundle?path=guide");
    expect(bundleRes.status).toBe(200);
    const bundle = (await bundleRes.json()) as {
      path: string;
      document_path: string;
      doc_hash: string;
      comments: unknown;
    };
    expect(bundle.path).toBe("guide");
    expect(bundle.document_path).toBe("docs/guide");
    expect(bundle.doc_hash).toBeTruthy();
    expect(bundle.comments).toBeNull();
  });

  test("POST /api/ops applies, returns patch_id, and 409s on a stale expected_hash", async () => {
    const bundleRes = await get("/api/bundle?path=guide");
    const { doc_hash } = (await bundleRes.json()) as { doc_hash: string };

    const okRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
      expected_hash: doc_hash,
      session_id: "session-a",
    });
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as { hash: string; patch_id: string };
    expect(okBody.patch_id).toBeTruthy();
    expect(okBody.hash).not.toBe(doc_hash);

    const staleRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 3 } }],
      expected_hash: doc_hash,
      session_id: "session-a",
    });
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as {
      detail: string;
      current_hash: string;
      expected_hash: string;
    };
    expect(staleBody.current_hash).toBe(okBody.hash);
    expect(staleBody.expected_hash).toBe(doc_hash);
  });

  test("POST /api/ops applies a typed blockAction end-to-end and 400s a bogus action", async () => {
    // A bundle whose doc carries a structured file-tree block.
    await mkdir(join(docsRoot, "ft"), { recursive: true });
    await writeFile(
      join(docsRoot, "ft", "doc.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "ft",
        title: "File tree",
        root: "root",
        blocks: {
          root: { id: "root", type: "paragraph", props: {}, children: ["tree1"] },
          tree1: {
            id: "tree1",
            type: "file-tree",
            props: { entries: [{ path: "src/main.ts" }] },
            children: [],
          },
        },
      }),
      "utf8",
    );

    const bundleRes = await get("/api/bundle?path=ft");
    expect(bundleRes.status).toBe(200);
    const { doc_hash } = (await bundleRes.json()) as { doc_hash: string };

    const okRes = await postJson("/api/ops", {
      path: "ft",
      ops: [
        {
          type: "blockAction",
          blockId: "tree1",
          action: "file-tree.addEntry",
          params: { path: "src/index.ts", note: "entrypoint", change: "added" },
        },
      ],
      expected_hash: doc_hash,
      session_id: "session-a",
    });
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as {
      doc: { blocks: Record<string, { props: Record<string, unknown> }> };
      hash: string;
      patch_id: string;
    };
    expect(okBody.patch_id).toBeTruthy();
    const expectedEntries = [
      { path: "src/main.ts" },
      { path: "src/index.ts", note: "entrypoint", change: "added" },
    ];
    // Entry landed in the returned doc...
    expect(okBody.doc.blocks.tree1?.props.entries).toEqual(expectedEntries);
    // ...and in the persisted doc.json.
    const persisted = JSON.parse(await readFile(join(docsRoot, "ft", "doc.json"), "utf8")) as {
      blocks: Record<string, { props: Record<string, unknown> }>;
    };
    expect(persisted.blocks.tree1?.props.entries).toEqual(expectedEntries);

    // A bogus action name yields the standard 400 op-validation shape.
    const badRes = await postJson("/api/ops", {
      path: "ft",
      ops: [{ type: "blockAction", blockId: "tree1", action: "file-tree.nope", params: {} }],
      expected_hash: okBody.hash,
      session_id: "session-a",
    });
    expect(badRes.status).toBe(400);
    const badBody = (await badRes.json()) as { detail: string; issues: unknown };
    expect(badBody.detail).toBe("Doc ops failed to apply");
    expect(badBody.issues).toEqual([
      { path: "$.op.action", message: 'Unknown block action: "file-tree.nope".' },
    ]);
  });

  test("a foreign draft lock 423-blocks ops (held_by) and the holder passes", async () => {
    const acquireRes = await postJson("/api/draft-lock/acquire", {
      path: "docs/guide",
      kind: "doc",
      sessionId: "session-a",
    });
    expect(acquireRes.status).toBe(200);
    const acquired = (await acquireRes.json()) as {
      ok: boolean;
      lock: { sessionId: string; acquiredAt: string; expiresAt: string };
    };
    expect(acquired.ok).toBe(true);
    expect(acquired.lock.sessionId).toBe("session-a");

    const blockedRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
      session_id: "session-b",
    });
    expect(blockedRes.status).toBe(423);
    const blocked = (await blockedRes.json()) as { held_by?: { sessionId: string } };
    expect(blocked.held_by?.sessionId).toBe("session-a");

    const heartbeatRes = await postJson("/api/draft-lock/heartbeat", {
      path: "docs/guide",
      kind: "doc",
      sessionId: "session-a",
    });
    expect(heartbeatRes.status).toBe(200);

    const allowedRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
      session_id: "session-a",
    });
    expect(allowedRes.status).toBe(200);

    const releaseRes = await postJson("/api/draft-lock/release", {
      path: "docs/guide",
      kind: "doc",
      sessionId: "session-a",
    });
    expect(releaseRes.status).toBe(200);
    expect(await releaseRes.json()).toEqual({ ok: true });

    const afterRelease = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 3 } }],
      session_id: "session-b",
    });
    expect(afterRelease.status).toBe(200);
  });

  test("comments add (201) then resolve, with shapes intact", async () => {
    const addRes = await postJson("/api/comments", {
      path: "guide",
      target: { kind: "block", blockId: "h1" },
      body: "Please review",
      intent: "note",
      author: "tester",
    });
    expect(addRes.status).toBe(201);
    const added = (await addRes.json()) as {
      comment: { id: string; status: string };
      hash: string;
    };
    expect(added.comment.status).toBe("open");
    expect(added.hash).toBeTruthy();

    const listRes = await get("/api/comments?path=guide");
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      comments: { comments: Array<{ id: string }> };
      hash: string | null;
    };
    expect(listed.comments.comments).toHaveLength(1);

    const resolveRes = await postJson(`/api/comments/${added.comment.id}/resolve`, {
      path: "guide",
      expected_hash: added.hash,
    });
    expect(resolveRes.status).toBe(200);
    const resolved = (await resolveRes.json()) as {
      comments: { comments: Array<{ status: string }> };
      hash: string;
    };
    expect(resolved.comments.comments[0]?.status).toBe("resolved");

    const missingRes = await postJson("/api/comments/nope/resolve", { path: "guide" });
    expect(missingRes.status).toBe(404);
  });

  test("undo replays the inverse once and fails loudly on double-use", async () => {
    const opsRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 4 } }],
    });
    expect(opsRes.status).toBe(200);
    const { patch_id } = (await opsRes.json()) as { patch_id: string };

    const undoRes = await postJson("/api/undo", { patch_id });
    expect(undoRes.status).toBe(200);
    const undone = (await undoRes.json()) as {
      ok: boolean;
      doc: { blocks: Record<string, { props: Record<string, unknown> }> };
    };
    expect(undone.ok).toBe(true);
    expect(undone.doc.blocks.h1?.props.level).toBe(1);

    const doubleRes = await postJson("/api/undo", { patch_id });
    expect(doubleRes.status).toBe(404);
    const doubleBody = (await doubleRes.json()) as { ok: boolean; detail: string };
    expect(doubleBody.ok).toBe(false);
    expect(doubleBody.detail).toContain("No undoable patch");
  });

  test("successful ops publish a change event with the changed block ids", async () => {
    const events: DocsChangeEvent[] = [];
    const store = createDocsStore(docsRoot);
    const unsubscribe = store.subscribeChanges((event) => events.push(event));
    try {
      const res = await postJson("/api/ops", {
        path: "guide",
        ops: [{ type: "updateBlock", blockId: "h1", props: { level: 5 } }],
        session_id: "session-a",
      });
      expect(res.status).toBe(200);
      expect(events).toHaveLength(1);
      expect(events[0]?.path).toBe("guide");
      expect(events[0]?.changedIds).toEqual(["h1"]);
      expect(events[0]?.actor).toBe("session-a");
      expect(events[0]?.patchId).toBeTruthy();
    } finally {
      unsubscribe();
    }
  });
});

describe("POST /api/assets/video (strict video upload)", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-video-upload-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  function postVideo(filename: string, type: string, bytes: Uint8Array): Promise<Response> {
    const form = new FormData();
    form.append("file", new File([bytes], filename, { type }));
    form.append("bundlePath", "guide");
    return app.handle(
      new Request("http://localhost/api/assets/video", { method: "POST", body: form }),
    );
  }

  const MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

  test("happy path: writes into the bundle's assets/videos/ and returns the bundle-relative src", async () => {
    const res = await postVideo("Demo Clip.mp4", "video/mp4", MP4_BYTES);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      src: string;
      path: string;
      document_path: string;
      content_type: string;
      size: number;
      filename: string;
    };
    expect(body.src).toBe("./assets/videos/Demo-Clip.mp4");
    expect(body.path).toBe("guide/assets/videos/Demo-Clip.mp4");
    expect(body.document_path).toBe("docs/guide/assets/videos/Demo-Clip.mp4");
    expect(body.content_type).toBe("video/mp4");
    expect(body.size).toBe(MP4_BYTES.byteLength);
    const written = await readFile(join(docsRoot, "guide", "assets", "videos", body.filename));
    expect(new Uint8Array(written)).toEqual(MP4_BYTES);
  });

  test("collision auto-uniquifies with a numeric suffix", async () => {
    expect((await postVideo("clip.mp4", "video/mp4", MP4_BYTES)).status).toBe(201);
    const second = await postVideo("clip.mp4", "video/mp4", MP4_BYTES);
    expect(second.status).toBe(201);
    const body = (await second.json()) as { src: string; filename: string };
    expect(body.filename).toBe("clip-2.mp4");
    expect(body.src).toBe("./assets/videos/clip-2.mp4");
    const third = await postVideo("clip.mp4", "video/mp4", MP4_BYTES);
    expect(((await third.json()) as { filename: string }).filename).toBe("clip-3.mp4");
  });

  test("rejects traversal and null-byte filenames outright (400)", async () => {
    expect((await postVideo("../escape.mp4", "video/mp4", MP4_BYTES)).status).toBe(400);
    expect((await postVideo("a/b.mp4", "video/mp4", MP4_BYTES)).status).toBe(400);
    expect((await postVideo("evil\0.mp4", "video/mp4", MP4_BYTES)).status).toBe(400);
    // Nothing landed anywhere under the docs root.
    expect(existsSync(join(docsRoot, "guide", "assets"))).toBe(false);
    expect(existsSync(join(docsRoot, "escape.mp4"))).toBe(false);
  });

  test("rejects non-video extensions and non-video content types (415)", async () => {
    expect((await postVideo("notes.txt", "video/mp4", MP4_BYTES)).status).toBe(415);
    expect((await postVideo("page.html", "text/html", MP4_BYTES)).status).toBe(415);
    // Right extension, hostile declared MIME.
    expect((await postVideo("clip.mp4", "text/html", MP4_BYTES)).status).toBe(415);
    expect(existsSync(join(docsRoot, "guide", "assets"))).toBe(false);
  });

  test("404s for a bundle that does not exist", async () => {
    const form = new FormData();
    form.append("file", new File([MP4_BYTES], "clip.mp4", { type: "video/mp4" }));
    form.append("bundlePath", "nope");
    const res = await app.handle(
      new Request("http://localhost/api/assets/video", { method: "POST", body: form }),
    );
    expect(res.status).toBe(404);
  });

  test("413s over the 64MB cap without trusting caller-declared size", async () => {
    // Declared-size rejection (cheap: arrayBuffer is never read).
    const declared = await uploadDocVideoAsset(docsRoot, {
      bundlePath: "guide",
      file: {
        name: "big.mp4",
        type: "video/mp4",
        size: MAX_VIDEO_ASSET_BYTES + 1,
        arrayBuffer: () => {
          throw new Error("size check must reject before reading bytes");
        },
      },
    });
    expect(declared.ok).toBe(false);
    if (!declared.ok) expect(declared.status).toBe(413);

    // Actual-bytes rejection: an under-reported size must not sneak past.
    const lying = await uploadDocVideoAsset(docsRoot, {
      bundlePath: "guide",
      file: {
        name: "liar.mp4",
        type: "video/mp4",
        size: 8,
        arrayBuffer: async () => new ArrayBuffer(MAX_VIDEO_ASSET_BYTES + 1),
      },
    });
    expect(lying.ok).toBe(false);
    if (!lying.ok) expect(lying.status).toBe(413);
    expect(existsSync(join(docsRoot, "guide", "assets", "videos", "liar.mp4"))).toBe(false);
  });
});

describe("GET /api/blocks (edit-surface discovery)", () => {
  type BlocksDiscovery = import("@codecaine-ai/docs-model").BlocksDiscovery;

  const OP_NAMES = [
    "insertBlock",
    "updateBlock",
    "deleteBlock",
    "moveBlock",
    "splitBlock",
    "mergeBlocks",
    "blockAction",
  ] as const;
  const COMPONENT_NAMES = [
    "rich-text",
    "code",
    "mermaid",
    "file-tree",
    "structured-table",
    "interaction-surface",
    "canvas",
  ] as const;
  const LEGACY_ACTION_KEYS = [
    "code.removeAnnotation",
    "code.setAnnotation",
    "file-tree.addEntry",
    "file-tree.removeEntry",
    "file-tree.updateEntry",
    "interaction-surface.addOperation",
    "interaction-surface.removeOperation",
    "interaction-surface.updateOperation",
    "structured-table.addColumn",
    "structured-table.addRow",
    "structured-table.removeColumn",
    "structured-table.removeRow",
    "structured-table.updateCell",
  ] as const;

  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-blocks-"));
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  async function getBlocks(): Promise<{
    status: number;
    body: BlocksDiscovery;
  }> {
    const response = await app.handle(new Request("http://localhost/api/blocks"));
    return { status: response.status, body: (await response.json()) as BlocksDiscovery };
  }

  test("200s with schemaVersion 2 and all 7 documented kernel ops", async () => {
    const { status, body } = await getBlocks();
    expect(status).toBe(200);
    expect(body.schemaVersion).toBe(2);

    expect(body.ops.map((entry) => entry.op)).toEqual([...OP_NAMES]);
    expect(body.ops).toHaveLength(7);
    for (const entry of body.ops) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  test("lists all components and partitions the 14 canonical block types", async () => {
    const { body } = await getBlocks();
    const { DOC_BLOCK_TYPES } = await import("@codecaine-ai/docs-model/doc-schema");

    expect(body.components).toHaveLength(7);
    expect(body.components.map((component) => component.name)).toEqual([...COMPONENT_NAMES]);

    const servedTypes = body.components.flatMap((component) =>
      component.types.map((entry) => entry.type),
    );
    expect(servedTypes).toHaveLength(DOC_BLOCK_TYPES.length);
    expect(new Set(servedTypes).size).toBe(servedTypes.length);
    expect([...servedTypes].sort()).toEqual([...DOC_BLOCK_TYPES].sort());
  });

  test("serves closed state schemas and object parameter schemas", async () => {
    const { body } = await getBlocks();

    for (const component of body.components) {
      for (const entry of component.types) {
        expect(typeof entry.carriesText).toBe("boolean");
        expect(entry.state).not.toBeNull();
        expect(typeof entry.state).toBe("object");
        expect(Array.isArray(entry.state)).toBe(false);
        expect(entry.state.additionalProperties).toBe(false);
      }
      for (const action of component.actions) {
        expect(action.params.type).toBe("object");
        expect(action.params.properties).not.toBeNull();
        expect(typeof action.params.properties).toBe("object");
        expect(Array.isArray(action.params.properties)).toBe(false);
      }
    }

    const actionKeys = body.components.flatMap((component) =>
      component.actions.map((action) => action.action),
    );
    expect([...actionKeys].sort()).toEqual([...LEGACY_ACTION_KEYS]);
  });

  test("matches the docs-model discovery builder exactly", async () => {
    const { body } = await getBlocks();
    const { buildBlocksDiscovery } = await import("@codecaine-ai/docs-model");
    const expectedJson = JSON.stringify(buildBlocksDiscovery());

    expect(body).toEqual(JSON.parse(expectedJson));
    expect(JSON.stringify(body)).toBe(expectedJson);
  });
});
