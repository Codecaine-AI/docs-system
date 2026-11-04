import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setDocsRootExclude } from "@codecaine-ai/docs-index/paths";
import { extractManagedRefs, holdsManagedRefs, resolveAssetTarget, type AssetRef, type ManagedRef } from "../managed-refs";
import { referenceCache } from "../reference-cache";

let root: string;
const write = async (path: string, value: unknown) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
};
const page = (blocks: Record<string, Record<string, unknown>>) => ({ schemaVersion: 1, id: "p", title: "p", root: "root", blocks });
const link = (href: string) => ({ insert: href, attributes: { link: href } });
/** The parts of a ref a caller reads, without the holder object. */
const shape = (refs: ManagedRef[] | undefined) => refs?.map(({ holder, ...ref }) => ({ ...ref, value: holder[ref.key] }));
const nothingMoving = () => false;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "reference-cache-")));
  await write("guide/doc.json", page({
    img: { type: "image", props: { src: "assets/images/a.png", poster: "/guide/assets/images/p.png?v=1" } },
    grid: { type: "image-grid", props: { images: [{ src: "assets/images/a.png#c" }] } },
    para: { type: "paragraph", text: [{ insert: "r", attributes: { reference: { kind: "doc", path: "docs/reader/doc.json" } } }, link("assets/files/f.pdf"), link("https://x.y")] },
    table: { type: "structured-table", props: { rows: [[[link("guide/assets/files/f.pdf")]]] } },
  }));
  await write("guide/annotations.json", { annotations: [{ target: { canvasSrc: "assets/canvases/c.canvas.json" } }] });
  await write("guide/assets/canvases/c.canvas.json", { objects: [{ src: "a", nested: { url: "b", href: "c", imageUrl: "d" } }] });
  await write("guide/assets/sequences/s.sequence.json", { meta: { href: "guide/assets/files/f.pdf" } });
  await write("guide/assets/images/a.png", "a");
  await write("reader/doc.json", page({}));
  await write("reader/assets/files/doc.json", { kind: "doc", path: "guide", src: "x" });
});

afterEach(async () => {
  setDocsRootExclude(root, undefined);
  await rm(root, { recursive: true, force: true });
});

test("a lookup finds every reference form", async () => {
  const { refs } = await referenceCache(root).lookup();
  const forms = (file: string) => shape(refs.get(file))!.map((ref) => `${ref.form}:${ref.key}=${ref.value}`);
  expect(forms("guide/doc.json")).toEqual([
    "doc:path=docs/reader/doc.json",
    "asset:src=assets/images/a.png",
    "asset:poster=/guide/assets/images/p.png?v=1",
    "asset:src=assets/images/a.png#c",
    "asset:link=assets/files/f.pdf",
    "asset:link=guide/assets/files/f.pdf",
  ]);
  expect(forms("guide/annotations.json")).toEqual(["asset:canvasSrc=assets/canvases/c.canvas.json"]);
  expect(forms("guide/assets/canvases/c.canvas.json")).toEqual(["asset:src=a", "asset:url=b", "asset:href=c", "asset:imageUrl=d"]);
  expect(forms("guide/assets/sequences/s.sequence.json")).toEqual(["asset:href=guide/assets/files/f.pdf"]);
  const [doc, src, poster] = refs.get("guide/doc.json")!;
  expect(doc).toMatchObject({ form: "doc", target: "reader" });
  expect(src).toMatchObject({ rel: "guide/assets/images/a.png", rooted: "assets/images/a.png", suffix: "" });
  expect(poster).toMatchObject({ rooted: "guide/assets/images/p.png", suffix: "?v=1" });
});

test("a cached lookup equals a full parse of every reference file", async () => {
  const cache = referenceCache(root);
  await cache.lookup();
  await write("reader/doc.json", page({ img: { type: "image", props: { src: "../guide/assets/images/a.png" } } }));
  await rm(join(root, "guide/assets/sequences"), { recursive: true });
  const { files, refs } = await cache.lookup();
  const fresh = [...files].filter(holdsManagedRefs).map(async (file) =>
    [file, shape(extractManagedRefs(file, JSON.parse(await readFile(join(root, file), "utf8")), root))] as const);
  expect(new Map([...refs].map(([file, list]) => [file, shape(list)]))).toEqual(new Map(await Promise.all(fresh)));
  expect(refs.has("guide/assets/sequences/s.sequence.json")).toBe(false);
});

test("a same-size rewrite with a newer mtime is parsed again", async () => {
  const cache = referenceCache(root);
  await cache.lookup();
  const file = join(root, "guide/assets/sequences/s.sequence.json"), before = await stat(file);
  await writeFile(file, JSON.stringify({ meta: { href: "guide/assets/files/g.pdf" } }));
  await utimes(file, before.atime, new Date(before.mtimeMs + 5000));
  expect((await stat(file)).size).toBe(before.size);
  const { refs } = await cache.lookup();
  expect(shape(refs.get("guide/assets/sequences/s.sequence.json"))![0].value).toBe("guide/assets/files/g.pdf");
});

test("an asset added between lookups changes the resolved target while the holder stays cached", async () => {
  const cache = referenceCache(root);
  const first = await cache.lookup();
  const poster = first.refs.get("guide/doc.json")![2] as AssetRef;
  expect(resolveAssetTarget(poster, (p) => first.files.has(p), nothingMoving)).toBeUndefined();
  await write("guide/assets/images/p.png", "p");
  const second = await cache.lookup();
  expect(second.refs.get("guide/doc.json")).toBe(first.refs.get("guide/doc.json")!);
  expect(resolveAssetTarget(poster, (p) => second.files.has(p), nothingMoving)).toEqual({ target: "guide/assets/images/p.png", relative: false });
});

test("a symbolic link in the corpus is refused", async () => {
  await symlink(join(root, "reader"), join(root, "guide/linked"));
  await expect(referenceCache(root).lookup()).rejects.toThrow("Symbolic links are unsupported for corpus management: guide/linked");
});

test("malformed reference JSON fails with status 422", async () => {
  await write("reader/annotations.json", "{");
  const error = await referenceCache(root).lookup().catch((e) => e);
  expect(error).toMatchObject({ message: "Malformed JSON: reader/annotations.json", status: 422 });
});

test("an excluded path is never listed or parsed", async () => {
  await write("frozen/doc.json", "{ not json");
  setDocsRootExclude(root, ["frozen/**"]);
  const { files, refs } = await referenceCache(root).lookup();
  expect(files.has("frozen/doc.json")).toBe(false);
  expect(refs.has("guide/doc.json")).toBe(true);
});

test("the service folders at the root are skipped", async () => {
  for (const dir of [".index", ".changesets", ".git"]) await write(`${dir}/x/doc.json`, "{ not json");
  const { files } = await referenceCache(root).lookup();
  expect([...files].filter((file) => file.startsWith("."))).toEqual([]);
});

test("a doc.json under assets is a file, not a page", async () => {
  const { files, refs } = await referenceCache(root).lookup();
  expect(files.has("reader/assets/files/doc.json")).toBe(true);
  expect(refs.has("reader/assets/files/doc.json")).toBe(false);
});

test("one cache serves every spelling of a root", async () => {
  expect(referenceCache(`${root}/guide/..`)).toBe(referenceCache(root));
});
