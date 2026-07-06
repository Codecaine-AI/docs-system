import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocsServeApp } from "../server";
import { collectBundlePaths, walkDocsDir } from "@codecaine-ai/docs-server";
import { runExport } from "../export";

/**
 * Route-shape + path-confinement tests for the standalone docs server,
 * against a synthetic docs tree fixture (bundle, nested bundle, canvas
 * sidecar, asset, legacy markdown twin, dot-dir).
 */

let docsRoot: string;
let app: ReturnType<typeof createDocsServeApp>;

const DOC_JSON = (id: string, title: string) => ({
  schemaVersion: 1,
  id,
  root: "root-1",
  blocks: {
    "root-1": {
      id: "root-1",
      flavour: "paragraph",
      props: { title },
      children: ["para-1"],
    },
    "para-1": {
      id: "para-1",
      flavour: "paragraph",
      props: {},
      text: [{ insert: `Hello from ${title}` }],
      children: [],
    },
  },
});

const CANVAS_JSON = {
  schemaVersion: 1,
  id: "canvas-fixture",
  mode: "diagram",
  title: "Fixture canvas",
  objects: [],
  connections: [],
};

async function get(path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`));
}

beforeAll(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-workbench-test-"));

  // Bundle with a canvas sidecar + asset.
  await mkdir(join(docsRoot, "10-guide", "assets", "canvases"), { recursive: true });
  await mkdir(join(docsRoot, "10-guide", "assets", "images"), { recursive: true });
  await writeFile(
    join(docsRoot, "10-guide", "doc.json"),
    JSON.stringify(DOC_JSON("doc-guide", "Guide")),
  );
  await writeFile(
    join(docsRoot, "10-guide", "comments.json"),
    JSON.stringify({ schemaVersion: 1, comments: [] }),
  );
  await writeFile(
    join(docsRoot, "10-guide", "assets", "canvases", "flow.canvas.json"),
    JSON.stringify(CANVAS_JSON),
  );
  await writeFile(join(docsRoot, "10-guide", "assets", "images", "pic.png"), "not-really-a-png");

  // Nested bundle inside a plain dir + a legacy markdown twin (suppressed).
  await mkdir(join(docsRoot, "20-section", "30-topic"), { recursive: true });
  await writeFile(
    join(docsRoot, "20-section", "30-topic", "doc.json"),
    JSON.stringify(DOC_JSON("doc-topic", "Topic")),
  );
  await writeFile(join(docsRoot, "20-section", "30-topic.md"), "# twin");
  await writeFile(join(docsRoot, "20-section", "40-loose.md"), "# loose markdown");

  // Dot dirs are never listed or served.
  await mkdir(join(docsRoot, ".drafts"), { recursive: true });
  await writeFile(join(docsRoot, ".drafts", "secret.md"), "secret");
  await writeFile(join(docsRoot, "..secret.txt"), "sentinel-outside-shape");

  app = createDocsServeApp({ docsRoot });
});

afterAll(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

describe("GET /api/tree", () => {
  test("returns Spectre-shaped bundle-aware tree", async () => {
    const response = await get("/api/tree");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tree: any[] };
    const names = body.tree.map((node) => `${node.kind}:${node.path}`);
    expect(names).toContain("bundle:10-guide");
    expect(names).toContain("dir:20-section");

    const section = body.tree.find((node) => node.path === "20-section");
    const childNames = section.children.map((node: any) => `${node.kind}:${node.path}`);
    expect(childNames).toContain("bundle:20-section/30-topic");
    // markdown twin suppressed, loose markdown listed as file
    expect(childNames).not.toContain("file:20-section/30-topic.md");
    expect(childNames).toContain("file:20-section/40-loose.md");
    // dot dirs and assets internals never appear
    expect(JSON.stringify(body)).not.toContain(".drafts");
    expect(JSON.stringify(body)).not.toContain("assets");
  });
});

describe("GET /api/bundle", () => {
  test("returns the Spectre bundle response shape", async () => {
    const response = await get("/api/bundle?path=10-guide");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.path).toBe("10-guide");
    expect(body.document_path).toBe("docs/10-guide");
    expect((body.doc as any).id).toBe("doc-guide");
    expect(typeof body.doc_hash).toBe("string");
    expect((body.comments as any).schemaVersion).toBe(1);
    expect(typeof body.comments_hash).toBe("string");
  });

  test("accepts <bundle>/doc.json form and normalizes the path", async () => {
    const response = await get("/api/bundle?path=10-guide/doc.json");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string };
    expect(body.path).toBe("10-guide");
  });

  test("404s a missing bundle", async () => {
    const response = await get("/api/bundle?path=90-nope");
    expect(response.status).toBe(404);
  });

  test("rejects traversal and non-doc json shapes", async () => {
    for (const path of [
      "../outside",
      "..%2F..%2Fetc%2Fpasswd",
      "/etc/passwd",
      "10-guide/comments.json",
      "10-guide/assets/canvases/flow.canvas.json",
    ]) {
      const response = await get(`/api/bundle?path=${encodeURIComponent(path)}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
  });
});

describe("GET /api/markdown", () => {
  test("projects a bundle to markdown", async () => {
    const response = await get("/api/markdown?path=20-section/30-topic");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { markdown: string };
    expect(body.markdown).toContain("Hello from Topic");
  });

  test("rejects traversal", async () => {
    const response = await get(`/api/markdown?path=${encodeURIComponent("../../etc/passwd")}`);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/canvas", () => {
  test("serves a canvas sidecar by root-relative src", async () => {
    const response = await get(
      `/api/canvas?src=${encodeURIComponent("10-guide/assets/canvases/flow.canvas.json")}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.canvas_path).toBe("10-guide/assets/canvases/flow.canvas.json");
    expect(body.canvas_document_path).toBe("docs/10-guide/assets/canvases/flow.canvas.json");
    expect(typeof body.content_hash).toBe("string");
    expect((body.canvas as any).id).toBe("canvas-fixture");
  });

  test("rejects srcs outside assets/canvases, traversal, and non-canvas files", async () => {
    for (const src of [
      "../outside/assets/canvases/x.canvas.json",
      "10-guide/assets/canvases/../../../doc.json",
      "10-guide/doc.json",
      "/etc/passwd",
      "10-guide/assets/images/pic.png",
    ]) {
      const response = await get(`/api/canvas?src=${encodeURIComponent(src)}`);
      expect(response.status).toBe(400);
    }
  });

  test("404s a missing canvas", async () => {
    const response = await get(
      `/api/canvas?src=${encodeURIComponent("10-guide/assets/canvases/none.canvas.json")}`,
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/asset", () => {
  test("serves a confined bundle asset with inferred content type", async () => {
    const response = await get(
      `/api/asset?path=${encodeURIComponent("10-guide/assets/images/pic.png")}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("not-really-a-png");
  });

  test("rejects traversal and non-asset paths", async () => {
    for (const path of [
      "../etc/passwd",
      "10-guide/assets/images/../../../../../etc/passwd",
      "10-guide/doc.json",
      "/abs/assets/images/pic.png",
      "10-guide/assets/canvases/flow.canvas.json",
    ]) {
      const response = await get(`/api/asset?path=${encodeURIComponent(path)}`);
      expect(response.status).toBe(400);
    }
  });
});

describe("GET /api/backlinks", () => {
  test("returns the Spectre backlinks response shape", async () => {
    const response = await get(`/api/backlinks?target=${encodeURIComponent("10-guide")}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { target: string; backlinks: unknown[] };
    expect(body.target).toBe("10-guide");
    expect(Array.isArray(body.backlinks)).toBe(true);
  });
});

describe("static SPA serving", () => {
  test("serves index.html at / and confines asset paths", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "docs-workbench-static-"));
    await writeFile(join(staticDir, "index.html"), "<html>spa-shell</html>");
    await mkdir(join(staticDir, "assets"), { recursive: true });
    await writeFile(join(staticDir, "assets", "app.js"), "console.log('app')");
    const staticApp = createDocsServeApp({ docsRoot, staticDir });

    const index = await staticApp.handle(new Request("http://localhost/"));
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("spa-shell");

    const js = await staticApp.handle(new Request("http://localhost/assets/app.js"));
    expect(js.status).toBe(200);

    // Traversal out of the dist dir falls back to the SPA shell, never disk.
    const traversal = await staticApp.handle(
      new Request("http://localhost/assets/%2e%2e/%2e%2e/etc/passwd"),
    );
    expect(await traversal.text()).toContain("spa-shell");

    await rm(staticDir, { recursive: true, force: true });
  });
});

describe("export", () => {
  test("emits tree.json, bundle snapshots, markdown, files, backlinks", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "docs-export-test-"));
    // Pre-seed a fake SPA build so the test does not run vite.
    const distDir = join(import.meta.dir, "..", "..", "web", "dist-static");
    const hadDist = await Bun.file(join(distDir, "index.html")).exists();
    if (!hadDist) {
      await mkdir(distDir, { recursive: true });
      await writeFile(join(distDir, "index.html"), "<html>static-shell</html>");
    }

    const report = await runExport({ docsRoot, outDir });
    expect(report.bundlesExported).toBe(2);
    expect(report.failures).toEqual([]);

    const tree = (await Bun.file(join(outDir, "data", "tree.json")).json()) as { tree: any[] };
    expect(collectBundlePaths(tree.tree)).toEqual(["10-guide", "20-section/30-topic"]);

    const bundle = (await Bun.file(join(outDir, "data", "bundles", "10-guide.json")).json()) as {
      path: string;
      doc: { id: string };
    };
    expect(bundle.path).toBe("10-guide");
    expect(bundle.doc.id).toBe("doc-guide");

    const markdown = await Bun.file(
      join(outDir, "data", "markdown", "20-section", "30-topic.md"),
    ).text();
    expect(markdown).toContain("Hello from Topic");

    expect(
      await Bun.file(
        join(outDir, "data", "files", "10-guide", "assets", "canvases", "flow.canvas.json"),
      ).exists(),
    ).toBe(true);
    expect(
      await Bun.file(join(outDir, "data", "files", "10-guide", "assets", "images", "pic.png")).exists(),
    ).toBe(true);
    expect(await Bun.file(join(outDir, "data", "backlinks.json")).exists()).toBe(true);
    expect(await Bun.file(join(outDir, "index.html")).exists()).toBe(true);

    await rm(outDir, { recursive: true, force: true });
    if (!hadDist) await rm(distDir, { recursive: true, force: true });
  });
});

describe("walkDocsDir parity", () => {
  test("matches Spectre ordering: dirs before files, each alphabetical", async () => {
    const tree = await walkDocsDir(docsRoot);
    expect(tree.map((node) => node.path)).toEqual(["10-guide", "20-section"]);
  });
});
