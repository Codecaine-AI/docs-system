import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { applyDocOpsToBundle } from "../doc-ops";
import { manageFiles, restoreManagedFiles } from "../manage-files";
import { referenceCache } from "../reference-cache";

/**
 * An edit through applyDocOpsToBundle takes only its own page's lock, so a page outside an operation's read set can
 * gain a reference to the moving pages while the operation applies. The edit is injected at the reference cache's
 * lookup, the one seam every scan shares: before the scan inside the locks, or after it and before the change.
 */

const CHANGED = "Corpus changed or preview missing. Preview this operation again.";
const APPEARED = "A reference to the moved pages appeared during the apply. Preview this operation again.";
let root: string;

const page = (id: string, blocks: Record<string, Record<string, unknown>> = {}) => JSON.stringify({
  schemaVersion: 1, id, title: id, root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) },
    ...Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { id, children: [], props: {}, ...block }])),
  },
});
const write = async (path: string, body: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), body);
};
const sha = async (path: string) => createHash("sha256").update(await readFile(join(root, path))).digest("hex");
/** Every corpus file's bytes, without the service-owned journal and index. */
async function tree(dir = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (!dir && [".changesets", ".index"].includes(entry.name)) continue;
    if (entry.isDirectory()) Object.assign(out, await tree(path));
    else out[path] = await readFile(join(root, path), "utf8");
  }
  return out;
}
/** The other client's edit: "late" gains a doc-form reference to `target`, through the normal doc-ops path. */
const linkLate = async (target: string) => {
  const saved = await applyDocOpsToBundle(root, "late", [{ type: "updateBlock", blockId: "p", text: [{ insert: "link", attributes: { reference: { kind: "doc", path: target } } }] }], undefined);
  expect(saved.ok).toBe(true);
};
/** Run `edit` on the `call`th lookup from now: before its walk, or after it returns. */
function injectAt(call: number, when: "before" | "after", edit: () => Promise<void>) {
  const cache = referenceCache(root), real = cache.lookup;
  let n = 0;
  cache.lookup = async () => {
    n++;
    if (n === call && when === "before") await edit();
    const result = await real();
    if (n === call && when === "after") await edit();
    return result;
  };
  return () => { cache.lookup = real; };
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "manage-files-late-referrer-")));
  await write("page/doc.json", page("page", { img: { type: "image", props: { src: "./assets/images/a.png" } } }));
  await write("page/assets/images/a.png", "a");
  await write("page/child/doc.json", page("child"));
  await write("late/doc.json", page("late", { p: { type: "paragraph", text: [{ insert: "nothing yet" }] } }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function applyMove(inject: (stop: () => void) => () => void) {
  const args = { kind: "page" as const, path: "page", to: "moved", expected_hash: await sha("page/doc.json") };
  const preview = await manageFiles(root, args);
  expect(preview.ok).toBe(true);
  // Lookups of the apply: 1 before the locks, 2 inside them, 3 after the change.
  const restore = inject(() => {});
  try { return await manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash }); } finally { restore(); }
}

test("a referrer that appears before the scan inside the locks refuses the move by name", async () => {
  const before = await tree();
  const result = await applyMove(() => injectAt(2, "before", () => linkLate("page")));
  expect(result).toEqual({ ok: false, status: 409, detail: CHANGED, changed_paths: ["late/doc.json"] });
  expect(await tree()).toEqual({ ...before, "late/doc.json": (await tree())["late/doc.json"] });
});

test("a referrer that appears after the scan inside the locks rolls the move back byte for byte and refuses by name", async () => {
  const before = await tree();
  const result = await applyMove(() => injectAt(2, "after", () => linkLate("page")));
  expect(result).toMatchObject({ ok: false, status: 409, detail: APPEARED, changed_paths: ["late/doc.json"], rolled_back: true });
  const after = await tree();
  expect(JSON.parse(after["late/doc.json"]).blocks.p.text[0].attributes.reference.path).toBe("page");
  expect(after).toEqual({ ...before, "late/doc.json": after["late/doc.json"] });
  const manifest = JSON.parse(await readFile(join(root, result.recovery_journal, "manifest.json"), "utf8"));
  expect(manifest.status).toBe("rolled-back");
});

test("a referrer that appears after the restore's scan inside the locks rolls the restore back byte for byte", async () => {
  const args = { kind: "page" as const, path: "page", to: "moved", expected_hash: await sha("page/doc.json") };
  const preview = await manageFiles(root, args);
  const moved = await manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash });
  expect(moved.ok).toBe(true);
  const before = await tree();
  const restorePreview = await restoreManagedFiles(root, moved.tree_change_id);
  expect(restorePreview.ok).toBe(true);
  // Lookups of the restore apply: 1 before the locks, 2 inside them, 3 after the change.
  const stop = injectAt(2, "after", () => linkLate("moved"));
  let result;
  try { result = await restoreManagedFiles(root, moved.tree_change_id, false, restorePreview.tree_hash); } finally { stop(); }
  expect(result).toMatchObject({ ok: false, status: 409, detail: APPEARED, changed_paths: ["late/doc.json"], rolled_back: true });
  const after = await tree();
  expect(JSON.parse(after["late/doc.json"]).blocks.p.text[0].attributes.reference.path).toBe("moved");
  expect(after).toEqual({ ...before, "late/doc.json": after["late/doc.json"] });
  const manifest = JSON.parse(await readFile(join(root, moved.recovery_journal, "manifest.json"), "utf8"));
  expect(manifest.status).toBe("applied");
});
