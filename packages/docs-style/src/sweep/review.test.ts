import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { sweep } from ".";
import { jev, page, paragraph, recordingRewriter, sameMeaning, splitClauses, stepsParagraph } from "./fixtures";
import { decide, splitBatches, writeBatches, type BatchLine, type R1File, type R2File } from "./review";

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe("writeBatches", () => {
  test("writes one line per accepted change, both sides in the meaning view, with the text around it", async () => {
    const reference: DeltaSpan = { insert: "Data Model", attributes: { reference: { kind: "doc", path: "10-system-design/30-data-model" } } };
    const swept = page(
      "guide",
      paragraph("intro", "The guide starts here."),
      paragraph("wordy", "Run the check in order to find broken links in ", reference, "."),
      stepsParagraph("steps", "first"),
      paragraph("outro", "The guide ends here."),
    );
    const { rewriter } = recordingRewriter((request) => splitClauses(request.markdown));
    const result = await sweep({ pages: [swept], judge: jev().judge, verifier: sameMeaning, rewriter });
    const out = await mkdtemp(path.join(tmpdir(), "docs-style-batches-"));
    roots.push(out);

    const index = await writeBatches(result, out, 60, "sweep.json");
    const lines = (await readFile(path.join(out, "batch-001.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as BatchLine);

    expect(index).toEqual({ source: "sweep.json", size: 60, total: 2, batches: [{ file: "batch-001.jsonl", count: 2, pages: ["guide"] }] });
    expect(JSON.parse(await readFile(path.join(out, "index.json"), "utf8"))).toEqual(index);
    expect(lines).toEqual([
      {
        key: "guide#wordy@autofix",
        page: "guide",
        blockId: "wordy",
        kind: "autofix",
        blockType: "paragraph",
        ruleIds: ["ste.replacement"],
        // The reference shows its target, which the page's own markdown hides.
        before: "Run the check in order to find broken links in [Data Model](ref:10-system-design/30-data-model).",
        after: "Run the check to find broken links in [Data Model](ref:10-system-design/30-data-model).",
        previous: "The guide starts here.",
        next: "The first tool reads the page; the first checker reviews each block; the first writer saves a report.",
      },
      {
        key: "guide#steps",
        page: "guide",
        blockId: "steps",
        kind: "rewrite",
        blockType: "paragraph",
        ruleIds: ["writing.semicolon"],
        before: "The first tool reads the page; the first checker reviews each block; the first writer saves a report.",
        after: "The first tool reads the page. The first checker reviews each block. The first writer saves a report.",
        previous: "Run the check to find broken links in Data Model.",
        next: "The guide ends here.",
      },
    ]);
  });
});

describe("splitBatches", () => {
  const line = (pagePath: string, n: number): BatchLine => ({
    key: `${pagePath}#b${n}`,
    page: pagePath,
    blockId: `b${n}`,
    kind: "rewrite",
    blockType: "paragraph",
    ruleIds: [],
    before: "",
    after: "",
  });
  const pageLines = (pagePath: string, count: number) => Array.from({ length: count }, (_, n) => line(pagePath, n));
  const shape = (batches: BatchLine[][]) => batches.map((batch) => batch.map((entry) => entry.key).join(" "));

  test("keeps each page in one batch, and splits only a page larger than a batch", () => {
    expect(shape(splitBatches([...pageLines("a", 2), ...pageLines("b", 2), ...pageLines("c", 5), ...pageLines("d", 1)], 3))).toEqual([
      "a#b0 a#b1",
      "b#b0 b#b1",
      "c#b0 c#b1 c#b2",
      "c#b3 c#b4 d#b0",
    ]);
  });
});

describe("decide", () => {
  const r1 = (reviewer: string, decisions: R1File["decisions"]): R1File => ({ reviewer, decisions });
  const r2 = (auditor: string, checked: string[], flags: R2File["flags"] = {}): R2File => ({ auditor, checked, flags });

  test("approves a change only when R1 approves it, R2 checks it, and R2 does not flag it", () => {
    const decisions = decide(
      [
        r1("r1-a", {
          "p#ok": { verdict: "approve", label: "clean" },
          "p#flagged": { verdict: "approve", label: "clean" },
          "p#unchecked": { verdict: "approve", label: "clean" },
          "p#rejected": { verdict: "reject", label: "meaning", note: "drops the condition" },
        }),
        // Two reviewers disagree about one key: the reject wins, whichever file comes first.
        r1("r1-b", { "p#split@autofix": { verdict: "reject", label: "readability" } }),
        r1("r1-c", { "p#split@autofix": { verdict: "approve" } }),
      ],
      [r2("r2", ["p#ok", "p#flagged", "p#split@autofix"], { "p#flagged": { label: "meaning", note: "adds a claim" } })],
    );

    expect(decisions.approved).toEqual(["p#ok"]);
    expect(decisions.unchecked).toEqual(["p#unchecked"]);
    expect(decisions.rejected).toEqual([
      { key: "p#flagged", by: "R2", label: "meaning", note: "adds a claim" },
      { key: "p#rejected", by: "R1", label: "meaning", note: "drops the condition" },
      { key: "p#split@autofix", by: "R1", label: "readability" },
    ]);
    expect(decisions.metrics).toEqual({
      machineAccepted: 5,
      r1: { approve: 3, reject: 2, rejectRate: 0.4, conflicts: 1, approveByLabel: { clean: 3 }, rejectByLabel: { meaning: 1, readability: 1 } },
      r2: { checked: 2, flagged: 1, unchecked: 1, flagsByLabel: { meaning: 1 } },
      approved: 1,
    });
  });
});
