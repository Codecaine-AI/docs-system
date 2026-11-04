import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { manageFiles, type ManageFilesInput } from "../manage-files";
import { withPathLock } from "../path-mutex";

/** A tree operation's preview guards its read set only: a write anywhere else lands in the gap and the apply goes on. */

const CHANGED = "Corpus changed or preview missing. Preview this operation again.";
const INBOUND = "Other pages still reference the page or its assets. Relocate assets or repair links first.";
let root: string;

const page = (id: string, blocks: Record<string, Record<string, unknown>> = {}) => JSON.stringify({
  schemaVersion: 1, id, title: id, root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) },
    ...Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { id, children: [], props: {}, ...block }])),
  },
});
const docLink = (path: string) => ({ type: "paragraph", text: [{ insert: path, attributes: { reference: { kind: "doc", path } } }] });
const image = (src: string) => ({ type: "image", props: { src } });
const write = async (path: string, body: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), body);
};
const sha = async (path: string) => createHash("sha256").update(await readFile(join(root, path))).digest("hex");

/** Preview, run `gap` (the writes another client makes while the operation is reviewed), then apply. */
async function operate(input: Omit<ManageFilesInput, "expected_hash">, gap: () => Promise<void>) {
  const source = input.kind === "asset" ? input.path : `${input.path}/doc.json`;
  const args = { ...input, expected_hash: await sha(source) };
  const preview = await manageFiles(root, args);
  expect(preview.ok).toBe(true);
  await gap();
  return manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash });
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "manage-files-read-set-")));
  await write("page/doc.json", page("page", { img: image("./assets/images/a.png") }));
  await write("page/assets/images/a.png", "a");
  await write("page/assets/files/f.pdf", "f");
  await write("page/child/doc.json", page("child", { up: docLink("page") }));
  await write("other/doc.json", page("other"));
  await write("other/assets/images/big.bin", "unrelated asset");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

/** A page outside the read set, written and created during the gap. */
const unrelatedWrites = async () => {
  await write("other/doc.json", page("other", { note: { type: "paragraph", text: [{ insert: "edited" }] } }));
  await write("other/assets/images/big.bin", "rewritten");
  await write("fresh/doc.json", page("fresh"));
};
const withReferrer = () => write("overview/doc.json", page("overview", { to: docLink("page/child"), img: image("../page/assets/images/a.png") }));
const editReferrer = () => write("overview/doc.json", page("overview", { to: docLink("page/child"), img: image("../page/assets/images/a.png"), more: { type: "paragraph", text: [{ insert: "x" }] } }));

const RELOCATIONS: Array<[string, Omit<ManageFilesInput, "expected_hash">, string]> = [
  ["move", { kind: "page", path: "page", to: "section/moved" }, "late/doc.json"],
  ["rename", { kind: "page", path: "page", to: "renamed" }, "late/doc.json"],
  ["asset move", { kind: "asset", path: "page/assets/images/a.png", to: "other/assets/images/a.png" }, "late/doc.json"],
];
const NEW_REFERRER: Record<string, string> = {
  move: page("late", { to: docLink("page") }),
  rename: page("late", { to: docLink("page/child") }),
  "asset move": page("late", { img: image("page/assets/images/a.png") }),
};

for (const [name, input, late] of RELOCATIONS) {
  test(`${name}: a write outside the read set during the gap applies`, async () => {
    await withReferrer();
    const applied = await operate(input, unrelatedWrites);
    expect(applied).toMatchObject({ ok: true, applied: true });
    expect(applied.rewritten_sources).toContain("overview/doc.json");
  });
  test(`${name}: an edit to a referrer during the gap refuses and names it`, async () => {
    await withReferrer();
    expect(await operate(input, editReferrer)).toEqual({ ok: false, status: 409, detail: CHANGED, changed_paths: ["overview/doc.json"] });
  });
  test(`${name}: a new referrer during the gap refuses and names it`, async () => {
    await withReferrer();
    expect(await operate(input, () => write(late, NEW_REFERRER[name]))).toEqual({ ok: false, status: 409, detail: CHANGED, changed_paths: [late] });
  });
}

test("delete: a write outside the read set during the gap applies", async () => {
  expect(await operate({ kind: "page", path: "page", recursive: true }, unrelatedWrites)).toMatchObject({ ok: true, applied: true });
});
test("delete: an edit under the deleted page during the gap refuses and names it", async () => {
  const applied = await operate({ kind: "page", path: "page", recursive: true }, () => write("page/child/doc.json", page("child")));
  expect(applied).toEqual({ ok: false, status: 409, detail: CHANGED, changed_paths: ["page/child/doc.json"] });
});
test("delete: a new referrer during the gap refuses as an inbound reference", async () => {
  const applied = await operate({ kind: "page", path: "page", recursive: true }, () => write("late/doc.json", page("late", { to: docLink("page/child") })));
  expect(applied).toMatchObject({ ok: false, status: 409, detail: INBOUND, inbound: ["late/doc.json"] });
});

test("asset delete: a write outside the read set during the gap applies", async () => {
  expect(await operate({ kind: "asset", path: "page/assets/files/f.pdf" }, unrelatedWrites)).toMatchObject({ ok: true, applied: true });
});
test("asset delete: a new referrer during the gap refuses as an inbound reference", async () => {
  const applied = await operate({ kind: "asset", path: "page/assets/files/f.pdf" }, () =>
    write("late/doc.json", page("late", { file: { type: "paragraph", text: [{ insert: "f", attributes: { link: "../page/assets/files/f.pdf" } }] } })));
  expect(applied).toMatchObject({ ok: false, status: 409, detail: INBOUND, inbound: ["late/doc.json"] });
});

test("title: writes to other pages, even ones that link to it, apply", async () => {
  await withReferrer();
  const applied = await operate({ kind: "title", path: "page", title: "Renamed title" }, async () => { await unrelatedWrites(); await editReferrer(); });
  expect(applied).toMatchObject({ ok: true, applied: true, rewritten_sources: ["page/doc.json"] });
  expect(JSON.parse(await readFile(join(root, "page/doc.json"), "utf8")).title).toBe("Renamed title");
});
test("title: its read set is the page itself, so an edit to it refuses as a changed source", async () => {
  const applied = await operate({ kind: "title", path: "page", title: "Renamed title" }, () => write("page/doc.json", page("page")));
  expect(applied).toMatchObject({ ok: false, status: 409, detail: "Source changed. Read again." });
});

test("a referrer edited while the apply waits for its lock refuses with the plan built inside the locks", async () => {
  await withReferrer();
  const args = { kind: "page" as const, path: "page", to: "section/moved", expected_hash: await sha("page/doc.json") };
  const preview = await manageFiles(root, args);
  let applying!: Promise<Record<string, any>>;
  // Hold the referrer's lock the way a normal edit does, start the apply behind it, and change the referrer.
  await withPathLock(join(root, "overview/doc.json"), async () => {
    applying = manageFiles(root, { ...args, preview: false, expected_tree_hash: preview.tree_hash });
    await Bun.sleep(50);
    await editReferrer();
  });
  expect(await applying).toEqual({ ok: false, status: 409, detail: CHANGED, changed_paths: ["overview/doc.json"] });
  expect(await readFile(join(root, "page/doc.json"), "utf8")).toBe(page("page", { img: image("./assets/images/a.png") }));
});
