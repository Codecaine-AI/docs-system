import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

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

describe("createDocsRoutes (strict writes, tolerant reads)", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-strict-writes-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
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

  function postDecodedJson(path: string, body: unknown): Promise<Response> {
    const request = new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    Object.defineProperty(request, "json", { value: async () => body });
    return app.handle(request);
  }

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  test("POST /api/ops returns 400 with $.op.props paths for schema-refused writes", async () => {
    const bundleRes = await get("/api/bundle?path=guide");
    expect(bundleRes.status).toBe(200);
    const { doc_hash } = (await bundleRes.json()) as { doc_hash: string };

    const refusedRes = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { stray: true } }],
      expected_hash: doc_hash,
      session_id: "session-a",
    });

    expect(refusedRes.status).toBe(400);
    const refused = (await refusedRes.json()) as {
      detail: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(refused.detail).toBe("Doc ops failed to apply");
    expect(refused.issues).toEqual([
      { path: "$.op.props.stray", message: expect.any(String) },
    ]);
  });

  test("GET /api/bundle tolerates and preserves stray canvas props", async () => {
    await mkdir(join(docsRoot, "canvas-guide"), { recursive: true });
    await writeFile(
      join(docsRoot, "canvas-guide", "doc.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "canvas-guide",
        title: "Canvas guide",
        root: "root",
        blocks: {
          root: { id: "root", type: "paragraph", props: {}, children: ["canvas1"] },
          canvas1: {
            id: "canvas1",
            type: "canvas",
            props: { src: "./assets/example.canvas.json", zoom: 3 },
            children: [],
          },
        },
      }),
      "utf8",
    );

    const bundleRes = await get("/api/bundle?path=canvas-guide");
    expect(bundleRes.status).toBe(200);
    const bundle = (await bundleRes.json()) as {
      doc: { blocks: Record<string, { props: Record<string, unknown> }> };
    };
    expect(bundle.doc.blocks.canvas1?.props).toEqual({
      src: "./assets/example.canvas.json",
      zoom: 3,
    });
  });

  test("POST /api/undo restores legacy props removed by an accepted cleanup op", async () => {
    await mkdir(join(docsRoot, "legacy-guide"), { recursive: true });
    await writeFile(
      join(docsRoot, "legacy-guide", "doc.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "legacy-guide",
        title: "Legacy guide",
        root: "root",
        blocks: {
          root: { id: "root", type: "paragraph", props: {}, children: ["legacy"] },
          legacy: {
            id: "legacy",
            type: "paragraph",
            props: { legacy: true },
            text: [{ insert: "Legacy content" }],
            children: [],
          },
        },
      }),
      "utf8",
    );

    const bundleRes = await get("/api/bundle?path=legacy-guide");
    expect(bundleRes.status).toBe(200);
    const { doc_hash } = (await bundleRes.json()) as { doc_hash: string };

    // `undefined` is the model's prop-deletion sentinel but cannot be represented
    // on the JSON wire, so provide the route the already-decoded request value.
    const opsRes = await postDecodedJson("/api/ops", {
      path: "legacy-guide",
      ops: [{ type: "updateBlock", blockId: "legacy", props: { legacy: undefined } }],
      expected_hash: doc_hash,
      session_id: "session-a",
    });
    expect(opsRes.status).toBe(200);
    const { patch_id } = (await opsRes.json()) as { patch_id: string };
    expect(patch_id).toBeTruthy();

    const undoRes = await postJson("/api/undo", { patch_id });
    expect(undoRes.status).toBe(200);

    const persisted = JSON.parse(
      await readFile(join(docsRoot, "legacy-guide", "doc.json"), "utf8"),
    ) as { blocks: Record<string, { props: Record<string, unknown> }> };
    expect(persisted.blocks.legacy?.props.legacy).toBe(true);
  });
});
