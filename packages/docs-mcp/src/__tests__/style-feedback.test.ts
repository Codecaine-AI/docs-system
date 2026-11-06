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
      // An em dash is a lint error, so docs_check fails on it with or without a task.
      blocks_check: true,
    }], omitted: 0 });
    expect(flagged.next).toBe("Changes are saved. Fix the style_findings marked blocks_check first: docs_check fails on them. Fix the rest as you go, then run docs_check with task_id.");
    // Clients may show only the start of a large result, so the feedback precedes the document.
    expect(Object.keys(flagged).slice(0, 3)).toEqual(["ok", "style_findings", "next"]);
    // The untouched legacy dense paragraph predates this write, so it is not reported.
    const clean = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: flagged.hash, markdown: "We ship on Tuesday." });
    expect(clean.ok).toBe(true);
    expect("style_findings" in clean).toBe(false);
    expect(clean.next).toBe("Changes are saved. Run docs_check with task_id before reporting completion.");
  });
});

describe("layout findings", () => {
  test("an over-wide code line is reported on write and read as a warning and never fails docs_check", async () => {
    const line = "x".repeat(130);
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops: [{
      type: "insertBlock", blockId: "wide-code", parentId: "root", index: 3, blockType: "code", props: { language: "text" }, text: [{ insert: line }],
    }] }, task);
    expect(written.ok).toBe(true);
    expect(written.style_findings.shown).toContainEqual({
      block: "wide-code", rule: "layout.code-line-width",
      problem: expect.stringMatching(/^Line 1 is 130 columns wide, but at stock theme settings the code panel fits 118, so the line wraps on the page\./),
      fix: expect.stringContaining("Never reflow or shorten a copied line to fit."),
    });
    const read = await call("docs_read", { path: "page" });
    const finding = read.lint.findings.find((f: any) => f.ruleId === "layout.code-line-width");
    expect(finding).toMatchObject({ blockId: "wide-code", severity: "warning", evidence: line });
    expect(read.lint.blocking).toEqual([]);
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(true);
    expect(checked.style_gate).toEqual([]);
  });

  test("a table too wide for its lane and a stack detail that wraps are reported on write and read, and never fail docs_check", async () => {
    const sentence = "Short text column under forty characters";
    const detail = "parses every stored document on load · validates the schema of each block · projects Markdown for agents";
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops: [
      { type: "insertBlock", blockId: "wide-table", parentId: "root", index: 3, blockType: "structured-table",
        props: { columns: ["One", "Two", "Three", "Four", "Five", "Six"], rows: [[sentence, sentence, sentence, sentence, sentence, sentence]] } },
      { type: "insertBlock", blockId: "layers", parentId: "root", index: 4, blockType: "stack",
        props: { nodes: [{ name: "Model", detail }], boundaries: [] } },
    ] }, task);
    expect(written.ok).toBe(true);
    expect(written.style_findings.shown).toContainEqual({
      block: "wide-table", rule: "layout.table-fit",
      problem: expect.stringMatching(/^The table needs at least [\d,]+px but has 1,100px at stock theme settings, so it scrolls sideways on screen\./),
      fix: expect.stringContaining("split the table"),
    });
    expect(written.style_findings.shown).toContainEqual({
      block: "layers", rule: "layout.stack-detail-fit",
      problem: expect.stringMatching(/^The detail of "Model" needs [\d,]+px on one line, but at stock theme settings stack details wrap at 506px, so it wraps to 2 lines\./),
      fix: expect.stringContaining("Shorten the detail to one line"),
    });
    const read = await call("docs_read", { path: "page" });
    const layout = read.lint.findings.filter((f: any) => f.ruleId === "layout.table-fit" || f.ruleId === "layout.stack-detail-fit");
    expect(layout.map((f: any) => [f.ruleId, f.blockId, f.severity])).toEqual([
      ["layout.table-fit", "wide-table", "warning"],
      ["layout.stack-detail-fit", "layers", "warning"],
    ]);
    // Measured with the exact backend, so no finding calls its widths approximate.
    expect(layout.some((f: any) => f.message.includes("approximate"))).toBe(false);
    expect(read.lint.blocking).toEqual([]);
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(true);
    expect(checked.style_gate).toEqual([]);
  });
});

describe("the page in write results", () => {
  test("a write returns the root and the blocks it changed, counts the rest, and docs_read returns the whole page", async () => {
    const written = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: await hash(), markdown: "We ship on Tuesday." }, task);
    expect(Object.keys(written.doc.blocks).sort()).toEqual(["body", "root"]);
    expect(written.doc.blocks.root.children).toEqual(["intro", "legacy", "body"]);
    expect(written.doc_omitted_blocks).toBe(2);
    expect(Object.keys((await call("docs_read", { path: "page" })).doc.blocks).sort()).toEqual(["body", "intro", "legacy", "root"]);
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
    // The write marks the finding docs_check will fail on, lists it first, and leaves the advisory one unmarked.
    expect(inserted.style_findings.shown.map((f: any) => [f.rule, f.blocks_check ?? false])).toEqual([["writing.dense-paragraph", true], ["writing.sentence-length", false]]);
    expect(inserted.style_findings.shown[0]).toEqual({ ...gated, blocks_check: true });
    expect(inserted.next).toContain("Fix the style_findings marked blocks_check first");
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

  test("a code block between two numbered steps fails docs_check until it moves into the step above", async () => {
    const step = (id: string, index: number, text: string) => ({ type: "insertBlock", blockId: id, parentId: "root", index, blockType: "list-item", props: { ordered: true }, text: [{ insert: text }] });
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops: [
      step("s1", 3, "Run the boundary test."),
      { type: "insertBlock", blockId: "run", parentId: "root", index: 4, blockType: "code", props: { language: "sh" }, text: [{ insert: "bun test" }] },
      step("s2", 5, "Fix each import the test lists."),
    ] }, task);
    expect(written.style_findings.shown).toContainEqual({
      block: "run", rule: "structure.split-ordered-list",
      problem: 'The code block run sits between step 1 and the next numbered step, so that step renders as "1.". Move run into step 1\'s children.',
      fix: fix("structure.split-ordered-list"), blocks_check: true,
    });
    expect((await call("docs_check", { path: "page" }, task)).ok).toBe(false);
    await call("docs_apply_ops", { path: "page", expected_hash: written.hash, ops: [{ type: "moveBlock", blockId: "run", toParentId: "s1", toIndex: 0 }] }, task);
    const checked = await call("docs_check", { path: "page" }, task);
    expect([checked.ok, checked.style_gate]).toEqual([true, []]);
  });

  test("a condition written as an operation's returns fails docs_check until it moves into the description", async () => {
    const surface = (returns: string, description?: string) => ({ operations: [{ name: "POST /api/undo", returns, ...(description ? { description } : {}) }] });
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops: [
      { type: "insertBlock", blockId: "surface", parentId: "root", index: 3, blockType: "interaction-surface", props: surface("{ ok: true, doc, hash } for a doc patch. A canvas patch returns its own fields.") },
    ] }, task);
    expect(written.style_findings.shown).toContainEqual(expect.objectContaining({
      block: "surface", rule: "interaction-surface.returns-prose", fix: fix("interaction-surface.returns-prose"), blocks_check: true,
    }));
    expect((await call("docs_check", { path: "page" }, task)).ok).toBe(false);
    await call("docs_apply_ops", { path: "page", expected_hash: written.hash, ops: [
      { type: "updateBlock", blockId: "surface", props: surface("{ ok: true, doc, hash }", "Undoes the last doc patch. A canvas patch returns its own fields.") },
    ] }, task);
    const checked = await call("docs_check", { path: "page" }, task);
    expect([checked.ok, checked.style_gate]).toEqual([true, []]);
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
    expect(written.style_findings.shown).toContainEqual({ block: "b0", rule: "judgment.flat-hierarchy", problem: expect.stringContaining("Flat list should be grouped"), fix: expect.any(String), blocks_check: true });
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(false);
    expect(checked.style_gate.map((f: any) => [f.block, f.rule])).toEqual([["b0", "judgment.flat-hierarchy"]]);
    p = 0.75;
    const softer = await call("docs_check", { path: "page" }, task);
    expect(softer.ok).toBe(true);
    expect(softer.style_gate).toEqual([]);
  });

  test("a write lists a judged finding below the gate threshold without blocks_check, and docs_check passes it", async () => {
    withEngine(stubEngine(() => 0.75).engine);
    const written = await insertList();
    const finding = written.style_findings.shown.find((f: any) => f.rule === "judgment.flat-hierarchy");
    expect(finding.block).toBe("b0");
    expect("blocks_check" in finding).toBe(false);
    expect(written.next).toMatch(/^Changes are saved\. Fix style_findings, then run docs_check with task_id\./);
    expect(written.next).not.toContain("blocks_check");
    expect((await call("docs_check", { path: "page" }, task)).ok).toBe(true);
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
    const written = await call("docs_write_text", { path: "page", blockId: "b1", expected_hash: await hash(), markdown: "The router picks one node." }, second);
    // The write still reports the finding, but does not say docs_check fails on it.
    const judged = written.style_findings.shown.filter((f: any) => f.rule === "judgment.flat-hierarchy");
    expect(judged.length).toBeGreaterThan(0);
    expect(judged.some((f: any) => f.blocks_check)).toBe(false);
    const checked = await call("docs_check", { path: "page" }, second);
    expect(checked.style_gate).toEqual([]);
    expect(checked.ok).toBe(true);
  });

  test("a write marks no judged finding blocks_check when the baseline cannot be judged", async () => {
    const { engine } = stubEngine(() => 0.95);
    withEngine(engine);
    await insertList();
    // The baseline still has the original second bullet: judging it fails, as an engine outage would.
    withEngine({ judge: async (input) => {
      if ((input.doc.blocks.b1?.text ?? []).some((span) => span.insert === bullets[1])) throw new Error("Jev returned HTTP 500.");
      return engine.judge(input);
    } });
    const second: DocsToolCallContext = { taskId: "task-3" };
    const written = await call("docs_write_text", { path: "page", blockId: "b1", expected_hash: await hash(), markdown: "The router picks one node." }, second);
    const judged = written.style_findings.shown.filter((f: any) => f.rule === "judgment.flat-hierarchy");
    expect(judged.length).toBeGreaterThan(0);
    expect(judged.some((f: any) => f.blocks_check)).toBe(false);
  });
});

describe("claims to check", () => {
  test("a write lists the absolute sentences it wrote, and docs_check neither lists nor fails on them", async () => {
    const written = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: await hash(), markdown: "The table lists every status code. Saves take a lock." }, task);
    expect(written.ok).toBe(true);
    // Only the sentence this write changed is listed: the untouched intro and legacy blocks are not.
    expect(written.claims_to_check).toEqual(["The table lists every status code."]);
    expect(written.next).toContain("Before docs_check, test each claim in claims_to_check against the source.");
    expect(written.next).toContain("docs_check does not test these claims, so this is their last check.");
    // A write that leaves the claim unchanged lists nothing.
    const intro = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: written.hash, markdown: "The table lists every status code. Saves take a lock." }, task);
    expect("claims_to_check" in intro).toBe(false);
    const checked = await call("docs_check", { path: "page" }, task);
    expect(checked.ok).toBe(true);
    expect("claims_to_check" in checked).toBe(false);
  });

  test("a claim names the code-marked names to find in the source, without the code marks", async () => {
    const ops = [{ type: "insertBlock", blockId: "svc", parentId: "root", index: 3, blockType: "list-item", props: {}, text: [
      { insert: "If the service is not healthy after 10 seconds, " }, { insert: "start", attributes: { code: true } },
      { insert: " fails and names " }, { insert: "service.log", attributes: { code: true } }, { insert: ". Saves take a lock." },
    ] }];
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops }, task);
    expect(written.claims_to_check).toEqual(["If the service is not healthy after 10 seconds, start fails and names service.log. [find: start, service.log]"]);
    expect(written.next).toContain("For each name after find:, search the source for it");
    expect(written.next).toContain("Make every claim and style fix in one docs_apply_ops batch");
  });

  test("a write lists a callout's title with its body claims, so a title its body narrows gets checked", async () => {
    const ops = [{ type: "insertBlock", blockId: "warn", parentId: "root", index: 3, blockType: "callout", props: { tone: "warning", title: "Refusals stop the install before any write" }, text: [
      { insert: "Each refusal below leaves all files unchanged. A file that changes after the plan stops the install, and files written before it stay written." },
    ] }];
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops }, task);
    expect(written.claims_to_check).toEqual([
      'Callout title "Refusals stop the install before any write" holds for every case its body names.',
      "Each refusal below leaves all files unchanged.",
    ]);
  });

  test("a write lists the sentences that say what code returns, refuses, or skips, and counts the ones past the cap", async () => {
    const sentences = Array.from({ length: 25 }, (_, i) => `Route ${i} returns 400 for a bad path.`);
    const written = await call("docs_write_text", { path: "page", blockId: "body", expected_hash: await hash(), markdown: `Saves take a lock. ${sentences.join(" ")}` }, task);
    expect(written.claims_to_check).toEqual(sentences.slice(0, 24));
    expect(written.claims_omitted).toBe(1);
    expect(written.next).toContain("read the whole function that holds it again");
    expect(written.next).toContain("guard for a missing or repeated value");
  });

  test("a write lists the call-stack and pseudocode rows that hold a condition, under their block id", async () => {
    const ops = [
      { type: "insertBlock", blockId: "cs", parentId: "root", index: 3, blockType: "call-stack", props: { frames: [
        { text: "POST /api/ops handler", frames: [
          { text: "ops.filter((op) => ACTION_REGISTRY.get(op.action))", comment: "finds forwarded actions" },
          { text: "store.applyDocOps(path, ops)" },
          { text: "expectedHash !== loaded.docHash", kind: "branch" },
        ] },
      ] } },
      { type: "insertBlock", blockId: "pc", parentId: "root", index: 4, blockType: "pseudocode", props: {},
        text: [{ insert: "laneClass(layout)\n  width = layout.width ?? \"text\"\n  log(width)" }] },
    ];
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops }, task);
    expect(written.ok).toBe(true);
    // A plain call row and a pseudocode line with no condition are not claims.
    expect(written.claims_to_check).toEqual([
      "cs: ops.filter((op) => ACTION_REGISTRY.get(op.action)) (finds forwarded actions)",
      "cs: expectedHash !== loaded.docHash",
      "pc: width = layout.width ?? \"text\"",
    ]);
  });

  test("a write lists the table rows, tree nodes, file notes, and stack notes that state a set or a behavior", async () => {
    const ops = [
      { type: "insertBlock", blockId: "tbl", parentId: "root", index: 3, blockType: "structured-table", props: { columns: ["Case", "Fix"], rows: [
        ["A symlink target", "Replace the link with a copy"],
        [[{ insert: "List " }, { insert: "react", attributes: { code: true } }, { insert: " in peers" }], "never in dependencies"],
        ["Each block has at most one parent", "Remove the second reference"],
      ] } },
      { type: "insertBlock", blockId: "ct", parentId: "root", index: 4, blockType: "component-tree", props: { nodes: [
        { text: "<DocBlockRenderer />", nodes: [
          { text: "root is missing", kind: "branch", comment: "renders null", source: "DocBlockRenderer.tsx:255" },
          { text: "<Lane />", comment: "one lane per root child" },
        ] },
      ] } },
      { type: "insertBlock", blockId: "ft", parentId: "root", index: 5, blockType: "file-tree", props: { entries: [
        { path: "src/", note: "Sources" },
        { path: "src/agent-schema", note: "The only path docs-model may import" },
      ] } },
      { type: "insertBlock", blockId: "st", parentId: "root", index: 6, blockType: "stack", props: {
        nodes: [
          { name: "Apps", detail: "Also import docs-server", children: [{ name: "docs-cli", detail: "CLI binary" }] },
          { name: "Model", children: [{ name: "docs-model", detail: "Never imports React" }] },
        ],
        boundaries: [{ after: "Apps", rule: "Model code never imports app code" }],
      } },
    ];
    const written = await call("docs_apply_ops", { path: "page", expected_hash: await hash(), ops }, task);
    expect(written.ok).toBe(true);
    // A row, node, or note with no set word, behavior word, or condition is not a claim. A layer's note always is.
    expect(written.claims_to_check).toEqual([
      "tbl: List react in peers | never in dependencies [find: react]",
      "tbl: Each block has at most one parent | Remove the second reference",
      "ct: root is missing (renders null) [find: DocBlockRenderer.tsx:255]",
      "ft: src/agent-schema (The only path docs-model may import)",
      "st: Apps: Also import docs-server",
      "st: docs-model: Never imports React",
      "st: rule after Apps: Model code never imports app code",
    ]);
  });
});
