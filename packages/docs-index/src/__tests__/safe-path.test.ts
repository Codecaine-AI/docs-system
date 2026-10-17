import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isExcludedOnDiskUnderDocsRoot, resolveDocBundleJsonPath } from "../paths";
import { checkDocsPath, docsFs, isDocsPathRefusal, preflightDocsPaths, type DocsPathIntent } from "../safe-path";

/**
 * The docs-root chokepoint (safe-path.ts): one canonical rule for every
 * filesystem target. Covers a symbolic-link alias inside the served root
 * into an excluded folder, a served SUBFOLDER whose alias leads into an
 * excluded sibling of the enclosing project (B7-2-02), a link that leaves the
 * root, writes through a final link, dangling links, subtree checks for
 * recursive removal and directory renames, a malformed policy, and positive
 * controls. Frozen bytes stay identical throughout.
 */

const FROZEN = "sessions/s1/outputs/inputs/p1";
let temp: string;
let kb: string;

async function write(rel: string, bytes: string) {
  await mkdir(join(kb, rel, ".."), { recursive: true });
  await writeFile(join(kb, rel), bytes);
}

async function frozenBytes(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(join(kb, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(kb, path))).digest("hex");
    }
  };
  await walk("sessions");
  return out;
}

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-safe-path-")));
  kb = join(temp, "kb");
  await write("codecaine.docs.json", JSON.stringify({ docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
  await write(`${FROZEN}/doc.json`, "{}\n");
  await write(`${FROZEN}/assets/canvases/c.canvas.json`, "{\"frozen\":true}\n");
  await write(`${FROZEN}/assets/images/existing.png`, "png");
  await write("notes/twin/doc.json", "{}\n");
  await write("notes/real/doc.json", "{}\n");
  await write("notes/real/assets/images/r.png", "png");
  // An alias inside the corpus whose assets folder is the frozen assets folder.
  await symlink(join(kb, FROZEN, "assets"), join(kb, "notes/twin/assets"), "dir");
  // A link inside the corpus to an allowed folder (positive control).
  await symlink(join(kb, "notes/real/assets"), join(kb, "notes/link-to-real"), "dir");
  // A link that leaves the docs root.
  await mkdir(join(temp, "outside"), { recursive: true });
  await writeFile(join(temp, "outside/o.txt"), "outside");
  await symlink(join(temp, "outside"), join(kb, "notes/out"), "dir");
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const INTENTS: DocsPathIntent[] = ["read", "inspect", "write", "mkdir", "remove", "rename-from", "rename-to"];

describe("checkDocsPath", () => {
  test("an alias inside the served root into an excluded folder is refused for every intent, existing or missing", () => {
    for (const intent of INTENTS) {
      for (const path of ["notes/twin/assets/canvases/c.canvas.json", "notes/twin/assets/canvases/new.canvas.json", "notes/twin/assets/images/added.png"]) {
        const checked = checkDocsPath(kb, path, intent);
        expect(checked).toMatchObject({ ok: false, status: 403, reason: "excluded" });
      }
    }
    expect(isExcludedOnDiskUnderDocsRoot(kb, "notes/twin/assets/images/added.png")).toBe(true);
  });

  test("B7-2-02: a served subfolder refuses an alias into an excluded sibling of the enclosing project", () => {
    const notes = join(kb, "notes");
    for (const intent of INTENTS) {
      for (const path of ["twin/assets/images/existing.png", "twin/assets/images/added.png", "twin/assets/canvases/c.canvas.json"]) {
        const checked = checkDocsPath(notes, path, intent);
        expect(checked.ok).toBe(false);
        expect((checked as { status: number }).status).toBe(403);
      }
    }
    // The resolver the reviewer exercised now refuses, and so does the bundle resolver.
    expect(isExcludedOnDiskUnderDocsRoot(notes, "twin/assets/images/added.png")).toBe(true);
    expect(resolveDocBundleJsonPath(notes, "twin/assets/images/x")).toBeNull();
    // Positive control: the same host still serves its own allowed files.
    expect(checkDocsPath(notes, "real/assets/images/r.png", "read").ok).toBe(true);
    expect(checkDocsPath(notes, "real/assets/images/new.png", "write").ok).toBe(true);
  });

  test("a link that leaves the root is refused; a link to an allowed in-root folder is not", () => {
    for (const intent of INTENTS) {
      expect(checkDocsPath(kb, "notes/out/o.txt", intent)).toMatchObject({ ok: false, status: 403, reason: "outside-root" });
    }
    expect(checkDocsPath(kb, "../outside/o.txt", "read")).toMatchObject({ ok: false, status: 400, reason: "outside-root" });
    expect(checkDocsPath(kb, "notes/link-to-real/images/r.png", "read").ok).toBe(true);
    expect(checkDocsPath(kb, "notes/link-to-real/images/new.png", "write").ok).toBe(true);
    // The link entry itself may be removed or renamed: that changes no target bytes.
    expect(checkDocsPath(kb, "notes/out", "remove").ok).toBe(true);
  });

  test("a write never follows a final symbolic link; a dangling link on the way is refused", async () => {
    await symlink(join(kb, "notes/real/doc.json"), join(kb, "notes/doc-link.json"));
    expect(checkDocsPath(kb, "notes/doc-link.json", "write")).toMatchObject({ ok: false, reason: "symlink" });
    expect(checkDocsPath(kb, "notes/doc-link.json", "read").ok).toBe(true);
    await symlink(join(kb, "sessions/s1/outputs/inputs/p2"), join(kb, "notes/dangling"), "dir");
    for (const intent of INTENTS) {
      expect(checkDocsPath(kb, "notes/dangling/new/doc.json", intent)).toMatchObject({ ok: false, status: 403 });
    }
  });

  test("a malformed policy refuses everything (fail closed)", async () => {
    await write("codecaine.docs.json", JSON.stringify({ docsRoot: 42, exclude: ["sessions/*/outputs/inputs/**"] }));
    expect(checkDocsPath(kb, "notes/real/doc.json", "read")).toMatchObject({ ok: false, status: 500, reason: "policy-invalid" });
  });

  test("preflightDocsPaths reports every refused target before any change", () => {
    const result = preflightDocsPaths(kb, [
      { path: "notes/real/doc.json", intent: "write" },
      { path: "notes/twin/assets/canvases/c.canvas.json", intent: "remove" },
      { path: "notes/out/o.txt", intent: "write" },
    ]);
    expect(result.ok).toBe(false);
    expect((result as { refused: unknown[] }).refused).toHaveLength(2);
    expect((result as { status: number }).status).toBe(403);
  });
});

describe("docsFs guarded operations", () => {
  test("reads, writes, unlinks and renames through the alias are refused; frozen bytes stay identical", async () => {
    const before = await frozenBytes();
    const fs = docsFs(kb);
    const attempts: Array<() => Promise<unknown>> = [
      () => fs.readFile("notes/twin/assets/canvases/c.canvas.json", "utf8"),
      () => fs.writeFile("notes/twin/assets/canvases/c.canvas.json", "overwritten"),
      () => fs.atomicWrite("notes/twin/assets/canvases/c.canvas.json", "overwritten"),
      () => fs.atomicWrite("notes/twin/assets/images/added.png", "new"),
      () => fs.unlink("notes/twin/assets/canvases/c.canvas.json"),
      () => fs.rm("notes/twin/assets/images", { recursive: true, force: true }),
      () => fs.mkdir("notes/twin/assets/videos", { recursive: true }),
      () => fs.rename("notes/twin/assets/images/existing.png", "notes/real/assets/images/stolen.png"),
      () => fs.rename("notes/real/assets/images/r.png", "notes/twin/assets/images/planted.png"),
      () => fs.readdir("notes/twin/assets/images"),
    ];
    for (const attempt of attempts) {
      const error = await attempt().then(() => null, (caught) => caught);
      expect(isDocsPathRefusal(error)).toBe(true);
    }
    expect(await frozenBytes()).toEqual(before);
  });

  test("recursive removal and directory renames check every descendant", async () => {
    const before = await frozenBytes();
    const fs = docsFs(kb);
    // An allowed ancestor that holds the frozen inputs.
    const removal = await fs.rm("sessions/s1", { recursive: true }).then(() => null, (caught) => caught);
    expect(isDocsPathRefusal(removal)).toBe(true);
    const rename = await fs.rename("sessions/s1", "notes/s1-moved").then(() => null, (caught) => caught);
    expect(isDocsPathRefusal(rename)).toBe(true);
    // An allowed folder whose descendants would land on an excluded path.
    await write("notes/pack/outputs/inputs/x/doc.json", "{}\n");
    const landing = await fs.rename("notes/pack", "sessions/s2").then(() => null, (caught) => caught);
    expect(isDocsPathRefusal(landing)).toBe(true);
    expect(await frozenBytes()).toEqual(before);
  });

  test("positive controls: allowed reads, atomic writes, renames and listings work; excluded entries are not listed", async () => {
    const fs = docsFs(kb);
    await fs.atomicWrite("notes/real/assets/images/new.png", "new");
    expect(await readFile(join(kb, "notes/real/assets/images/new.png"), "utf8")).toBe("new");
    await fs.rename("notes/real/assets/images/new.png", "notes/real/assets/images/renamed.png");
    expect(await fs.readFile("notes/real/assets/images/renamed.png", "utf8")).toBe("new");
    expect((await fs.readdir("sessions/s1/outputs")).includes("inputs")).toBe(false);
    const classified = await fs.readdirClassified("sessions/s1/outputs");
    expect(classified.find((item) => item.name === "inputs")?.excluded).toBe(true);
    expect(fs.existsSync("notes/twin/assets/canvases/c.canvas.json")).toBe(false);
    expect(fs.existsSync("notes/real/doc.json")).toBe(true);
  });
});
