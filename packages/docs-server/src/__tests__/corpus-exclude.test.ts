import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openBacklinksDb, queryInbound, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import { setDocsRootExclude } from "@codecaine-ai/docs-index/paths";

import { listCanvasSidecars } from "../canvas-sidecar";
import { collectBundlePaths, walkDocsDir } from "../docs-tree";
import { changeTargetForRelPath } from "../fs-watch";
import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";
import { createDocBundle, deleteDocBundle, moveDocTreeBundle } from "../changesets/tree-ops";

/**
 * codecaine.docs.json "exclude": a knowledge base (docsRoot ".") keeps frozen
 * Session inputs under sessions/<id>/outputs/inputs/ out of its corpus.
 */

const EXCLUDE = ["sessions/*/outputs/inputs/**"];
const FROZEN = "sessions/s1/outputs/inputs/spec-pages/p1";

function doc(id: string, links: string[] = []) {
  return {
    schemaVersion: 1,
    id,
    title: id,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: links.length ? ["p"] : [] },
      ...(links.length
        ? {
            p: {
              id: "p",
              type: "paragraph",
              props: {},
              text: links.map((path) => ({ insert: path, attributes: { reference: { kind: "doc", path } } })),
              children: [],
            },
          }
        : {}),
    },
  };
}

let docsRoot: string;

async function writeDoc(path: string, value = doc(path.replaceAll("/", "-"))) {
  await mkdir(join(docsRoot, path), { recursive: true });
  await writeFile(join(docsRoot, path, "doc.json"), JSON.stringify(value));
}

beforeEach(async () => {
  docsRoot = await realpath(await mkdtemp(join(tmpdir(), "docs-exclude-")));
  await writeDoc("notes/seed");
  await writeDoc(FROZEN, doc("p1", ["notes/seed/doc.json"]));
  await mkdir(join(docsRoot, `${FROZEN}/assets/canvases`), { recursive: true });
  await writeFile(join(docsRoot, `${FROZEN}/assets/canvases/c.canvas.json`), "{}");
  await mkdir(join(docsRoot, "notes/seed/assets/canvases"), { recursive: true });
  await writeFile(join(docsRoot, "notes/seed/assets/canvases/kept.canvas.json"), "{}");
});

afterEach(async () => {
  setDocsRootExclude(docsRoot, undefined);
  await rm(docsRoot, { recursive: true, force: true });
});

describe("exclude rule", () => {
  test("GET /api/tree omits excluded bundles once the store carries the project's exclude", async () => {
    const before = collectBundlePaths(await walkDocsDir(docsRoot));
    expect(before).toContain(FROZEN);

    const app = createDocsRoutes(createDocsStore(docsRoot, { exclude: EXCLUDE }));
    const response = await app.handle(new Request("http://localhost/api/tree"));
    expect(response.status).toBe(200);
    const tree = (await response.json() as any).tree;
    const paths = collectBundlePaths(tree);
    expect(paths).toEqual(["notes/seed"]);
    expect(JSON.stringify(tree)).not.toContain("outputs/inputs");
  });

  test("an excluded doc cannot be read through the store or the bundle route", async () => {
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    expect((await store.docGet("notes/seed")).ok).toBe(true);
    expect((await store.docGet(FROZEN)).ok).toBe(false);
    const app = createDocsRoutes(store);
    const response = await app.handle(new Request(`http://localhost/api/bundle?path=${encodeURIComponent(FROZEN)}`));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  test("the backlinks index skips excluded docs", async () => {
    const db = await openBacklinksDb(docsRoot);
    try {
      const unexcluded = await rescanAll(docsRoot, db);
      expect(unexcluded.sourcesScanned).toBe(4);
      expect(queryInbound(db, "notes/seed/doc.json").map((row) => row.sourcePath)).toEqual([`${FROZEN}/doc.json`]);

      setDocsRootExclude(docsRoot, EXCLUDE);
      const excluded = await rescanAll(docsRoot, db);
      expect(excluded.sourcesScanned).toBe(2); // notes/seed doc.json and its canvas
      expect(queryInbound(db, "notes/seed/doc.json")).toEqual([]);
    } finally {
      db.close();
    }
  });

  test("the canvas listing and the file watcher skip excluded paths", async () => {
    setDocsRootExclude(docsRoot, EXCLUDE);
    expect((await listCanvasSidecars(docsRoot)).map((entry) => entry.src))
      .toEqual(["notes/seed/assets/canvases/kept.canvas.json"]);
    expect(changeTargetForRelPath(docsRoot, `${FROZEN}/doc.json`)).toBeNull();
    expect(changeTargetForRelPath(docsRoot, "sessions/s1/outputs/inputs")).toBeNull();
    expect(changeTargetForRelPath(docsRoot, "notes/seed/doc.json")).toBe("notes/seed");
  });

  test("create, move and delete refuse an excluded path with 403", async () => {
    setDocsRootExclude(docsRoot, EXCLUDE);
    expect(await createDocBundle(docsRoot, "sessions/s1/outputs/inputs/new-page", "New"))
      .toMatchObject({ ok: false, status: 403 });
    expect(await moveDocTreeBundle(docsRoot, "notes/seed", "sessions/s1/outputs/inputs/moved"))
      .toMatchObject({ ok: false, status: 403 });
    expect(await moveDocTreeBundle(docsRoot, FROZEN, "notes/moved")).toMatchObject({ ok: false, status: 403 });
    expect(await deleteDocBundle(docsRoot, FROZEN)).toMatchObject({ ok: false, status: 403 });
    expect(await readdir(join(docsRoot, "sessions/s1/outputs/inputs"))).toEqual(["spec-pages"]);
  });

  test("a change-set naming an excluded path is refused before it is staged", async () => {
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    const staged = await store.changesetStage({
      summary: "Create under the frozen inputs",
      entries: [],
      treeOps: [{ kind: "create-doc", docPath: "sessions/s1/outputs/inputs/x", title: "X", position: 0 }],
    });
    expect(staged).toMatchObject({ ok: false, status: 403 });
    const listed = await store.changesets();
    expect(listed.ok && listed.changesets).toEqual([]);
  });

  test("corpus management refuses excluded paths and never fingerprints them", async () => {
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    const refused = await store.manageFiles({ kind: "page", path: FROZEN, to: "notes/p1", expected_hash: "x" });
    expect(refused).toMatchObject({ ok: false, status: 403 });
    // A symlink inside the excluded area no longer blocks management of the corpus.
    await writeFile(join(docsRoot, "sessions/s1/outputs/inputs/target.txt"), "x");
    await symlink("target.txt", join(docsRoot, "sessions/s1/outputs/inputs/link.txt"));
    const assets = await store.assets();
    expect(assets).toMatchObject({ ok: true });
    expect((assets as any).assets.map((asset: any) => asset.path))
      .toEqual(["notes/seed/assets/canvases/kept.canvas.json"]);
  });

  test("exclusion is per docs root and clears with an empty list", async () => {
    const other = await realpath(await mkdtemp(join(tmpdir(), "docs-exclude-other-")));
    try {
      await mkdir(join(other, FROZEN), { recursive: true });
      await writeFile(join(other, FROZEN, "doc.json"), JSON.stringify(doc("p1")));
      createDocsStore(docsRoot, { exclude: EXCLUDE });
      expect(collectBundlePaths(await walkDocsDir(other))).toEqual([FROZEN]);
      createDocsStore(docsRoot, { exclude: [] });
      expect(collectBundlePaths(await walkDocsDir(docsRoot))).toContain(FROZEN);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });
});

/** sha256 of every file below `rel` (folders end in "/"), keyed by docs-root-relative path. */
async function subtreeBytes(rel: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    let entries;
    try { entries = await readdir(join(docsRoot, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(docsRoot, path))).digest("hex");
    }
  };
  await walk(rel);
  return out;
}

const docHash = async (path: string) =>
  createHash("sha256").update(await readFile(join(docsRoot, path, "doc.json"))).digest("hex");

describe("whole-folder operations and excluded descendants (B7-03)", () => {
  async function stageAndAccept(store: ReturnType<typeof createDocsStore>, treeOps: unknown[]) {
    const staged = await store.changesetStage({ summary: "tree op", entries: [], treeOps: treeOps as any });
    if (!staged.ok) return staged;
    return store.changesetAccept(staged.changeset.id);
  }
  const move = (app: ReturnType<typeof createDocsRoutes>, fromPath: string, toPath: string) =>
    app.handle(new Request("http://localhost/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromPath, toPath }),
    }));

  test("an allowed ancestor page cannot be moved, renamed or deleted while it holds excluded inputs", async () => {
    await writeDoc("sessions/s1");
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    const app = createDocsRoutes(store);
    const frozen = await subtreeBytes("sessions/s1/outputs");
    expect(Object.keys(frozen)).toContain(`${FROZEN}/doc.json`);
    const hash = await docHash("sessions/s1");

    for (const input of [
      { kind: "page" as const, path: "sessions/s1", to: "notes/archive", expected_hash: hash },
      { kind: "page" as const, path: "sessions/s1", to: "sessions/s1-renamed", expected_hash: hash },
      { kind: "page" as const, path: "sessions/s1", expected_hash: hash, recursive: true },
    ]) {
      for (const preview of [true, false]) {
        const result = await store.manageFiles({ ...input, preview, expected_tree_hash: "any" });
        expect(result).toMatchObject({ ok: false, status: 403 });
        expect((result as { excluded: string[] }).excluded).toEqual(["sessions/s1/outputs/inputs"]);
      }
    }
    expect(await stageAndAccept(store, [{ kind: "move-doc", from: "sessions/s1", to: "notes/archive", position: 0 }]))
      .toMatchObject({ ok: false, status: 403 });
    expect(await stageAndAccept(store, [{ kind: "delete-doc", docPath: "sessions/s1", position: 0 }]))
      .toMatchObject({ ok: false, status: 403 });
    expect((await move(app, "sessions/s1", "notes/archive")).status).toBe(403);

    // The frozen inputs stay where they were, byte-identical; nothing landed at a destination.
    expect(await subtreeBytes("sessions/s1/outputs")).toEqual(frozen);
    expect(await readdir(join(docsRoot, "notes"))).toEqual(["seed"]);
    expect((await readdir(join(docsRoot, "sessions"))).sort()).toEqual(["s1"]);
  });

  test("an allowed subtree cannot move to where part of it would become excluded", async () => {
    await writeDoc("notes/carrier");
    await mkdir(join(docsRoot, "notes/carrier/outputs/inputs/x"), { recursive: true });
    await writeFile(join(docsRoot, "notes/carrier/outputs/inputs/x/data.txt"), "data\n");
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    const app = createDocsRoutes(store);
    const before = await subtreeBytes("notes/carrier");
    const hash = await docHash("notes/carrier");

    const managed = await store.manageFiles({ kind: "page", path: "notes/carrier", to: "sessions/s2", expected_hash: hash });
    expect(managed).toMatchObject({ ok: false, status: 403 });
    expect((managed as { excluded_at_destination: string[] }).excluded_at_destination).toEqual(["sessions/s2/outputs/inputs"]);
    expect(await stageAndAccept(store, [{ kind: "move-doc", from: "notes/carrier", to: "sessions/s2", position: 0 }]))
      .toMatchObject({ ok: false, status: 403 });
    expect((await move(app, "notes/carrier", "sessions/s2")).status).toBe(403);
    expect(await subtreeBytes("notes/carrier")).toEqual(before);
    expect((await readdir(join(docsRoot, "sessions"))).sort()).toEqual(["s1"]);
  });

  test("immediate management restore works for an allowed move and refuses once the original path is excluded", async () => {
    await writeDoc("drafts/page");
    const store = createDocsStore(docsRoot, { exclude: EXCLUDE });
    const hash = await docHash("drafts/page");
    const preview = await store.manageFiles({ kind: "page", path: "drafts/page", to: "notes/page", expected_hash: hash });
    expect(preview).toMatchObject({ ok: true, preview: true });
    const applied = await store.manageFiles({ kind: "page", path: "drafts/page", to: "notes/page", expected_hash: hash, preview: false, expected_tree_hash: (preview as any).tree_hash });
    expect(applied).toMatchObject({ ok: true, applied: true });
    const restorePreview = await store.restoreManagedFiles((applied as any).tree_change_id, true);
    expect(restorePreview).toMatchObject({ ok: true, preview: true });
    const frozen = await subtreeBytes("sessions/s1/outputs");

    // The project now excludes drafts/: restoring there would put the page on an excluded path.
    createDocsStore(docsRoot, { exclude: [...EXCLUDE, "drafts/**"] });
    const refused = await store.restoreManagedFiles((applied as any).tree_change_id, false, (restorePreview as any).tree_hash);
    expect(refused).toMatchObject({ ok: false, status: 403 });
    expect(await readdir(join(docsRoot, "notes/page"))).toEqual(["doc.json"]);

    createDocsStore(docsRoot, { exclude: EXCLUDE });
    const restored = await store.restoreManagedFiles((applied as any).tree_change_id, false, (restorePreview as any).tree_hash);
    expect(restored).toMatchObject({ ok: true, restored: true });
    expect(await readdir(join(docsRoot, "drafts/page"))).toEqual(["doc.json"]);
    expect(await subtreeBytes("sessions/s1/outputs")).toEqual(frozen);
  });
});
