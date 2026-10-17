import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocBundle, deleteDocBundle, moveDocTreeBundle } from "../changesets/tree-ops";
import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";

/**
 * B7-3-01 at the owner boundary: change-set create/move/delete, HTTP move and
 * bundle read, and corpus management move/rename/delete, each given a case or
 * Unicode spelling of the frozen inputs (`outputs/INPUTS`, `Outputs/Inputs`,
 * an NFD spelling of an NFC folder) on a default APFS volume, refuse before
 * any change. The frozen tree is byte- and entry-identical afterwards, and
 * the same owners still work on an allowed page.
 */

const FROZEN = "sessions/s1/outputs/inputs/p1";
const CAFE_NFC = "café";
const CAFE_NFD = "café";
const POLICY = JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**", `archive/${CAFE_NFC}/**`] });
const DOC = (id: string) => `${JSON.stringify({
  schemaVersion: 1,
  id,
  title: id,
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: `Body of ${id}.` }], children: [] },
  },
}, null, 2)}\n`;

let temp: string;
let kb: string;

async function write(rel: string, bytes: string) {
  await mkdir(join(kb, rel, ".."), { recursive: true });
  await writeFile(join(kb, rel), bytes);
}

async function treeBytes(rel: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(join(kb, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) out[path] = "link";
      else if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(kb, path))).digest("hex");
    }
  };
  await walk(rel);
  return out;
}

const frozenState = async () => ({ sessions: await treeBytes("sessions"), archive: await treeBytes("archive") });
const docHash = async (path: string) => createHash("sha256").update(await readFile(join(kb, path, "doc.json"))).digest("hex");

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-name-alias-owners-")));
  kb = join(temp, "kb");
  await write("codecaine.docs.json", POLICY);
  await write("sessions/s1/doc.json", DOC("s1"));
  await write(`${FROZEN}/doc.json`, DOC("frozen"));
  await write(`${FROZEN}/assets/canvases/c.canvas.json`, "{\"frozen\":true}\n");
  await write(`archive/${CAFE_NFC}/doc.json`, DOC("cafe"));
  await write("notes/real/doc.json", DOC("real"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function accept(store: DocsStore, treeOps: unknown[]) {
  const staged = await store.changesetStage({ summary: "tree", entries: [], treeOps: treeOps as any });
  if (!staged.ok) return staged;
  return store.changesetAccept(staged.changeset.id);
}

const move = (store: DocsStore, fromPath: string, toPath: string) =>
  createDocsRoutes(store).handle(new Request("http://localhost/api/move", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fromPath, toPath }),
  }));

describe("B7-3-01: owners refuse case and Unicode spellings of the frozen inputs", () => {
  test("change-set create, move and delete; tree ops called directly", async () => {
    const store = createDocsStore(kb);
    const before = await frozenState();
    for (const treeOps of [
      [{ kind: "delete-doc", docPath: "sessions/s1/outputs/INPUTS/p1", position: 0 }],
      [{ kind: "delete-doc", docPath: "Sessions/S1/Outputs/Inputs/p1", position: 0 }],
      [{ kind: "delete-doc", docPath: "Sessions/S1", position: 0 }],
      [{ kind: "delete-doc", docPath: `archive/${CAFE_NFD}`, position: 0 }],
      [{ kind: "move-doc", from: "sessions/s1/outputs/INPUTS/p1", to: "notes/stolen", position: 0 }],
      [{ kind: "move-doc", from: `archive/${CAFE_NFD}`, to: "notes/stolen", position: 0 }],
      [{ kind: "move-doc", from: "notes/real", to: "sessions/s1/OUTPUTS/inputs/p2", position: 0 }],
      [{ kind: "move-doc", from: "notes/real", to: "sessions/s2/outputs/INPUTS/real", position: 0 }],
      [{ kind: "create-doc", docPath: "sessions/s1/outputs/INPUTS/new", title: "New", position: 0 }],
      [{ kind: "create-doc", docPath: "Sessions/S5/Outputs/Inputs/new", title: "New", position: 0 }],
      [{ kind: "create-doc", docPath: `archive/${CAFE_NFD}/new`, title: "New", position: 0 }],
    ]) {
      expect({ treeOps, result: await accept(store, treeOps) }).toMatchObject({ treeOps, result: { ok: false, status: 403 } });
    }
    expect(await deleteDocBundle(kb, "sessions/s1/outputs/INPUTS/p1")).toMatchObject({ ok: false, status: 403 });
    expect(await moveDocTreeBundle(kb, "Sessions/S1/Outputs/Inputs/p1", "notes/moved")).toMatchObject({ ok: false, status: 403 });
    expect(await moveDocTreeBundle(kb, "notes/real", `archive/${CAFE_NFD}/real`)).toMatchObject({ ok: false, status: 403 });
    expect(await createDocBundle(kb, "sessions/s1/outputs/Inputs/created", "Created")).toMatchObject({ ok: false, status: 403 });
    expect(await frozenState()).toEqual(before);
    expect(await readdir(join(kb, "notes"))).toEqual(["real"]);
  });

  test("HTTP move and bundle read", async () => {
    const store = createDocsStore(kb);
    const before = await frozenState();
    // Each alias answers exactly what its stored spelling answers (an excluded source is no bundle: 400;
    // an excluded destination is no valid bundle path: 400; an allowed ancestor holding excluded inputs: 403),
    // and never moves anything.
    for (const [from, to, stored] of [
      ["sessions/s1/outputs/INPUTS/p1", "notes/stolen", ["sessions/s1/outputs/inputs/p1", "notes/stolen"]],
      ["Sessions/S1/Outputs/Inputs/p1", "notes/stolen", ["sessions/s1/outputs/inputs/p1", "notes/stolen"]],
      ["Sessions/S1", "notes/archive", ["sessions/s1", "notes/archive"]],
      [`archive/${CAFE_NFD}`, "notes/stolen", [`archive/${CAFE_NFC}`, "notes/stolen"]],
      ["notes/real", "sessions/s1/outputs/INPUTS/p2", ["notes/real", "sessions/s1/outputs/inputs/p2"]],
      ["notes/real", "SESSIONS/S9/OUTPUTS/INPUTS/real", ["notes/real", "sessions/s9/outputs/inputs/real"]],
    ] as const) {
      const control = (await move(store, stored[0], stored[1])).status;
      const status = (await move(store, from, to)).status;
      expect(control).toBeGreaterThanOrEqual(400);
      expect({ from, to, status }).toEqual({ from, to, status: control });
    }
    expect((await move(store, "Sessions/S1", "notes/archive")).status).toBe(403);
    const app = createDocsRoutes(store);
    for (const path of ["sessions/s1/outputs/INPUTS/p1", "Sessions/S1/Outputs/Inputs/p1", `archive/${CAFE_NFD}`]) {
      const response = await app.handle(new Request(`http://localhost/api/bundle?path=${encodeURIComponent(path)}`));
      expect({ path, ok: response.ok }).toEqual({ path, ok: false });
    }
    expect(await frozenState()).toEqual(before);
    expect(await readdir(join(kb, "notes"))).toEqual(["real"]);
  });

  test("corpus management move, rename and delete", async () => {
    const store = createDocsStore(kb);
    const before = await frozenState();
    const hash = await docHash(FROZEN);
    for (const input of [
      { kind: "page" as const, path: "sessions/s1/outputs/INPUTS/p1", to: "notes/stolen" },
      { kind: "page" as const, path: "Sessions/S1/Outputs/Inputs/p1", to: "sessions/s1/outputs/INPUTS/p1-renamed" },
      { kind: "page" as const, path: "sessions/s1/OUTPUTS/inputs/p1", recursive: true },
      { kind: "page" as const, path: `archive/${CAFE_NFD}`, recursive: true },
      { kind: "page" as const, path: "Sessions/S1", recursive: true },
      { kind: "page" as const, path: "notes/real", to: "sessions/s1/outputs/Inputs/real" },
    ]) {
      for (const preview of [true, false]) {
        const result = await store.manageFiles({ ...input, expected_hash: hash, preview, expected_tree_hash: "any" });
        expect({ input, preview, result }).toMatchObject({ input, preview, result: { ok: false, status: 403 } });
      }
    }
    expect(await frozenState()).toEqual(before);
    expect(await readdir(join(kb, "notes"))).toEqual(["real"]);
    expect(existsSync(join(kb, ".changesets"))).toBe(false);
  });

  test("positive controls: the same owners work on allowed pages", async () => {
    const store = createDocsStore(kb);
    const before = await frozenState();
    expect(await accept(store, [{ kind: "create-doc", docPath: "notes/created", title: "Created", position: 0 }])).toMatchObject({ ok: true });
    expect((await move(store, "notes/created", "notes/moved")).status).toBe(200);
    const hash = await docHash("notes/moved");
    const preview = await store.manageFiles({ kind: "page", path: "notes/moved", to: "notes/renamed", expected_hash: hash, preview: true });
    expect(preview).toMatchObject({ ok: true });
    const applied = await store.manageFiles({
      kind: "page",
      path: "notes/moved",
      to: "notes/renamed",
      expected_hash: hash,
      preview: false,
      expected_tree_hash: (preview as { tree_hash: string }).tree_hash,
    });
    expect(applied).toMatchObject({ ok: true, applied: true });
    expect(await accept(store, [{ kind: "delete-doc", docPath: "notes/renamed", position: 0 }])).toMatchObject({ ok: true });
    expect(await readdir(join(kb, "notes"))).toEqual(["real"]);
    expect(await frozenState()).toEqual(before);
  });
});
