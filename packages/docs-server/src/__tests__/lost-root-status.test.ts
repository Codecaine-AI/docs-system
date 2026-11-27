import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { docsFs, setDocsRootWriteCheck } from "@codecaine-ai/docs-index/safe-path";
import { applyDocOpsToBundle } from "../doc-ops";
import { manageFiles } from "../manage-files";
import { pageHash } from "./fixtures/page-hash";

// A root that is lost after a write passed the server's upfront check: each write path answers 503, not 400 or 500.
const page = (id: string) => JSON.stringify({ schemaVersion: 1, id, title: id, root: "root", blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p"] }, p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: "Before." }] } } });
const LOST = "The docs root is lost or changed.";
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "docs-lost-root-"));
  for (const name of ["guide", "other"]) { await mkdir(join(root, name), { recursive: true }); await writeFile(join(root, name, "doc.json"), page(name)); }
});
afterEach(async () => {
  setDocsRootWriteCheck(null);
  await rm(root, { recursive: true, force: true });
});

test("a page write to a root lost after its hash check answers 503 and writes nothing", async () => {
  const hash = await pageHash(root, "guide");
  setDocsRootWriteCheck(() => LOST);
  const result = await applyDocOpsToBundle(root, "guide", [{ type: "updateBlock", blockId: "p", text: [{ insert: "After." }] }], hash);
  expect(result).toMatchObject({ ok: false, status: 503 });
  expect(await readFile(join(root, "guide", "doc.json"), "utf8")).toBe(page("guide"));
});

test("a page move to a lost root is refused with 503 by its preflight, before any write", async () => {
  const expected_hash = await pageHash(root, "guide");
  const preview = await manageFiles(root, { kind: "page", path: "guide", to: "moved", expected_hash });
  expect(preview.ok).toBe(true);
  setDocsRootWriteCheck(() => LOST);
  expect(docsFs(root).preflight([{ path: "moved", intent: "mkdir" }])).toMatchObject({ ok: false, status: 503 });
  const moved = await manageFiles(root, { kind: "page", path: "guide", to: "moved", expected_hash, preview: false, expected_tree_hash: preview.tree_hash });
  expect(moved).toMatchObject({ ok: false, status: 503 });
  expect(await readFile(join(root, "guide", "doc.json"), "utf8")).toBe(page("guide"));
});
