import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { createDocsTools, type DocsTool } from "../tools";

/** docs_management_restore through the MCP tool: what it puts back, and every later change that refuses it. */

let root: string;
let tools: DocsTool[];
async function call(name: string, args: Record<string, unknown>) {
  const tool = tools.find((entry) => entry.name === name)!;
  return (await tool.execute({ project: "a", ...args })).structuredContent as Record<string, any>;
}
/** Preview, then apply with the preview's tree_hash. */
async function manage(name: string, args: Record<string, unknown>) {
  const preview = await call(name, args);
  if (!preview.ok) return preview;
  return call(name, { ...args, preview: false, expected_tree_hash: preview.tree_hash });
}
const hashOf = async (path: string) => (await call("docs_read", { path })).hash;

/** A page in its canonical bytes, so docs_read's hash is the file's own. */
const page = (id: string, blocks: Record<string, Record<string, unknown>> = {}) => serializeDocDocument({
  schemaVersion: 1, id, title: id, root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) },
    ...Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { id, children: [], props: {}, ...block }])),
  },
} as DocDocument);
const docLink = (path: string) => ({ type: "paragraph", text: [{ insert: path, attributes: { reference: { kind: "doc", path } } }] });
const image = (src: string) => ({ type: "image", props: { src, alt: "x" } });
const write = async (path: string, body: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), body);
};
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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "docs-mcp-restore-"));
  // A page with its own asset and a child page, and a page that links to both from outside.
  await write("page/doc.json", page("page", { img: image("./assets/images/x.png") }));
  await write("page/assets/images/x.png", "image");
  await write("page/child/doc.json", page("child", { img: image("../assets/images/x.png"), up: docLink("page") }));
  await write("overview/doc.json", page("overview", { to: docLink("page/child"), img: image("../page/assets/images/x.png") }));
  tools = createDocsTools({ resolveProject: async () => ({ id: "a", docsRoot: root }) });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function movePage() {
  const moved = await manage("docs_move", { path: "page", to: "section/moved", expected_hash: await hashOf("page") });
  expect(moved).toMatchObject({ ok: true, applied: true });
  expect(moved.rewritten_sources).toContain("overview/doc.json");
  return moved.tree_change_id as string;
}

test("restoring a moved page with its own assets and child pages puts every byte back", async () => {
  const before = await tree();
  const restored = await manage("docs_management_restore", { tree_change_id: await movePage() });
  expect(restored).toMatchObject({ ok: true, restored: true, path: "page" });
  expect(await tree()).toEqual(before);
});

test("restoring a title change succeeds while other pages still link to the page", async () => {
  const before = await tree();
  const titled = await manage("docs_set_title", { path: "page/child", title: "New title", expected_hash: await hashOf("page/child") });
  expect(titled).toMatchObject({ ok: true, applied: true });
  expect(await manage("docs_management_restore", { tree_change_id: titled.tree_change_id })).toMatchObject({ ok: true, restored: true });
  expect(await tree()).toEqual(before);
});

test("restoring a title change succeeds on a page that holds a child page and an asset", async () => {
  const before = await tree();
  const titled = await manage("docs_set_title", { path: "page", title: "New title", expected_hash: await hashOf("page") });
  expect(titled).toMatchObject({ ok: true, applied: true });
  expect(await manage("docs_management_restore", { tree_change_id: titled.tree_change_id })).toMatchObject({ ok: true, restored: true });
  expect(await tree()).toEqual(before);
});

test("a later edit to a file the move rewrote refuses the restore", async () => {
  const id = await movePage();
  await write("overview/doc.json", page("overview", { to: docLink("section/moved/child") }));
  expect(await call("docs_management_restore", { tree_change_id: id })).toMatchObject({ ok: false, detail: "Cannot restore after subsequent edits: overview/doc.json" });
});

test("a file added under the moved page refuses the restore", async () => {
  const id = await movePage();
  await write("section/moved/assets/images/later.png", "later");
  expect(await call("docs_management_restore", { tree_change_id: id })).toMatchObject({ ok: false, detail: "Cannot restore after files were added: section/moved/assets/images/later.png" });
});

test("a new page that embeds the moved page's asset refuses the restore", async () => {
  const id = await movePage();
  await write("late/doc.json", page("late", { img: image("../section/moved/assets/images/x.png") }));
  expect(await call("docs_management_restore", { tree_change_id: id })).toMatchObject({ ok: false, referrers: ["late/doc.json"] });
});

test("a new page that links to a child page of the moved folder refuses the restore", async () => {
  const id = await movePage();
  await write("late/doc.json", page("late", { to: docLink("section/moved/child") }));
  expect(await call("docs_management_restore", { tree_change_id: id })).toMatchObject({ ok: false, referrers: ["late/doc.json"] });
});

test("a referrer added between the restore preview and its apply refuses the apply", async () => {
  const id = await movePage();
  const preview = await call("docs_management_restore", { tree_change_id: id });
  expect(preview.ok).toBe(true);
  await write("late/doc.json", page("late", { to: docLink("section/moved") }));
  expect(await call("docs_management_restore", { tree_change_id: id, preview: false, expected_tree_hash: preview.tree_hash }))
    .toMatchObject({ ok: false, referrers: ["late/doc.json"] });
  expect(await readFile(join(root, "section/moved/doc.json"), "utf8")).toBe(page("page", { img: image("./assets/images/x.png") }));
});
