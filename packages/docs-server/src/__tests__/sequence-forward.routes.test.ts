import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createContentHash } from "../bundle";
import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";
import { draftLockStore } from "../draft-locks";
import type { DocsChangeEvent } from "../docs-events";

/**
 * Sequence counterpart of canvas-forward.routes.test.ts: the doc-relative
 * sidecar routes (GET/PUT/POST/DELETE /api/sequence, GET /api/sequence-by-doc)
 * plus /api/ops forwarding for authority "sequence".
 */

const BUNDLE_PATH = "guide";
const MDX_DOC_PATH = "guide/page.mdx";
const SEQUENCE_SRC = "./assets/sequences/flow.sequence.json";
const SEQUENCE_REL_PATH = "guide/assets/sequences/flow.sequence.json";

const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "sequence-guide",
  title: "Sequence guide",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["sequence-1", "p1"] },
    "sequence-1": {
      id: "sequence-1",
      type: "sequence",
      props: { src: SEQUENCE_SRC },
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

const SAMPLE_SEQUENCE = {
  version: 1,
  id: "flow",
  title: "Flow",
  participants: [
    { id: "a", name: "a", kind: "participant" },
    { id: "b", name: "b", kind: "participant" },
  ],
  items: [
    { kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "hello" },
  ],
  style: {},
};

const SET_TITLE_OP = {
  type: "blockAction",
  blockId: "sequence-1",
  action: "sequence.setTitle",
  params: { title: "Renamed flow" },
};

describe("sequence sidecar routes + forwarded sequence actions", () => {
  let docsRoot: string;
  let store: DocsStore;
  let app: ReturnType<typeof createDocsRoutes>;
  let initialDocBytes: string;
  let initialSequenceBytes: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-sequence-forward-"));
    await mkdir(join(docsRoot, BUNDLE_PATH, "assets", "sequences"), { recursive: true });
    initialDocBytes = `${JSON.stringify(SAMPLE_DOC, null, 2)}\n`;
    initialSequenceBytes = `${JSON.stringify(SAMPLE_SEQUENCE, null, 2)}\n`;
    await writeFile(join(docsRoot, BUNDLE_PATH, "doc.json"), initialDocBytes, "utf8");
    await writeFile(join(docsRoot, MDX_DOC_PATH), "# Guide page\n", "utf8");
    await writeFile(join(docsRoot, SEQUENCE_REL_PATH), initialSequenceBytes, "utf8");
    store = createDocsStore(docsRoot);
    app = createDocsRoutes(store);
  });

  afterEach(async () => {
    draftLockStore.release({ kind: "sequence", path: SEQUENCE_REL_PATH }, "editor-session");
    draftLockStore.release({ kind: "sequence", path: SEQUENCE_REL_PATH }, "agent-session");
    await rm(docsRoot, { recursive: true, force: true });
  });

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  function sendJson(method: string, path: string, body: unknown): Promise<Response> {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  const postJson = (path: string, body: unknown) => sendJson("POST", path, body);

  async function forward(body: Record<string, unknown> = {}): Promise<Response> {
    return postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [SET_TITLE_OP],
      session_id: "agent-session",
      ...body,
    });
  }

  // -- reads ---------------------------------------------------------------

  test("GET /api/sequence serves a sidecar by root-relative src", async () => {
    const response = await get(`/api/sequence?src=${encodeURIComponent(SEQUENCE_REL_PATH)}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sequence_path: string;
      sequence_document_path: string;
      content_hash: string;
      sequence: { id: string };
    };
    expect(body.sequence_path).toBe(SEQUENCE_REL_PATH);
    expect(body.sequence_document_path).toBe(`docs/${SEQUENCE_REL_PATH}`);
    expect(body.content_hash).toBe(createContentHash(initialSequenceBytes));
    expect(body.sequence.id).toBe("flow");
  });

  test("GET /api/sequence rejects traversal and non-sequence paths, 404s missing", async () => {
    for (const src of [
      "../outside/assets/sequences/x.sequence.json",
      "guide/assets/sequences/../../../doc.json",
      "guide/doc.json",
      "guide/assets/canvases/flow.canvas.json",
    ]) {
      const response = await get(`/api/sequence?src=${encodeURIComponent(src)}`);
      expect(response.status).toBe(400);
    }
    const missing = await get(
      `/api/sequence?src=${encodeURIComponent("guide/assets/sequences/none.sequence.json")}`,
    );
    expect(missing.status).toBe(404);
  });

  test("GET /api/sequence-by-doc resolves the sidecar relative to the doc", async () => {
    const response = await get(
      `/api/sequence-by-doc?path=${encodeURIComponent(MDX_DOC_PATH)}&src=${encodeURIComponent(SEQUENCE_SRC)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string;
      document_path: string;
      sequence_path: string;
      sequence_document_path: string;
      content_hash: string;
      sequence: { id: string };
    };
    expect(body.path).toBe(MDX_DOC_PATH);
    expect(body.document_path).toBe(`docs/${MDX_DOC_PATH}`);
    expect(body.sequence_path).toBe(SEQUENCE_REL_PATH);
    expect(body.sequence_document_path).toBe(`docs/${SEQUENCE_REL_PATH}`);
    expect(body.sequence.id).toBe("flow");
  });

  // -- sidecar save / create / delete ---------------------------------------

  test("PUT /api/sequence round-trips a whole-document save", async () => {
    const nextSequence = { ...SAMPLE_SEQUENCE, title: "Saved title" };
    const response = await sendJson("PUT", "/api/sequence", {
      path: MDX_DOC_PATH,
      src: SEQUENCE_SRC,
      sequence: nextSequence,
      original_hash: createContentHash(initialSequenceBytes),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sequence_path: string; content_hash: string };
    expect(body.sequence_path).toBe(SEQUENCE_REL_PATH);
    const persistedBytes = await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8");
    expect(body.content_hash).toBe(createContentHash(persistedBytes));
    expect((JSON.parse(persistedBytes) as { title: string }).title).toBe("Saved title");
  });

  test("PUT /api/sequence returns 409 for a stale original_hash without writing", async () => {
    const response = await sendJson("PUT", "/api/sequence", {
      path: MDX_DOC_PATH,
      src: SEQUENCE_SRC,
      sequence: { ...SAMPLE_SEQUENCE, title: "Stale write" },
      original_hash: "stale-hash",
    });
    expect(response.status).toBe(409);
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("PUT /api/sequence rejects an invalid sequence payload", async () => {
    const response = await sendJson("PUT", "/api/sequence", {
      path: MDX_DOC_PATH,
      src: SEQUENCE_SRC,
      sequence: { version: 1, id: "broken" },
    });
    expect(response.status).toBe(400);
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("POST /api/sequence creates a new sidecar and 409s when it exists", async () => {
    const src = "./assets/sequences/new.sequence.json";
    const created = await postJson("/api/sequence", {
      path: MDX_DOC_PATH,
      src,
      sequence: { ...SAMPLE_SEQUENCE, id: "new-flow" },
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { sequence_path: string };
    expect(body.sequence_path).toBe("guide/assets/sequences/new.sequence.json");
    expect(
      (JSON.parse(
        await readFile(join(docsRoot, "guide/assets/sequences/new.sequence.json"), "utf8"),
      ) as { id: string }).id,
    ).toBe("new-flow");

    const conflict = await postJson("/api/sequence", {
      path: MDX_DOC_PATH,
      src,
      sequence: { ...SAMPLE_SEQUENCE, id: "new-flow" },
    });
    expect(conflict.status).toBe(409);
  });

  test("DELETE /api/sequence removes the sidecar", async () => {
    const response = await app.handle(
      new Request(
        `http://localhost/api/sequence?path=${encodeURIComponent(MDX_DOC_PATH)}&src=${encodeURIComponent(SEQUENCE_SRC)}`,
        { method: "DELETE" },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      path: MDX_DOC_PATH,
      sequence_path: SEQUENCE_REL_PATH,
      deleted: true,
    });
    const followUp = await get(`/api/sequence?src=${encodeURIComponent(SEQUENCE_REL_PATH)}`);
    expect(followUp.status).toBe(404);
  });

  // -- forwarded actions -----------------------------------------------------

  test("forwards setTitle, persists it, and publishes a sequence event", async () => {
    const bundleResponse = await get(`/api/bundle?path=${BUNDLE_PATH}`);
    const { doc_hash } = (await bundleResponse.json()) as { doc_hash: string };
    const events: DocsChangeEvent[] = [];
    const unsubscribe = store.subscribeChanges((event) => events.push(event));
    try {
      const response = await forward({
        expected_hash: doc_hash,
        expected_sequence_hash: createContentHash(initialSequenceBytes),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown> & {
        sequence: { title: string };
        sequence_hash: string;
        patch_id: string;
      };
      expect(body.sequence.title).toBe("Renamed flow");
      expect(body.patch_id).toBeTruthy();
      expect("doc" in body).toBe(false);
      expect("canvas" in body).toBe(false);

      const persistedBytes = await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8");
      expect(body.sequence_hash).toBe(createContentHash(persistedBytes));
      expect((JSON.parse(persistedBytes) as { title: string }).title).toBe("Renamed flow");
      expect(await readFile(join(docsRoot, BUNDLE_PATH, "doc.json"), "utf8")).toBe(
        initialDocBytes,
      );
      expect(events).toEqual([
        {
          path: SEQUENCE_REL_PATH,
          changedIds: [],
          patchId: body.patch_id,
          actor: "agent-session",
        },
      ]);
    } finally {
      unsubscribe();
    }
  });

  test("forwards setProgram and persists the reparsed structure", async () => {
    const program = [
      "participant 1 text=svc",
      "participant 2 text=db",
      "",
      "seq",
      "  1 > 2 text=query",
    ].join("\n");
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "blockAction",
        blockId: "sequence-1",
        action: "sequence.setProgram",
        params: { program },
      }],
    });
    expect(response.status).toBe(200);
    const persisted = JSON.parse(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")) as {
      id: string;
      participants: Array<{ name: string }>;
      items: Array<{ kind: string; text?: string }>;
    };
    // The sidecar's own id survives a whole-program rewrite.
    expect(persisted.id).toBe("flow");
    expect(persisted.participants.map((participant) => participant.name)).toEqual(["svc", "db"]);
    expect(persisted.items).toHaveLength(1);
    expect(persisted.items[0]?.text).toBe("query");
  });

  test("returns 400 for a setProgram that fails to parse, without writing", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "blockAction",
        blockId: "sequence-1",
        action: "sequence.setProgram",
        params: { program: "utter nonsense" },
      }],
    });
    expect(response.status).toBe(400);
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("forwards setStyle and shallow-merges the style", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "blockAction",
        blockId: "sequence-1",
        action: "sequence.setStyle",
        params: { style: { accent: "#ff0000" } },
      }],
    });
    expect(response.status).toBe(200);
    const persisted = JSON.parse(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")) as {
      style: { accent?: string };
      title?: string;
    };
    expect(persisted.style.accent).toBe("#ff0000");
    expect(persisted.title).toBe("Flow");
  });

  test("undo restores the forwarded sequence patch to its prior bytes", async () => {
    const response = await forward();
    expect(response.status).toBe(200);
    const { patch_id } = (await response.json()) as { patch_id: string };

    const undoResponse = await postJson("/api/undo", { patch_id });
    expect(undoResponse.status).toBe(200);
    const undone = (await undoResponse.json()) as { ok: boolean; sequence: unknown };
    expect(undone.ok).toBe(true);
    expect(undone.sequence).toEqual(SAMPLE_SEQUENCE);
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("returns 409 for a stale expected_sequence_hash without writing", async () => {
    const response = await forward({ expected_sequence_hash: "stale-sequence-hash" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { current_hash: string; expected_hash: string };
    expect(body.current_hash).toBeTruthy();
    expect(body.expected_hash).toBe("stale-sequence-hash");
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("returns 409 for a stale doc expected_hash before touching the sidecar", async () => {
    const response = await forward({ expected_hash: "stale-doc-hash" });
    expect(response.status).toBe(409);
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("returns 423 when another session holds the sequence draft lock", async () => {
    const acquireResponse = await postJson("/api/draft-lock/acquire", {
      path: SEQUENCE_REL_PATH,
      kind: "sequence",
      sessionId: "editor-session",
    });
    expect(acquireResponse.status).toBe(200);

    const response = await forward();
    expect(response.status).toBe(423);
    const body = (await response.json()) as { held_by?: { sessionId: string } };
    expect(body.held_by?.sessionId).toBe("editor-session");
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("returns 400 when a forwarded sequence action targets a non-sequence block", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{ ...SET_TITLE_OP, blockId: "p1" }],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.detail).toContain('targets "sequence" blocks');
    expect(body.issues).toContainEqual({ path: "$.op.blockId", message: body.detail });
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("returns 400 for a sequenceId-only central sequence reference", async () => {
    const doc = structuredClone(SAMPLE_DOC) as typeof SAMPLE_DOC & {
      blocks: { "sequence-1": { props: Record<string, unknown> } };
    };
    delete doc.blocks["sequence-1"].props.src;
    doc.blocks["sequence-1"].props.sequenceId = "central-sequence-id";
    await writeFile(
      join(docsRoot, BUNDLE_PATH, "doc.json"),
      `${JSON.stringify(doc, null, 2)}\n`,
      "utf8",
    );

    const response = await forward();
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toBe(
      "Central sequence references are not routable by this server yet; only sidecar sequences are supported.",
    );
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });

  test("validates forwarded params at $.params before calling the sequence authority", async () => {
    const response = await postJson("/api/ops", {
      path: BUNDLE_PATH,
      ops: [{
        type: "blockAction",
        blockId: "sequence-1",
        action: "sequence.setTitle",
        params: {},
      }],
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.issues).toContainEqual({
      path: "$.params.title",
      message: expect.any(String),
    });
    expect(await readFile(join(docsRoot, SEQUENCE_REL_PATH), "utf8")).toBe(initialSequenceBytes);
  });
});
