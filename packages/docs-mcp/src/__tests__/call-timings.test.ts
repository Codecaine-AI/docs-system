import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { withPathLock } from "@codecaine-ai/docs-server/path-mutex";
import { createInteractionService } from "../service";
import type { JudgmentEngine } from "../lint-feedback";

/** Each service tool call writes one call-timings line holding only its own store-lock wait and Jev span. */

const page: DocDocument = {
  schemaVersion: 1, id: "page", title: "Page", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["lead", "a", "b"] },
    lead: { id: "lead", type: "paragraph", props: {}, children: [], text: [{ insert: "The loader has two steps." }] },
    a: { id: "a", type: "list-item", props: {}, children: [], text: [{ insert: "It reads the file." }] },
    b: { id: "b", type: "list-item", props: {}, children: [], text: [{ insert: "It parses the file." }] },
  },
};
const LOCK_HOLD_MS = 150, JUDGE_MS = 120, THROWING_JUDGE_MS = 80;
let temp: string, timings: string, savedEnv: Record<string, string | undefined>;
let judgeMode: "slow" | "throws" = "slow";
const engine: JudgmentEngine = {
  async judge() {
    await Bun.sleep(judgeMode === "slow" ? JUDGE_MS : THROWING_JUDGE_MS);
    if (judgeMode === "throws") throw new Error("judge unavailable");
    return [];
  },
};
const lines = async () => (await readFile(timings, "utf8")).trim().split("\n").map((line) => JSON.parse(line));

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-mcp-call-timings-")));
  timings = join(temp, "timings/call-timings.jsonl");
  savedEnv = { file: process.env.CODECAINE_DOCS_CALL_TIMINGS_FILE, build: process.env.CODECAINE_DOCS_BUILD };
  process.env.CODECAINE_DOCS_CALL_TIMINGS_FILE = timings;
  // A managed service pins its build from the environment instead of hashing the source tree.
  process.env.CODECAINE_DOCS_BUILD = "call-timings-test";
  await writeFile(join(temp, "members.json"), JSON.stringify([{ dir: "alpha" }, { dir: "beta" }]));
  for (const member of ["alpha", "beta"]) {
    await mkdir(join(temp, member, "docs/page"), { recursive: true });
    await writeFile(join(temp, member, "docs/page/doc.json"), serializeDocDocument(page));
  }
});
afterEach(async () => {
  process.env.CODECAINE_DOCS_CALL_TIMINGS_FILE = savedEnv.file;
  if (savedEnv.build === undefined) delete process.env.CODECAINE_DOCS_BUILD; else process.env.CODECAINE_DOCS_BUILD = savedEnv.build;
  await rm(temp, { recursive: true, force: true });
});

test("concurrent calls each record only their own lock wait and judge span, and each result names its line", async () => {
  const service = createInteractionService({ managed: true, judgmentEngine: engine });
  try {
    const invoke = async (name: string, args: Record<string, unknown> = {}) => (await service.call(temp, name, args)).structuredContent as Record<string, any>;
    const { projects } = await invoke("docs_discover");
    const project = (member: string) => projects.find((p: any) => p.docsRoot.startsWith(join(temp, member))).id;
    const { task_id } = await invoke("docs_begin");
    expect((await invoke("docs_guidance", { task_id, topic: "style" })).ok).toBe(true);
    const alpha = await invoke("docs_read", { project: project("alpha"), path: "page" });
    const beta = await invoke("docs_read", { project: project("beta"), path: "page" });

    // beta's store lock is held, so the move preview waits on it; the write on alpha runs the slow judge meanwhile.
    let waiting!: Promise<Record<string, any>>, judged!: Promise<Record<string, any>>;
    await withPathLock(join(temp, "beta/docs/.changesets/.store-operation-lock"), async () => {
      waiting = invoke("docs_move", { task_id, project: project("beta"), path: "page", to: "moved", expected_hash: beta.hash });
      judged = invoke("docs_write_text", { task_id, project: project("alpha"), path: "page", blockId: "a", expected_hash: alpha.hash, markdown: "It reads the whole file." });
      await Bun.sleep(LOCK_HOLD_MS);
    });
    const [moved, written] = await Promise.all([waiting, judged]);
    expect(moved.ok).toBe(true);
    expect(written).toMatchObject({ ok: true });

    const byId = new Map((await lines()).map((line) => [line.call_id, line]));
    const moveLine = byId.get(moved.call_id), writeLine = byId.get(written.call_id);
    expect(moveLine).toMatchObject({ tool: "docs_move", ok: true, jev_span_ms: 0 });
    expect(moveLine.store_lock_wait_ms).toBeGreaterThanOrEqual(LOCK_HOLD_MS - 20);
    expect(writeLine).toMatchObject({ tool: "docs_write_text", ok: true });
    expect(writeLine.jev_span_ms).toBeGreaterThanOrEqual(JUDGE_MS - 5);
    expect(writeLine.store_lock_wait_ms).toBeLessThan(LOCK_HOLD_MS / 2);
    for (const line of [moveLine, writeLine]) {
      expect(Object.keys(line)).toEqual(["ts", "tool", "call_id", "total_ms", "store_lock_wait_ms", "jev_span_ms", "ok"]);
      expect(line.total_ms).toBeGreaterThanOrEqual(line.store_lock_wait_ms);
      expect(line.total_ms).toBeGreaterThanOrEqual(line.jev_span_ms);
    }
    console.log(JSON.stringify(writeLine));

    // A judge that throws is advisory: the write still saves, and the span until the throw still counts.
    judgeMode = "throws";
    const again = await invoke("docs_read", { project: project("alpha"), path: "page" });
    const failed = await invoke("docs_write_text", { task_id, project: project("alpha"), path: "page", blockId: "b", expected_hash: again.hash, markdown: "It parses the whole file." });
    expect(failed.ok).toBe(true);
    const thrownLine = (await lines()).find((line) => line.call_id === failed.call_id);
    expect(thrownLine.jev_span_ms).toBeGreaterThanOrEqual(THROWING_JUDGE_MS - 5);
    expect(thrownLine.jev_span_ms).toBeLessThan(JUDGE_MS);
  } finally { judgeMode = "slow"; service.close(); }
});
