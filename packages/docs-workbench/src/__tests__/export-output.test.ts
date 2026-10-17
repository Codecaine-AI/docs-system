import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { setDocsRootExclude } from "@codecaine-ai/docs-index/paths";
import { checkDocsOutputPath } from "@codecaine-ai/docs-index/safe-path";

import { runExport } from "../export";
import { ensureSpaBuilt } from "../spa";

/**
 * B7-3-02: every write of `docs-cli export` goes through the output guard
 * (docsOutputFs in @codecaine-ai/docs-index/safe-path). An allowed output
 * folder whose data/ (or data/files, a deeper data/ folder, the SPA assets/
 * folder) is a link into the frozen inputs, a linked index.html, an external
 * output folder whose descendants lead into the source corpus, an output
 * folder that is itself a link into the inputs, and an output folder on a
 * path an enclosing project excludes are all refused; the corpus (frozen
 * sentinel site.json/tree.json/backlinks.json/index.html included) stays
 * byte- and entry-identical. Ordinary output folders, inside and outside the
 * corpus, still export.
 */

const FROZEN = "sessions/s1/outputs/inputs/p1";
const SENTINELS = ["site.json", "tree.json", "backlinks.json", "index.html"];
const DOC = (id: string) => JSON.stringify({
  schemaVersion: 1,
  id,
  title: id,
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: `Body of ${id}.` }], children: [] },
  },
});

let temp: string;
let kb: string;

async function write(root: string, rel: string, bytes: string) {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), bytes);
}

/** Every entry below `root` (folders end in "/", links are "link") with each file's sha256. */
async function treeBytes(root: string, rel = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir ? join(root, dir) : root, { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out[path] = "link";
      else if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(root, path))).digest("hex");
    }
  };
  await walk(rel);
  return out;
}

const corpusState = () => treeBytes(kb);
const frozenSentinels = async () =>
  Object.fromEntries(await Promise.all(SENTINELS.map(async (name) => [name, await readFile(join(kb, FROZEN, name), "utf8")])));

// runExport copies the static SPA (web/dist-static) and vite-builds it first when
// it is missing or older than its sources. That build takes 5 s or more, longer
// than one test's 5 s budget, so build or confirm it once here with a budget
// that fits the build; each export below then reuses the cached SPA.
beforeAll(async () => {
  await ensureSpaBuilt({ mode: "static" });
}, 180_000);

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-export-output-")));
  kb = join(temp, "kb");
  await write(kb, "codecaine.docs.json", JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
  await write(kb, "notes/a/doc.json", DOC("a"));
  await write(kb, "notes/a/assets/images/a.png", "png");
  await write(kb, `${FROZEN}/doc.json`, DOC("frozen"));
  for (const name of SENTINELS) await write(kb, `${FROZEN}/${name}`, `FROZEN ${name}\n`);
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** Runs the export and returns its refusal message (fails the test when it succeeds). */
async function refusedExport(options: { docsRoot?: string; outDir: string }): Promise<string> {
  try {
    await runExport({ docsRoot: options.docsRoot ?? kb, outDir: options.outDir });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`export into ${options.outDir} was not refused`);
}

describe("B7-3-02: export destinations never reach a path the corpus forbids", () => {
  test("an allowed output folder with a linked data/ into the frozen inputs is refused before any write", async () => {
    const before = await corpusState();
    const sentinels = await frozenSentinels();
    await mkdir(join(kb, "export"), { recursive: true });
    await symlink(join(kb, FROZEN), join(kb, "export/data"), "dir");
    const corpusWithLink = await corpusState();
    expect(await refusedExport({ outDir: join(kb, "export") })).toMatch(/Export output refused: .*data is a symbolic link/);
    expect(await corpusState()).toEqual(corpusWithLink);
    expect(await frozenSentinels()).toEqual(sentinels);
    expect(await readdir(join(kb, "export"))).toEqual(["data"]);
    expect(Object.fromEntries(Object.entries(await corpusState()).filter(([path]) => !path.startsWith("export")))).toEqual(before);
  });

  test("a linked index.html is refused; the frozen file it names is unchanged", async () => {
    const sentinels = await frozenSentinels();
    for (const outDir of [join(kb, "export"), join(temp, "external")]) {
      await mkdir(outDir, { recursive: true });
      await symlink(join(kb, FROZEN, "index.html"), join(outDir, "index.html"));
      const before = await corpusState();
      expect(await refusedExport({ outDir })).toMatch(/Export output refused: .*index\.html is a symbolic link/);
      expect(await corpusState()).toEqual(before);
      expect(await readdir(outDir)).toEqual(["index.html"]);
    }
    expect(await frozenSentinels()).toEqual(sentinels);
  });

  test("an external output folder whose descendants lead into the source corpus is refused", async () => {
    const before = await corpusState();
    const cases: Array<[string, () => Promise<void>, RegExp]> = [
      ["data -> allowed corpus folder", async () => {
        await mkdir(join(temp, "out1"), { recursive: true });
        await symlink(join(kb, "notes"), join(temp, "out1/data"), "dir");
      }, /data is a symbolic link/],
      ["data/files -> frozen inputs", async () => {
        await mkdir(join(temp, "out2/data"), { recursive: true });
        await symlink(join(kb, FROZEN), join(temp, "out2/data/files"), "dir");
      }, /data\/files is a symbolic link/],
      ["SPA assets/ -> frozen inputs", async () => {
        await mkdir(join(temp, "out3"), { recursive: true });
        await symlink(join(kb, FROZEN), join(temp, "out3/assets"), "dir");
      }, /assets is a symbolic link/],
      ["the output folder itself -> frozen inputs", async () => {
        await symlink(join(kb, FROZEN), join(temp, "out4"), "dir");
      }, /the output folder .*out4 is a symbolic link/],
    ];
    for (const [label, arrange, message] of cases) {
      await arrange();
      const outDir = join(temp, `out${cases.findIndex(([name]) => name === label) + 1}`);
      expect({ label, message: await refusedExport({ outDir }) }).toMatchObject({ label, message: expect.stringMatching(message) });
      expect(await corpusState()).toEqual(before);
    }
  });

  test("a link deeper in data/ is refused at its own write; the frozen inputs are unchanged", async () => {
    const outDir = join(temp, "deep");
    await mkdir(join(outDir, "data/bundles"), { recursive: true });
    await symlink(join(kb, FROZEN), join(outDir, "data/bundles/notes"), "dir");
    const before = await corpusState();
    expect(await refusedExport({ outDir })).toMatch(/data\/bundles\/notes is a symbolic link/);
    expect(await corpusState()).toEqual(before);
    expect(existsSync(join(kb, FROZEN, "a.json"))).toBe(false);
  });

  test("an output folder on a path an enclosing project excludes is refused for a served subfolder", async () => {
    const before = await corpusState();
    for (const outDir of [join(kb, "sessions/s1/outputs/inputs/new-export"), join(kb, "sessions/s1/outputs/INPUTS/p1")]) {
      expect(await refusedExport({ docsRoot: join(kb, "notes"), outDir })).toMatch(/Export output refused: .*excludes/);
      expect(await refusedExport({ outDir })).toMatch(/Export output refused: .*excluded/);
    }
    expect(await corpusState()).toEqual(before);
  });

  test("positive controls: fresh output folders inside and outside the corpus, and one below a linked parent, export", async () => {
    await mkdir(join(temp, "real-parent"), { recursive: true });
    await symlink(join(temp, "real-parent"), join(temp, "linked-parent"), "dir");
    const sentinels = await frozenSentinels();
    for (const outDir of [join(temp, "site"), join(kb, "export"), join(temp, "linked-parent/site")]) {
      const report = await runExport({ docsRoot: kb, outDir });
      expect(report.failures).toEqual([]);
      expect(report.bundlesExported).toBe(1);
      for (const rel of ["index.html", "data/site.json", "data/tree.json", "data/backlinks.json", "data/bundles/notes/a.json", "data/markdown/notes/a.md", "data/files/notes/a/assets/images/a.png"]) {
        expect({ outDir, rel, exists: existsSync(join(outDir, rel)) }).toEqual({ outDir, rel, exists: true });
      }
      expect(existsSync(join(outDir, "data/bundles/sessions"))).toBe(false);
    }
    expect(existsSync(join(temp, "real-parent/site/index.html"))).toBe(true);
    expect(await frozenSentinels()).toEqual(sentinels);
  });
});

describe("B7-4: the output folder itself, and the requested destination behind a permitted parent link", () => {
  test("B7-4-01: an output folder that is itself a link to an ordinary allowed folder is refused before any write", async () => {
    const outside = join(temp, "allowed-target");
    const inside = join(kb, "notes/allowed-target");
    for (const target of [outside, inside]) {
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "keep.txt"), "keep\n");
    }
    const corpusBefore = await corpusState();
    const outsideBefore = await treeBytes(outside);
    const cases: Array<[string, string]> = [
      [join(temp, "linked-out"), outside],
      [join(kb, "linked-out"), inside],
    ];
    for (const [link, target] of cases) await symlink(target, link, "dir");
    const corpusWithLinks = await corpusState();
    for (const [link, target] of cases) {
      // The guard refuses the output folder as a target and every destination below it.
      for (const [rel, intent] of [["", "mkdir"], ["index.html", "write"], ["data/site.json", "write"]] as const) {
        expect({ link, rel, check: checkDocsOutputPath(kb, link, rel, intent) }).toMatchObject({
          link,
          rel,
          check: { ok: false, status: 403, reason: "symlink" },
        });
      }
      expect(await refusedExport({ outDir: link })).toMatch(/Export output refused: .*the output folder .*linked-out is a symbolic link/);
      expect(await readdir(target)).toEqual(["keep.txt"]);
    }
    expect(await treeBytes(outside)).toEqual(outsideBefore);
    expect(await corpusState()).toEqual(corpusWithLinks);
    expect(Object.fromEntries(Object.entries(await corpusState()).filter(([path]) => path !== "linked-out"))).toEqual(corpusBefore);
    // A link strictly above the output folder is still followed (the positive control below exports through one).
    expect(checkDocsOutputPath(kb, join(temp, "linked-out/site"), "index.html", "write")).toMatchObject({ ok: true });
  });

  test("B7-4-02: a permitted parent link that carries a lexically excluded destination to an allowed folder is refused", async () => {
    // sessions/s2/outputs/inputs (excluded by the KB) is a link to an allowed folder outside the corpus,
    // sessions/s3/outputs/inputs a link to an allowed corpus folder; a link to the KB itself gives another spelling.
    const outside = join(temp, "physical");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "keep.txt"), "keep\n");
    await mkdir(join(kb, "public"), { recursive: true });
    await mkdir(join(kb, "sessions/s2/outputs"), { recursive: true });
    await mkdir(join(kb, "sessions/s3/outputs"), { recursive: true });
    await symlink(outside, join(kb, "sessions/s2/outputs/inputs"), "dir");
    await symlink(join(kb, "public"), join(kb, "sessions/s3/outputs/inputs"), "dir");
    await symlink(kb, join(temp, "kb-alias"), "dir");
    const corpusBefore = await corpusState();
    const outsideBefore = await treeBytes(outside);
    const outDirs = [
      join(kb, "sessions/s2/outputs/inputs/site"),
      join(kb, "sessions/s3/outputs/inputs/site"),
      join(kb, "sessions/s2/outputs/INPUTS/site"),
      join(temp, "kb-alias/sessions/s2/outputs/inputs/site"),
    ];
    for (const outDir of outDirs) {
      for (const docsRoot of [kb, join(kb, "notes")]) {
        for (const [rel, intent] of [["", "mkdir"], ["index.html", "write"], ["data/files", "mkdir"]] as const) {
          expect({ outDir, docsRoot, rel, check: checkDocsOutputPath(docsRoot, outDir, rel, intent) }).toMatchObject({
            outDir,
            docsRoot,
            rel,
            check: { ok: false, status: 403, reason: "excluded" },
          });
        }
        expect(await refusedExport({ docsRoot, outDir })).toMatch(/Export output refused: .*exclude/);
      }
    }
    expect(await corpusState()).toEqual(corpusBefore);
    expect(await treeBytes(outside)).toEqual(outsideBefore);
    expect(existsSync(join(kb, "public/site"))).toBe(false);
    // The registered exclusion (the reviewer's reproduction) is honored for the requested form too.
    await mkdir(join(kb, "pkg/real"), { recursive: true });
    await mkdir(join(kb, "vendor"), { recursive: true });
    await symlink(join(kb, "pkg/real"), join(kb, "vendor/real"), "dir");
    setDocsRootExclude(kb, ["vendor/**"]);
    try {
      expect(checkDocsOutputPath(kb, join(kb, "vendor/real/out"), "index.html", "write")).toMatchObject({ ok: false, reason: "excluded" });
      expect(checkDocsOutputPath(kb, join(kb, "pkg/real/out"), "index.html", "write")).toMatchObject({ ok: true });
    } finally {
      setDocsRootExclude(kb, undefined);
    }
  });

  test("positive control: a permitted parent link whose requested and canonical forms are both allowed still exports", async () => {
    await mkdir(join(temp, "physical-ok"), { recursive: true });
    await symlink(join(temp, "physical-ok"), join(kb, "linked-out-parent"), "dir");
    const sentinels = await frozenSentinels();
    const outDir = join(kb, "linked-out-parent/site");
    const report = await runExport({ docsRoot: kb, outDir });
    expect(report.failures).toEqual([]);
    expect(existsSync(join(temp, "physical-ok/site/index.html"))).toBe(true);
    expect(existsSync(join(temp, "physical-ok/site/data/bundles/notes/a.json"))).toBe(true);
    expect(await frozenSentinels()).toEqual(sentinels);
  });
});
