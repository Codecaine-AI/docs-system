import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

const DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "Before" }], children: [] },
  },
};

const EDIT = [{ type: "updateBlock", blockId: "p1", text: [{ insert: "After" }] }];

describe("CODECAINE_DOCS_REQUIRE_HASH", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;
  const saved = process.env.CODECAINE_DOCS_REQUIRE_HASH;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-require-hash-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.CODECAINE_DOCS_REQUIRE_HASH;
    else process.env.CODECAINE_DOCS_REQUIRE_HASH = saved;
    await rm(docsRoot, { recursive: true, force: true });
  });

  const postOps = (body: Record<string, unknown>) =>
    app.handle(
      new Request("http://localhost/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "guide", ops: EDIT, ...body }),
      }),
    );
  const pageText = async () =>
    (JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8")) as typeof DOC).blocks.p1.text[0]!.insert;

  test("with the setting on, a page write with no hash gets 428 and writes nothing", async () => {
    process.env.CODECAINE_DOCS_REQUIRE_HASH = "1";
    const res = await postOps({});
    expect(res.status).toBe(428);
    const body = (await res.json()) as { detail: string; current_hash: string };
    expect(body.detail).toContain("requires the page hash");
    expect(body.current_hash).toBeTruthy();
    expect(await pageText()).toBe("Before");

    const retry = await postOps({ expected_hash: body.current_hash });
    expect(retry.status).toBe(200);
    expect(await pageText()).toBe("After");
  });

  test("with the setting on, a stale hash still gets 409", async () => {
    process.env.CODECAINE_DOCS_REQUIRE_HASH = "1";
    const res = await postOps({ expected_hash: "not-the-current-hash" });
    expect(res.status).toBe(409);
    expect(await pageText()).toBe("Before");
  });

  test("with the setting off, a page write with no hash lands as before", async () => {
    delete process.env.CODECAINE_DOCS_REQUIRE_HASH;
    const res = await postOps({});
    expect(res.status).toBe(200);
    expect(await pageText()).toBe("After");
  });
});
