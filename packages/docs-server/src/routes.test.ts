import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsStore } from "./store";
import { createDocsRoutes } from "./routes";
import { draftLockStore } from "./draft-locks";
import type { DocsChangeEvent } from "./docs-events";

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
    root: { id: "root", flavour: "paragraph", props: {}, children: ["h1"] },
    h1: {
      id: "h1",
      flavour: "heading",
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
