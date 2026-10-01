import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { lintRules } from "@codecaine-ai/docs-model/lint";
import { createDocsTools, type DocsTool, type DocsToolCallContext } from "../tools";
import { ruleApplies, type JudgedFinding, type JudgmentEngine } from "../lint-feedback";

const dense = (word: string) => `${Array(121).fill(word).join(" ")}.`;
const fix = (ruleId: string) => lintRules.find((rule) => rule.id === ruleId)!.suggestion;
const fixture: DocDocument = {
  schemaVersion: 1, id: "style", title: "Release", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["intro", "legacy", "body"] },
    intro: { id: "intro", type: "paragraph", props: {}, children: [], text: [{ insert: "This page describes the release process." }] },
    legacy: { id: "legacy", type: "paragraph", props: {}, children: [], text: [{ insert: dense("old") }] },
    body: { id: "body", type: "paragraph", props: {}, children: [], text: [{ insert: "Initial text." }] },
  },
};
let temp: string;
let tools: DocsTool[];
const pinned = new Map<string, DocDocument | null>();
const task: DocsToolCallContext = { taskId: "task-1" };
async function call(name: string, args: Record<string, unknown>, ctx?: DocsToolCallContext) {
  const tool = tools.find((entry) => entry.name === name)!;
  return (await tool.execute({ project: "a", ...args }, ctx)).structuredContent as Record<string, any>;
}
const hash = async () => (await call("docs_read", { path: "page" })).hash as string;
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-style-"));
  await mkdir(join(temp, "page"), { recursive: true });
  await writeFile(join(temp, "page/doc.json"), serializeDocDocument(fixture));
  pinned.clear();
  tools = createDocsTools({
    resolveProject: async (id) => ({ id, docsRoot: temp }),
    taskBaselines: { get: (taskId, key) => pinned.get(`${taskId}|${key}`), set: (taskId, key, doc) => { pinned.set(`${taskId}|${key}`, doc); } },
  });
});
afterEach(async () => {
  // The store indexes backlinks best-effort after each write.
  await Bun.sleep(30);
  await rm(temp, { recursive: true, force: true });
});

describe("style feedback on writes", () => {
  test("a write reports findings on the edited block and a clean write adds no keys", async () => {
    const flagged = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: await hash(), markdown: "We ship on Tuesday — then we rest." });
    expect(flagged.ok).toBe(true);
    expect(flagged.style_findings).toEqual({ shown: [{
      block: "body", rule: "writing.no-em-dash",
      problem: 'Authored prose contains an em dash. Evidence: "We ship on Tuesday — then we rest."',
      fix: fix("writing.no-em-dash"),
    }], omitted: 0 });
    expect(flagged.next).toBe("Changes are saved. Fix style_findings, then run docs_check with task_id.");
    // Clients may show only the start of a large result, so the feedback precedes the document.
    expect(Object.keys(flagged).slice(0, 3)).toEqual(["ok", "style_findings", "next"]);
    // The untouched legacy dense paragraph predates this write, so it is not reported.
    const clean = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: flagged.hash, markdown: "We ship on Tuesday." });
    expect(clean.ok).toBe(true);
    expect("style_findings" in clean).toBe(false);
    expect(clean.next).toBe("Changes are saved. Run docs_check with task_id before reporting completion.");
  });
});

describe("docs_check style gate", () => {
  test("blocks on gated findings the task introduced, not on findings that predate it", async () => {
    expect("style_gate" in await call("docs_check", { path: "page" }, task)).toBe(false);
    const inserted = await call("docs_insert", { path: "page", expected_hash: await hash(), parentId: "root", index: 3, type: "paragraph", markdown: dense("words") }, task);
    // The 80-character cap falls inside the 14th word, so the excerpt ends after the 13th.
    const gated = {
      block: inserted.blockId, rule: "writing.dense-paragraph",
      problem: `Paragraph exceeds 120 words. Evidence: "${Array(13).fill("words").join(" ")}…"`,
      fix: fix("writing.dense-paragraph"),
    };
    expect(inserted.style_findings.shown).toContainEqual(gated);
    // A later write must not move the baseline past the dense paragraph inserted above.
    const later = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: inserted.hash, markdown: "We ship on Tuesday." }, task);
    expect(later.ok).toBe(true);
    // The clean write has no findings of its own but still reports the violation the task left open.
    expect("style_findings" in later).toBe(false);
    expect(later.style_gate_open).toBe(1);
    expect(later.next).toBe("Changes are saved. 1 style violation this task introduced on this page is still open. Run docs_check with task_id to list it.");
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(false);
    expect(checked.style_gate).toEqual([gated]);
    const untasked = await call("docs_check", { path: "page" });
    expect(untasked.ok).toBe(true);
    expect("style_gate" in untasked).toBe(false);
  });

  test("a page created in the task is gated from its first revision", async () => {
    const created = await call("docs_create", { path: "new-page", title: "New Page", expected_absent: true }, task);
    expect(created.ok).toBe(true);
    const blank = await call("docs_check", { path: "new-page" }, task);
    expect(blank.ok).toBe(false);
    expect(blank.style_gate).toEqual([{
      rule: "structure.opening-paragraph",
      problem: 'Document body needs an opening paragraph. Evidence: "missing-opening-paragraph"',
      fix: fix("structure.opening-paragraph"),
    }]);
    const root = (await call("docs_read", { path: "new-page" })).doc.root;
    await call("docs_insert", { path: "new-page", expected_hash: created.hash, parentId: root, index: 0, type: "paragraph", markdown: "This page lists the steps for a release." }, task);
    const opened = await call("docs_check", { path: "new-page" }, task);
    expect(opened.style_gate).toEqual([]);
    expect(opened.ok).toBe(true);
  });
});

describe("docs_check judged gate", () => {
  const bullets = ["The loader reads the file. It runs once.", "The router picks a node. It never retries.", "The writer saves the trace. It flushes on exit."];
  const flatFinding = (blockId: string, probability: number): JudgedFinding => ({
    blockId, ruleId: "judgment.flat-hierarchy", probability, field: "text", evidence: bullets[0]!,
    message: "Flat list should be grouped under bold-label parents.", fix: "Group the bullets under bold-label parent bullets. Give each parent one-sentence sub-bullets.",
  });
  /** A stub engine: flat-hierarchy answers `probability` on every run it is asked about. */
  const stubEngine = (probability: () => number) => {
    const asked: string[][] = [];
    const engine: JudgmentEngine = { judge: async ({ doc, blockIds, rules }) => {
      asked.push(blockIds);
      const flat = rules.find((r) => r.id === "judgment.flat-hierarchy");
      return flat ? blockIds.filter((id) => ruleApplies(flat, doc, id)).map((id) => flatFinding(id, probability())) : [];
    } };
    return { engine, asked };
  };
  const withEngine = (engine: JudgmentEngine) => {
    tools = createDocsTools({
      resolveProject: async (id) => ({ id, docsRoot: temp }),
      taskBaselines: { get: (taskId, key) => pinned.get(`${taskId}|${key}`), set: (taskId, key, doc) => { pinned.set(`${taskId}|${key}`, doc); } },
      judgmentEngine: engine,
    });
  };
  const insertList = async () => call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops: bullets.map((text, i) => ({
    type: "insertBlock", blockId: `b${i}`, parentId: "root", index: 3 + i, blockType: "list-item", props: {}, text: [{ insert: text }],
  })) }, task);

  test("a confident judged finding on a changed block fails docs_check, and a weaker one only reports", async () => {
    let p = 0.92;
    const { engine } = stubEngine(() => p);
    withEngine(engine);
    const written = await insertList();
    expect(written.style_findings.shown).toContainEqual({ block: "b0", rule: "judgment.flat-hierarchy", problem: expect.stringContaining("Flat list should be grouped"), fix: expect.any(String) });
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(false);
    expect(checked.style_gate.map((f: any) => [f.block, f.rule])).toEqual([["b0", "judgment.flat-hierarchy"]]);
    p = 0.75;
    const softer = await call("docs_check", { path: "page" }, task);
    expect(softer.ok).toBe(true);
    expect(softer.style_gate).toEqual([]);
  });

  test("an unavailable engine is reported and does not block", async () => {
    withEngine({ judge: async () => { throw new Error("Jev returned HTTP 500."); } });
    await insertList();
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(true);
    expect(checked.judgment).toEqual({ available: false, reason: "Jev returned HTTP 500." });
  });

  test("a judged finding the baseline already had on the same block does not block", async () => {
    const { engine } = stubEngine(() => 0.95);
    withEngine(engine);
    await insertList();
    // A second task starts from a page that already has the flat run, then edits one bullet.
    const second: DocsToolCallContext = { taskId: "task-2" };
    await call("docs_write_text", { path: "page", blockId: "b1", expected_hash: await hash(), markdown: "The router picks one node." }, second);
    const checked = await call("docs_check", { path: "page" }, second);
    expect(checked.style_gate).toEqual([]);
    expect(checked.ok).toBe(true);
  });
});
