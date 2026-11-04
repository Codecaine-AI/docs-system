import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { manageFiles, type ManageFilesInput } from "../manage-files";
import { manageFiles as manageFilesLegacy } from "./fixtures/manage-files.legacy";

/** Golden test: the tree operations rewrite every reference form byte for byte as the code before managed-refs.ts did. */

const page = (id: string, blocks: Record<string, Record<string, unknown>>) => ({
  schemaVersion: 1, id, title: id, root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) },
    ...Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { id, children: [], props: {}, ...block }])),
  },
});
const docRef = (path: string) => ({ insert: path, attributes: { reference: { kind: "doc", path } } });
const link = (href: string) => ({ insert: href, attributes: { link: href } });

/** Every reference form, read relative to its file and from the root, with suffixes and skipped schemes. */
const CORPUS: Record<string, unknown> = {
  "guide/doc.json": page("guide", {
    img: { type: "image", props: { src: "assets/images/a.png", alt: "a" } },
    vid: { type: "video", props: { src: "/guide/assets/media/v.mp4", poster: "./guide/assets/images/p.png?v=2" } },
    grid: { type: "image-grid", props: { images: [{ src: "assets/images/a.png#crop" }, { src: "https://example.com/x.png" }] } },
    para: { type: "paragraph", text: [docRef("reader"), link("assets/files/f.pdf?dl=1"), link("#top"), link("//cdn/x.png")] },
    table: { type: "structured-table", props: { columns: ["File"], rows: [[[link("guide/assets/files/f.pdf")]], ["plain"]] } },
    board: { type: "canvas", props: { src: "assets/canvases/c.canvas.json" } },
  }),
  "guide/annotations.json": { annotations: [{ id: "a1", target: { canvasSrc: "assets/canvases/c.canvas.json" } }] },
  "guide/assets/canvases/c.canvas.json": {
    objects: [{ id: "o1", src: "guide/assets/images/a.png", nested: { url: "../images/a.png", href: "mailto:x@y.z" } }],
    links: [{ id: "l1", objectId: "o1", target: { kind: "doc", path: "reader/doc.json" } }],
  },
  "guide/assets/sequences/s.sequence.json": { meta: { imageUrl: "guide/assets/images/p.png", href: "guide/assets/files/f.pdf" } },
  "guide/assets/images/a.png": "image a",
  "guide/assets/images/p.png": "image p",
  "guide/assets/media/v.mp4": "video",
  "guide/assets/files/f.pdf": "pdf",
  "guide/child/doc.json": page("child", {
    up: { type: "paragraph", text: [docRef("docs/guide"), link("../assets/files/f.pdf")] },
    img: { type: "image", props: { src: "guide/assets/images/a.png" } },
  }),
  "reader/doc.json": page("reader", {
    refs: { type: "paragraph", text: [docRef("guide"), docRef("guide/child/doc.json"), link("guide/assets/files/f.pdf")] },
    img: { type: "image", props: { src: "../guide/assets/images/a.png" } },
    board: { type: "canvas", props: { src: "/guide/assets/canvases/c.canvas.json" } },
  }),
  "reader/annotations.json": { annotations: [{ id: "r1", target: { canvasSrc: "guide/assets/canvases/c.canvas.json" } }] },
  "reader/assets/canvases/r.canvas.json": { objects: [{ id: "r", imageUrl: "guide/assets/images/a.png" }] },
  // A doc.json under assets is an attachment: never rewritten.
  "reader/assets/files/doc.json": page("attachment", {
    refs: { type: "paragraph", text: [docRef("guide")] },
    img: { type: "image", props: { src: "guide/assets/images/a.png" } },
  }),
};

async function corpus(extra: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "managed-refs-golden-")));
  for (const [path, value] of Object.entries({ ...CORPUS, ...extra })) {
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), typeof value === "string" ? value : JSON.stringify(value, null, 1));
  }
  return root;
}

/** Every corpus file's bytes, without the service-owned journal and index. */
async function tree(root: string, dir = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (!dir && [".changesets", ".index"].includes(entry.name)) continue;
    if (entry.isDirectory()) Object.assign(out, await tree(root, path));
    else out[path] = (await readFile(join(root, path))).toString("hex");
  }
  return out;
}

type Run = { preview: Record<string, any>; applied?: Record<string, any>; files: Record<string, string> };
async function run(manage: typeof manageFiles, input: Omit<ManageFilesInput, "expected_hash">, extra?: Record<string, unknown>): Promise<Run> {
  const root = await corpus(extra);
  try {
    const source = input.kind === "asset" ? input.path : `${input.path}/doc.json`;
    const expected_hash = createHash("sha256").update(await readFile(join(root, source))).digest("hex");
    const preview = await manage(root, { ...input, expected_hash });
    let applied: Record<string, any> | undefined;
    if (preview.ok) {
      const { tree_change_id: _id, recovery_journal: _journal, ...rest } =
        await manage(root, { ...input, expected_hash, preview: false, expected_tree_hash: preview.tree_hash });
      applied = rest;
    }
    return { preview, applied, files: await tree(root) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Each operation, and what it must end in: applied (true) or the refusal it gives. */
const OPERATIONS: Array<[string, Omit<ManageFilesInput, "expected_hash">, true | string, Record<string, unknown>?]> = [
  ["move", { kind: "page", path: "guide", to: "moved/guide" }, true],
  ["rename", { kind: "page", path: "guide", to: "handbook" }, true],
  ["title", { kind: "title", path: "guide", title: "The guide" }, true],
  ["asset move", { kind: "asset", path: "guide/assets/images/a.png", to: "reader/assets/images/a.png" }, true],
  ["canvas asset move", { kind: "asset", path: "guide/assets/canvases/c.canvas.json", to: "reader/assets/canvases/c.canvas.json" }, true],
  ["delete with inbound references", { kind: "page", path: "guide", recursive: true },
    "Other pages still reference the page or its assets. Relocate assets or repair links first."],
  // guide/doc.json's "assets/images/a.png" reads as guide/assets/images/a.png and as this root-level file.
  ["ambiguous asset path", { kind: "page", path: "guide", to: "moved/guide" },
    "Ambiguous asset path in guide/doc.json: assets/images/a.png", { "assets/images/a.png": "root image" }],
];

for (const [name, input, outcome, extra] of OPERATIONS) {
  test(`${name} gives the same result and bytes as the code before managed-refs`, async () => {
    const legacy = await run(manageFilesLegacy, input, extra);
    const current = await run(manageFiles, input, extra);
    expect(current.applied?.ok ?? current.preview.detail).toBe(outcome);
    expect(current).toEqual(legacy);
  });
}

test("the move rewrites every reference form in the fixture", async () => {
  const { preview, files } = await run(manageFiles, { kind: "page", path: "guide", to: "moved/guide" });
  expect(preview.rewritten_sources.sort()).toEqual([
    "moved/guide/annotations.json",
    "moved/guide/assets/canvases/c.canvas.json",
    "moved/guide/assets/sequences/s.sequence.json",
    "moved/guide/child/doc.json",
    "moved/guide/doc.json",
    "reader/annotations.json",
    "reader/assets/canvases/r.canvas.json",
    "reader/doc.json",
  ]);
  expect(Buffer.from(files["reader/assets/files/doc.json"], "hex").toString()).toContain('"path": "guide"');
  expect(Buffer.from(files["reader/assets/files/doc.json"], "hex").toString()).toContain('"src": "guide/assets/images/a.png"');
});
