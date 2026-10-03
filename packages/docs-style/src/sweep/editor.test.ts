import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyOps, serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { renderReport } from "../report";
import { blockMarkdown } from "../text";
import { loadCorpus, stageOps } from ".";
import { applyApproved } from "./apply";
import { exportJobs, importAnswers, type EditorAnswer, type EditorJob } from "./editor";
import { code, jev, listItem, page, paragraph, sameMeaning } from "./fixtures";
import { decide, writeBatches } from "./review";

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

/** Five sentences, one over the paragraph limit. The second holds a code span. */
const fiveSentences = (id: string, name: string) =>
  paragraph(
    id,
    `The ${name} sweep runs four checks on each page. The lint check reads the prose with `,
    code("lintStyle"),
    `. The judge check asks Jev about each block. The rewrite check sends flagged blocks to the model. The verify check compares each rewrite with its block.`,
  );

/** The editor's fix: the first sentence leads, and the other four become bullets. */
const asList = (job: EditorJob) => {
  const [lead, ...rest] = job.markdown.split(/(?<=\.) /);
  return [lead!, ...rest.map((sentence) => `- ${sentence}`)].join("\n");
};

const answer = (job: EditorJob, markdown: string): EditorAnswer => ({ key: job.key, markdown, editor: "opus-editor" });

async function importFor(pages: Parameters<typeof exportJobs>[0]["pages"], answers: (job: EditorJob) => string) {
  const { jobs } = await exportJobs({ pages });
  return importAnswers({ jobs, answers: jobs.map((job) => answer(job, answers(job))), pages, judge: jev().judge, verifier: sameMeaning });
}

describe("exportJobs", () => {
  test("makes one masked job per block that needs an editor, and skips held and exempt blocks", async () => {
    const guide = page(
      "guide",
      fiveSentences("five", "first"),
      // One long sentence is a model rewrite, not an editor job.
      paragraph("long", "The long check reads every page from the disk and then compares each block with the house rules before it writes a report."),
      // A broken sentence holds its block for a person, whatever else it has.
      paragraph("broken", "The editor saves the page. the save loop runs. The tool checks it. The tool logs it. The tool ends. The tool exits."),
      ...listItem("item", "The item check reads the page. The item check reviews each block. The item check writes a report."),
    );
    const manifesto = page("00-foundation/00-manifesto", fiveSentences("five", "manifesto"));

    const { jobs, held, exempt } = await exportJobs({ pages: [guide, manifesto], corpus: "docs-system" });

    expect(jobs.map((job) => [job.key, job.findings.map((finding) => finding.rule)])).toEqual([
      // The page opens with it, so the opening-length finding needs an editor too.
      ["guide#five", ["structure.opening-length", "ste.paragraph-length"]],
      ["guide#item", ["structure.list-item-sentences"]],
    ]);
    expect([held, exempt]).toEqual([1, 1]);
    expect(jobs[0]).toMatchObject({
      corpus: "docs-system",
      page: "guide",
      blockId: "five",
      blockType: "paragraph",
      markdown:
        "The first sweep runs four checks on each page. The lint check reads the prose with ⟦0⟧. The judge check asks Jev about each block. The rewrite check sends flagged blocks to the model. The verify check compares each rewrite with its block.",
      tokens: [{ token: "⟦0⟧", kind: "code", preview: "lintStyle" }],
      next: "The long check reads every page from the disk and then compares each block with the house rules before it writes a report.",
      allowList: true,
    });
    expect(jobs[0]!.siblings.map((sibling) => [sibling.blockId, sibling.self ?? false])).toEqual([
      ["five", true],
      ["long", false],
      ["broken", false],
      ["item", false],
    ]);
  });
});

describe("importAnswers", () => {
  test("a list-form answer passes every guardrail and stages after its own block when another is not approved", async () => {
    const guide = page("guide", fiveSentences("one", "first"), fiveSentences("two", "second"), paragraph("end", "The page ends."));

    const { result, problems } = await importFor([guide], asList);
    const [swept] = result.pages;

    expect(problems).toEqual([]);
    expect(swept!.changes.map((change) => [change.blockId, change.status])).toEqual([
      ["one", "accepted"],
      ["two", "accepted"],
    ]);
    expect(swept!.changes[1]!.produced!.map((block) => block.depth)).toEqual([0, 1, 1, 1, 1]);
    expect(swept!.changes[1]!.produced![1]!.spans).toEqual([{ insert: "The lint check reads the prose with " }, code("lintStyle"), { insert: "." }]);

    // A reviewer approves only the second block.
    const staged = applyOps(guide.doc, stageOps(guide.doc, swept!, new Set(["guide#two"])));
    expect(staged.ok).toBe(true);
    const after = (staged as { doc: DocDocument }).doc;
    expect(after.blocks.root!.children).toEqual(["one", "two", "two-r0", "two-r1", "two-r2", "two-r3", "end"]);
    expect(blockMarkdown(after.blocks.one)).toBe(blockMarkdown(guide.doc.blocks.one));
    expect(blockMarkdown(after.blocks.two)).toBe("The second sweep runs four checks on each page.");
    expect(blockMarkdown(after.blocks["two-r0"])).toBe("The lint check reads the prose with `lintStyle`.");
  });

  test("rejects an answer that drops content, and marks an answer that changes nothing", async () => {
    const guide = page("guide", fiveSentences("lossy", "first"), fiveSentences("same", "second"));

    const { result } = await importFor([guide], (job) => (job.blockId === "lossy" ? asList(job).split("\n").slice(0, 3).join("\n") : job.markdown));
    const [lossy, same] = result.pages[0]!.changes;

    expect(lossy).toMatchObject({ status: "rejected", ops: [] });
    expect(lossy!.produced).toBeUndefined();
    expect(lossy!.attempts![0]!.failed).toContain("content-coverage");
    expect(same).toMatchObject({ status: "unchanged", reason: "the editor returned the block unchanged", ops: [] });
  });

  test("refuses an answer to a page that changed after the export", async () => {
    const guide = page("guide", fiveSentences("one", "first"));
    const { jobs } = await exportJobs({ pages: [guide] });
    const edited = page("guide", fiveSentences("one", "first"), paragraph("new", "Someone added this block."));

    const { result } = await importAnswers({ jobs, answers: [answer(jobs[0]!, asList(jobs[0]!))], pages: [edited], judge: jev().judge, verifier: sameMeaning });

    expect(result.pages[0]!.changes).toMatchObject([{ status: "error", reason: "the page changed since the job was exported", ops: [] }]);
  });
});

describe("the editor flow", () => {
  test("imported answers go through batches, decide, apply, and the report like a sweep", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "docs-style-editor-")));
    roots.push(root);
    const docs = path.join(root, "docs");
    const guide = page("guide", fiveSentences("one", "first"), paragraph("end", "The page ends."));
    await mkdir(path.join(docs, "guide"), { recursive: true });
    await writeFile(path.join(docs, "guide", "doc.json"), serializeDocDocument(guide.doc));

    const pages = await loadCorpus(docs);
    const { result } = await importFor(pages, asList);
    const index = await writeBatches(result, path.join(root, "batches"), 60);
    const keys = (await readFile(path.join(root, "batches", index.batches[0]!.file), "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { key: string }).key);
    const decisions = decide(
      [{ reviewer: "r1", decisions: Object.fromEntries(keys.map((key) => [key, { verdict: "approve" as const }])) }],
      [{ auditor: "r2", checked: keys, flags: {} }],
    );
    const report = await applyApproved({
      result,
      approved: new Set(decisions.approved),
      docsRoot: docs,
      backupDir: path.join(root, "backups"),
      touchedFile: path.join(root, "touched.txt"),
    });

    expect(keys).toEqual(["guide#one"]);
    expect(report.applied).toMatchObject([{ page: "guide", keys: ["guide#one"], ops: 5 }]);
    const written = JSON.parse(await readFile(path.join(docs, "guide", "doc.json"), "utf8")) as DocDocument;
    expect(written.blocks.root!.children).toEqual(["one", "one-r0", "one-r1", "one-r2", "one-r3", "end"]);
    expect(renderReport(result)).toContain("guide");
  });
});
