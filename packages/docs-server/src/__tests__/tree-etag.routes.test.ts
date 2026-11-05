import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsStore } from "../store";
import { createDocsRoutes } from "../routes";

const DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
};

describe("GET /api/tree ETag", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-tree-etag-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  function getTree(ifNoneMatch?: string): Promise<Response> {
    return app.handle(
      new Request("http://localhost/api/tree", {
        headers: ifNoneMatch === undefined ? {} : { "if-none-match": ifNoneMatch },
      }),
    );
  }

  async function currentEtag(): Promise<string> {
    const res = await getTree();
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    return etag as string;
  }

  test("200 carries a quoted strong ETag and no-cache", async () => {
    const res = await getTree();
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const body = (await res.json()) as { tree: Array<{ path: string }> };
    expect(body.tree[0]?.path).toBe("guide");
  });

  test("same tag in If-None-Match gives 304 with empty body and the same ETag", async () => {
    const etag = await currentEtag();
    const res = await getTree(etag);
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("etag")).toBe(etag);
  });

  test("weak form W/\"tag\" gives 304", async () => {
    const etag = await currentEtag();
    expect((await getTree(`W/${etag}`)).status).toBe(304);
  });

  test("* gives 304", async () => {
    expect((await getTree("*")).status).toBe(304);
  });

  test("a list containing the tag gives 304", async () => {
    const etag = await currentEtag();
    expect((await getTree(`"x", ${etag}`)).status).toBe(304);
  });

  test("a different tag gives 200 with the tree and the ETag", async () => {
    const etag = await currentEtag();
    const res = await getTree('"other"');
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(etag);
    expect(((await res.json()) as { tree: unknown[] }).tree.length).toBeGreaterThan(0);
  });

  test("adding a doc.json changes the ETag", async () => {
    const before = await currentEtag();
    await mkdir(join(docsRoot, "second"), { recursive: true });
    await writeFile(join(docsRoot, "second", "doc.json"), JSON.stringify({ ...DOC, id: "second" }), "utf8");
    const res = await getTree(before);
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).not.toBe(before);
  });
});
