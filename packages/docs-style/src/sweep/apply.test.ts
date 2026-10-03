import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { blockMarkdown } from "../text";
import type { SweepPage } from "../types";
import { loadCorpus, sweep } from ".";
import { applyApproved, restoreBackups, type ApplyOptions } from "./apply";
import { page, paragraph } from "./fixtures";
import { changeKey } from "./stage";

const WORDY = "Run the check in order to find broken links.";
const FIXED = "Run the check to find broken links.";

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

/** A corpus on disk: <root>/docs/<page>/doc.json per page, and a rollout folder beside docs. */
async function corpus(...pages: SweepPage[]) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "docs-style-apply-")));
  roots.push(root);
  const docs = path.join(root, "docs");
  for (const { path: pagePath, doc } of pages) await writeDoc(path.join(docs, pagePath, "doc.json"), doc);
  // The rollout folder sits in the project, beside docs, as .tmp/ste-rollout does in docs-system.
  const rollout = path.join(root, ".tmp", "ste-rollout");
  return { root, docs, docFile: (pagePath: string) => path.join(docs, pagePath, "doc.json"), touched: path.join(rollout, "touched.txt"), backups: path.join(rollout, "backups") };
}

async function writeDoc(file: string, doc: DocDocument): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeDocDocument(doc));
}

/** Sweeps the corpus as it is on disk (Tier 1 and autofix), and returns the keys of its accepted changes. */
async function sweepDisk(docs: string) {
  const result = await sweep({ pages: await loadCorpus(docs), deepPages: new Set() });
  const accepted = result.pages.flatMap((swept) => swept.changes.filter((change) => change.status === "accepted").map((change) => changeKey(swept.path, change)));
  return { result, accepted };
}

async function textOf(file: string, blockId: string): Promise<string> {
  return blockMarkdown((JSON.parse(await readFile(file, "utf8")) as DocDocument).blocks[blockId]);
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

const wordyPage = (pagePath: string) => page(pagePath, paragraph("p", WORDY));

describe("applyApproved", () => {
  test("a dry run writes nothing, and a real run backs up the page and writes only the approved changes", async () => {
    const disk = await corpus(wordyPage("a"), wordyPage("b"));
    const original = await readFile(disk.docFile("a"), "utf8");
    const { result, accepted } = await sweepDisk(disk.docs);
    expect(accepted).toEqual(["a#p@autofix", "b#p@autofix"]);
    const options: ApplyOptions = { result, approved: new Set(["a#p@autofix"]), docsRoot: disk.docs, backupDir: disk.backups, touchedFile: disk.touched };

    const dry = await applyApproved({ ...options, dryRun: true });
    expect(dry.wouldApply).toEqual([{ page: "a", keys: ["a#p@autofix"], ops: 1 }]);
    expect(await readFile(disk.docFile("a"), "utf8")).toBe(original);
    expect(await exists(disk.backups)).toBe(false);
    expect(await exists(disk.touched)).toBe(false);

    const report = await applyApproved(options);
    expect(report.applied).toMatchObject([{ page: "a", doc: disk.docFile("a"), keys: ["a#p@autofix"], ops: 1 }]);
    expect(await textOf(disk.docFile("a"), "p")).toBe(FIXED);
    expect(await textOf(disk.docFile("b"), "p")).toBe(WORDY);
    expect(await readFile(path.join(disk.backups, "a", "doc.json"), "utf8")).toBe(original);
    expect(await readFile(disk.touched, "utf8")).toBe(`${disk.docFile("a")}\n`);
    expect(JSON.parse(await readFile(path.join(disk.backups, "apply-report.json"), "utf8"))).toEqual(report);

    // A second run into the same folder would overwrite this run's report, so it writes nothing.
    await expect(applyApproved({ ...options, approved: new Set(["b#p@autofix"]) })).rejects.toThrow("The backup folder is not empty");
    expect(await textOf(disk.docFile("b"), "p")).toBe(WORDY);
  });

  test("skips a page that changed since the sweep, and leaves it as it is", async () => {
    const disk = await corpus(wordyPage("a"));
    const { result, accepted } = await sweepDisk(disk.docs);
    const edited = page("a", paragraph("p", WORDY), paragraph("q", "Someone added this after the sweep."));
    await writeDoc(disk.docFile("a"), edited.doc);

    const report = await applyApproved({ result, approved: new Set(accepted), docsRoot: disk.docs, backupDir: disk.backups, touchedFile: disk.touched });

    expect(report.applied).toEqual([]);
    expect(report.skipped).toEqual([{ page: "a", reason: "changed since sweep", keys: ["a#p@autofix"] }]);
    expect(await readFile(disk.docFile("a"), "utf8")).toBe(serializeDocDocument(edited.doc));
    expect(await exists(path.join(disk.backups, "a", "doc.json"))).toBe(false);
  });

  test("skips a page with uncommitted changes, unless the rollout wrote it", async () => {
    const disk = await corpus(wordyPage("a"), wordyPage("b"));
    const git = (...args: string[]) => spawnSync("git", ["-C", disk.root, "-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { encoding: "utf8" });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-qm", "pages");
    // Someone edits page a and does not commit.
    await writeDoc(disk.docFile("a"), page("a", paragraph("p", `${WORDY} Today.`)).doc);
    const first = await sweepDisk(disk.docs);
    const options = { docsRoot: disk.docs, backupDir: path.join(disk.backups, "1"), touchedFile: disk.touched };

    const report = await applyApproved({ ...options, result: first.result, approved: new Set(first.accepted) });

    expect(report.skipped).toEqual([{ page: "a", reason: "uncommitted changes that the rollout did not make", keys: ["a#p@autofix"] }]);
    expect(report.applied.map((applied) => applied.page)).toEqual(["b"]);

    // Once the rollout lists page a as its own, the page can be written. A repair lists it by page path.
    await writeFile(disk.touched, "a\n");
    const second = await sweepDisk(disk.docs);
    const again = await applyApproved({ ...options, backupDir: path.join(disk.backups, "2"), result: second.result, approved: new Set(second.accepted) });
    expect(again.applied.map((applied) => applied.page)).toEqual(["a"]);
    expect(await textOf(disk.docFile("a"), "p")).toBe(`${FIXED} Today.`);
  });
});

describe("restoreBackups", () => {
  test("restores each page that still holds what the apply wrote, and reports the rest as conflicts", async () => {
    const disk = await corpus(wordyPage("a"), wordyPage("b"));
    const originals = { a: await readFile(disk.docFile("a"), "utf8"), b: await readFile(disk.docFile("b"), "utf8") };
    const { result, accepted } = await sweepDisk(disk.docs);
    await applyApproved({ result, approved: new Set(accepted), docsRoot: disk.docs, backupDir: disk.backups, touchedFile: disk.touched });
    // Someone edits page b after the apply.
    const edited = page("b", paragraph("p", "Someone rewrote this page after the apply."));
    await writeDoc(disk.docFile("b"), edited.doc);

    const report = await restoreBackups(disk.backups);

    expect(report.restored).toEqual([{ page: "a", doc: disk.docFile("a") }]);
    expect(report.conflicts).toEqual([{ page: "b", doc: disk.docFile("b"), reason: "changed since apply" }]);
    expect(await readFile(disk.docFile("a"), "utf8")).toBe(originals.a);
    expect(await readFile(disk.docFile("b"), "utf8")).toBe(serializeDocDocument(edited.doc));
    expect(originals.b).not.toBe(serializeDocDocument(edited.doc));
  });
});
