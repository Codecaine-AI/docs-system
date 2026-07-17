import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

/**
 * The doc.json write gate (incident regression): a workbench autosave once
 * shipped a delta span whose `attributes.reference` was a character-spread of
 * the string "[object Object]" ({"0":"[","1":"o",...} — no kind, no path).
 * `applyOps` copies span attributes verbatim, so the save was ACCEPTED and
 * persisted; the NEXT load ran `validateDocDocument`, refused the reference,
 * and the whole bundle became unopenable. Invariant locked here: no accepted
 * write may produce bytes that fail `validateDocDocument` on reload — the
 * gate in `applyDocOpsToBundle` revalidates the full post-op document before
 * persisting and 422s (issues array, file untouched) instead.
 */

/** The literal corrupt attribute shape from the incident. */
const CORRUPT_REFERENCE = Object.fromEntries(
  [..."[object Object]"].map((char, index) => [String(index), char]),
);

const GUIDE_DOC = {
  schemaVersion: 1,
  id: "guide",
  title: "Guide",
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

describe("doc.json write gate (validateDocDocument before persist)", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-write-gate-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(GUIDE_DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
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

  async function docHash(path: string): Promise<string> {
    const res = await get(`/api/bundle?path=${path}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { doc_hash: string }).doc_hash;
  }

  test("POST /api/ops 422s the incident's corrupt reference span and leaves doc.json byte-unchanged", async () => {
    const hash = await docHash("guide");
    const bytesBefore = await readFile(join(docsRoot, "guide", "doc.json"), "utf8");

    const res = await postJson("/api/ops", {
      path: "guide",
      ops: [
        {
          type: "updateBlock",
          blockId: "h1",
          text: [{ insert: "see the spec", attributes: { reference: CORRUPT_REFERENCE } }],
        },
      ],
      expected_hash: hash,
      session_id: "session-a",
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.detail).toBe("Doc ops produced an invalid document; save rejected.");
    expect(body.issues).toEqual(
      expect.arrayContaining([
        {
          path: "$.blocks.h1.text[0].attributes.reference.kind",
          message: 'Reference kind must be "doc" or "source".',
        },
        {
          path: "$.blocks.h1.text[0].attributes.reference.path",
          message: "Reference requires a non-empty repo-relative path.",
        },
      ]),
    );

    const bytesAfter = await readFile(join(docsRoot, "guide", "doc.json"), "utf8");
    expect(bytesAfter).toBe(bytesBefore);

    // The bundle stays loadable — the whole point of the gate.
    expect((await get("/api/bundle?path=guide")).status).toBe(200);
  });

  test("POST /api/ops still accepts a valid updateBlock save (well-formed reference round-trips)", async () => {
    const hash = await docHash("guide");
    const res = await postJson("/api/ops", {
      path: "guide",
      ops: [
        {
          type: "updateBlock",
          blockId: "h1",
          text: [
            { insert: "see " },
            { insert: "the spec", attributes: { reference: { kind: "doc", path: "guide" } } },
          ],
        },
      ],
      expected_hash: hash,
      session_id: "session-a",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { doc: unknown; hash: string; patch_id: string };
    expect(body.patch_id).toEqual(expect.any(String));

    const reloaded = await get("/api/bundle?path=guide");
    expect(reloaded.status).toBe(200);
    const bundle = (await reloaded.json()) as {
      doc: { blocks: Record<string, { text?: Array<Record<string, unknown>> }> };
    };
    expect(bundle.doc.blocks.h1?.text).toEqual([
      { insert: "see " },
      { insert: "the spec", attributes: { reference: { kind: "doc", path: "guide" } } },
    ]);
  });

  test("POST /api/ops 422s an insertBlock introducing an invalid span and leaves doc.json byte-unchanged", async () => {
    const hash = await docHash("guide");
    const bytesBefore = await readFile(join(docsRoot, "guide", "doc.json"), "utf8");

    const res = await postJson("/api/ops", {
      path: "guide",
      ops: [
        {
          type: "insertBlock",
          blockId: "p-new",
          parentId: "root",
          index: 1,
          blockType: "paragraph",
          props: {},
          text: [{ insert: "pasted", attributes: { reference: CORRUPT_REFERENCE } }],
        },
      ],
      expected_hash: hash,
      session_id: "session-a",
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: Array<{ path: string }> };
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues[0]?.path).toContain("$.blocks.p-new.text[0].attributes.reference");

    const bytesAfter = await readFile(join(docsRoot, "guide", "doc.json"), "utf8");
    expect(bytesAfter).toBe(bytesBefore);
    expect((await get("/api/bundle?path=guide")).status).toBe(200);
  });

  test("POST /api/ops still accepts a valid insertBlock save", async () => {
    const hash = await docHash("guide");
    const res = await postJson("/api/ops", {
      path: "guide",
      ops: [
        {
          type: "insertBlock",
          blockId: "p-new",
          parentId: "root",
          index: 1,
          blockType: "paragraph",
          props: {},
          text: [{ insert: "a fresh paragraph" }],
        },
      ],
      expected_hash: hash,
      session_id: "session-a",
    });
    expect(res.status).toBe(200);

    const reloaded = await get("/api/bundle?path=guide");
    expect(reloaded.status).toBe(200);
    const bundle = (await reloaded.json()) as {
      doc: { blocks: Record<string, { text?: Array<{ insert: string }> }> };
    };
    expect(bundle.doc.blocks["p-new"]?.text).toEqual([{ insert: "a fresh paragraph" }]);
  });

  test("POST /api/move rewrites inbound reference spans through the gated seam and the result reloads", async () => {
    // A second bundle whose text will reference "guide" once saved via the
    // gated ops route (the save also populates the backlinks index the move
    // route consults).
    await mkdir(join(docsRoot, "linker"), { recursive: true });
    await writeFile(
      join(docsRoot, "linker", "doc.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "linker",
        title: "Linker",
        root: "root",
        blocks: {
          root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
          p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "stub" }], children: [] },
        },
      }),
      "utf8",
    );

    const linkerHash = await docHash("linker");
    const saveRes = await postJson("/api/ops", {
      path: "linker",
      ops: [
        {
          type: "updateBlock",
          blockId: "p1",
          text: [{ insert: "the guide", attributes: { reference: { kind: "doc", path: "guide" } } }],
        },
      ],
      expected_hash: linkerHash,
      session_id: "session-a",
    });
    expect(saveRes.status).toBe(200);

    // The backlinks upsert after a save is fire-and-forget; wait until the
    // index shows the inbound row before moving.
    let indexed = false;
    for (let attempt = 0; attempt < 100 && !indexed; attempt += 1) {
      const res = await get("/api/backlinks?target=guide");
      if (res.status === 200) {
        const body = (await res.json()) as { backlinks: unknown[] };
        indexed = body.backlinks.length > 0;
      }
      if (!indexed) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(indexed).toBe(true);

    const moveRes = await postJson("/api/move", { fromPath: "guide", toPath: "moved/guide" });
    expect(moveRes.status).toBe(200);
    const moved = (await moveRes.json()) as {
      moved: { fromPath: string; toPath: string };
      rewrittenSources: string[];
      failures: Array<{ sourcePath: string; reason: string }>;
    };
    expect(moved.failures).toEqual([]);
    expect(moved.rewrittenSources).toContain("linker/doc.json");

    // The rewritten linker doc passed the write gate and still reloads with
    // the reference re-pointed at the new bundle path.
    const reloaded = await get("/api/bundle?path=linker");
    expect(reloaded.status).toBe(200);
    const bundle = (await reloaded.json()) as {
      doc: { blocks: Record<string, { text?: Array<Record<string, unknown>> }> };
    };
    expect(bundle.doc.blocks.p1?.text).toEqual([
      { insert: "the guide", attributes: { reference: { kind: "doc", path: "moved/guide" } } },
    ]);
    expect((await get("/api/bundle?path=moved/guide")).status).toBe(200);
  });
});
