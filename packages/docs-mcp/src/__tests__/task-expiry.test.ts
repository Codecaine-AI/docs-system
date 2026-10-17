import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import type { JudgmentEngine } from "../lint-feedback";
import { createInteractionService } from "../service";

const MIN = 60_000;
const HOUR = 60 * MIN;
const dense = `${Array(121).fill("words").join(" ")}.`;
const fixture: DocDocument = {
  schemaVersion: 1, id: "expiry", title: "Task Expiry", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["body"] },
    body: { id: "body", type: "paragraph", props: {}, children: [], text: [{ insert: "Original documentation." }] },
  },
};
const idleMessage = (id: string) => `Task ${id} expired after 30 minutes without a docs call. Your saved edits are kept. Call docs_begin again, then read docs_guidance topic "style".`;
const maxAgeMessage = (id: string) => `Task ${id} reached the 12-hour limit and was closed. Your saved edits are kept. Call docs_begin again, then read docs_guidance topic "style".`;
const endedMessage = (id: string) => `Task ${id} was ended with docs_end. Call docs_begin for new edits.`;
const UNKNOWN = { ok: false, detail: "Unknown task for this workspace." };

let workspace: string;
let clock: number;
let project: string;
let services: ReturnType<typeof createInteractionService>[];
const now = () => clock;
const advance = (ms: number) => { clock += ms; };

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "codecaine-task-expiry-"));
  await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "alpha" }]));
  await mkdir(join(workspace, "alpha/docs/page"), { recursive: true });
  await writeFile(join(workspace, "alpha/docs/page/doc.json"), serializeDocDocument(fixture));
  clock = Date.UTC(2026, 9, 16, 12);
  services = [];
});
afterEach(async () => {
  // The store indexes backlinks best-effort after each write.
  await Bun.sleep(30);
  for (const service of services) service.close();
  await rm(workspace, { recursive: true, force: true });
});

/** A service on the injected clock, discovered in the test workspace. */
async function open(options: Parameters<typeof createInteractionService>[0] = {}) {
  const service = createInteractionService({ judgmentEngine: null, now, ...options });
  services.push(service);
  const invoke = async (name: string, args: Record<string, unknown> = {}) =>
    (await service.call(workspace, name, args)).structuredContent as Record<string, any>;
  const found = await invoke("docs_discover");
  project = found.projects[0].id;
  const begin = async () => {
    const task = await invoke("docs_begin");
    expect((await invoke("docs_guidance", { task_id: task.task_id, topic: "style" })).ok).toBe(true);
    return task.task_id as string;
  };
  const write = async (task_id: string, markdown: string) => {
    const read = await invoke("docs_read", { project, path: "page" });
    return invoke("docs_write_text", { task_id, project, path: "page", blockId: "body", expected_hash: read.hash, markdown });
  };
  return { service, invoke, begin, write };
}

describe("idle expiry", () => {
  test("a task used every 10 minutes survives; 31 idle minutes retire it with the idle message", async () => {
    const { service, invoke, begin, write } = await open();
    const id = await begin();
    for (let i = 0; i < 3; i++) {
      advance(10 * MIN);
      expect((await invoke("docs_check", { project, path: "page", task_id: id })).ok).toBe(true);
    }
    advance(29 * MIN);
    expect(service.stats().tasks).toBe(1);
    expect((await write(id, "Still mine after 29 idle minutes.")).ok).toBe(true);
    advance(31 * MIN);
    expect(service.stats().tasks).toBe(0);
    expect(await write(id, "Too late.")).toEqual({ ok: false, detail: idleMessage(id) });
    expect(await invoke("docs_guidance", { task_id: id, topic: "style" })).toEqual({ ok: false, detail: idleMessage(id) });
    // The saved edit stays saved.
    expect((await invoke("docs_read", { project, path: "page" })).markdown).toContain("Still mine after 29 idle minutes.");
  });

  test("the 12-hour ceiling retires a task used every 10 minutes", async () => {
    const { invoke, begin } = await open();
    const id = await begin();
    for (let i = 0; i < 72; i++) {
      advance(10 * MIN);
      expect((await invoke("docs_guidance", { task_id: id })).ok).toBe(true);
    }
    advance(10 * MIN);
    expect(await invoke("docs_guidance", { task_id: id })).toEqual({ ok: false, detail: maxAgeMessage(id) });
    expect(await invoke("docs_check", { project, path: "page", task_id: id })).toEqual({ ok: false, detail: maxAgeMessage(id) });
  });

  test("docs_end then reuse returns the ended message on every task call", async () => {
    const { invoke, begin, write } = await open();
    const id = await begin();
    expect((await invoke("docs_end", { task_id: id })).ended).toBe(true);
    const ended = { ok: false, detail: endedMessage(id) };
    expect(await write(id, "After the end.")).toEqual(ended);
    expect(await invoke("docs_guidance", { task_id: id })).toEqual(ended);
    expect(await invoke("docs_end", { task_id: id })).toEqual(ended);
    expect(await invoke("docs_check", { project, path: "page", task_id: id })).toEqual(ended);
  });

  test("stats() sweeps, reports the newest task use, and the cap counts live tasks only", async () => {
    const { service, invoke, begin } = await open({ maxTasks: 2 });
    expect(service.stats()).toMatchObject({ tasks: 0, newestTaskUseMs: null });
    await begin();
    advance(5 * MIN);
    const second = await begin();
    advance(2 * MIN);
    expect(service.stats()).toMatchObject({ tasks: 2, newestTaskUseMs: 2 * MIN });
    const refused = await invoke("docs_begin");
    expect(refused.ok).toBe(false);
    expect(refused.detail).toBe("Too many open authoring activities (2). The longest-idle one has been idle 7 minutes; tasks expire after 30 minutes without a docs call. End finished tasks with docs_end.");
    // The first task goes idle past 30 minutes; the second stays in use.
    advance(20 * MIN);
    expect((await invoke("docs_guidance", { task_id: second })).ok).toBe(true);
    advance(5 * MIN);
    expect(service.stats()).toMatchObject({ tasks: 1, newestTaskUseMs: 5 * MIN });
    expect((await invoke("docs_begin")).ok).toBe(true);
    advance(31 * MIN);
    expect(service.stats()).toMatchObject({ tasks: 0, newestTaskUseMs: null });
  });
});

describe("task ids on reads", () => {
  test("ordinary reads ignore expired, ended and unknown task ids; docs_check reports each", async () => {
    const { invoke, begin } = await open();
    const expired = await begin();
    advance(31 * MIN);
    const ended = await begin();
    await invoke("docs_end", { task_id: ended });
    const reads: [string, Record<string, unknown>][] = [
      ["docs_read", { project, path: "page" }],
      ["docs_tree", { project }],
      ["docs_search", { project, query: "Original" }],
    ];
    for (const [name, args] of reads) {
      const plain = await invoke(name, args);
      expect([name, plain.ok]).toEqual([name, true]);
      for (const task_id of [expired, ended, "missing"]) expect([name, await invoke(name, { ...args, task_id })]).toEqual([name, plain]);
    }
    const target = { project, path: "page" };
    expect(await invoke("docs_check", { ...target, task_id: expired })).toEqual({ ok: false, detail: idleMessage(expired) });
    expect(await invoke("docs_check", { ...target, task_id: ended })).toEqual({ ok: false, detail: endedMessage(ended) });
    expect(await invoke("docs_check", { ...target, task_id: "missing" })).toEqual(UNKNOWN);
  });

  test("a read with a live task id does not refresh it", async () => {
    const { service, invoke, begin } = await open();
    const id = await begin();
    advance(20 * MIN);
    expect((await invoke("docs_read", { project, path: "page", task_id: id })).ok).toBe(true);
    advance(11 * MIN);
    expect(service.stats().tasks).toBe(0);
  });
});

describe("guidance snapshot interning", () => {
  test("tasks on the same guidance share one snapshot object until all of them retire", async () => {
    const { invoke, begin } = await open();
    const component = async (task_id: string) => (await invoke("docs_guidance", { task_id, component: "state-shape" })).component;
    const first = await begin();
    const second = await begin();
    const shared = await component(first);
    expect(Object.is(await component(second), shared)).toBe(true);
    await invoke("docs_end", { task_id: first });
    const third = await begin();
    expect(Object.is(await component(third), shared)).toBe(true);
    await invoke("docs_end", { task_id: second });
    await invoke("docs_end", { task_id: third });
    const fresh = await begin();
    const reloaded = await component(fresh);
    expect(reloaded.name).toBe("state-shape");
    expect(Object.is(reloaded, shared)).toBe(false);
  });
});

describe("in-flight pinning", () => {
  test("a write paused past the idle limit keeps its task and baseline; expiry counts from the end of the call", async () => {
    let entered!: () => void;
    let release!: () => void;
    const judging = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const engine: JudgmentEngine = { judge: async () => { entered(); await gate; return []; } };
    const { service, invoke, begin } = await open({ judgmentEngine: engine });
    const id = await begin();
    const read = await invoke("docs_read", { project, path: "page" });
    const pending = invoke("docs_apply_ops", {
      task_id: id, project, path: "page", expected_hash: read.hash,
      ops: [
        { type: "insertBlock", blockId: "dense", parentId: "root", index: 1, blockType: "paragraph", props: {}, text: [{ insert: dense }] },
        { type: "insertBlock", blockId: "bullet", parentId: "root", index: 2, blockType: "list-item", props: {}, text: [{ insert: "One short bullet." }] },
      ],
    });
    await Promise.race([judging, Bun.sleep(10_000).then(() => { throw new Error("The judgment engine was never called."); })]);
    // The sweep runs mid-call, past both limits.
    advance(13 * HOUR);
    expect(service.stats()).toMatchObject({ tasks: 1, newestTaskUseMs: 0 });
    release();
    const written = await pending;
    expect(written.ok).toBe(true);
    expect(written.style_gate_open).toBe(1);
    // Expiry counts from the end of the call; the 12-hour ceiling still applies on the next sweep after it.
    expect(service.stats().tasks).toBe(0);
    expect(await invoke("docs_check", { project, path: "page", task_id: id })).toEqual({ ok: false, detail: maxAgeMessage(id) });
  });

  test("an idle limit counts from the end of a paused call", async () => {
    let entered!: () => void;
    let release!: () => void;
    const judging = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const engine: JudgmentEngine = { judge: async () => { entered(); await gate; return []; } };
    const { service, invoke, begin } = await open({ judgmentEngine: engine });
    const id = await begin();
    const read = await invoke("docs_read", { project, path: "page" });
    const pending = invoke("docs_apply_ops", {
      task_id: id, project, path: "page", expected_hash: read.hash,
      ops: [{ type: "insertBlock", blockId: "bullet", parentId: "root", index: 1, blockType: "list-item", props: {}, text: [{ insert: "One short bullet." }] }],
    });
    await Promise.race([judging, Bun.sleep(10_000).then(() => { throw new Error("The judgment engine was never called."); })]);
    advance(45 * MIN);
    expect(service.stats().tasks).toBe(1);
    release();
    expect((await pending).ok).toBe(true);
    advance(30 * MIN);
    expect(service.stats().tasks).toBe(1);
    advance(1);
    expect(service.stats().tasks).toBe(0);
    expect(await invoke("docs_check", { project, path: "page", task_id: id })).toEqual({ ok: false, detail: idleMessage(id) });
  });
});

describe("lifecycle and settings", () => {
  test("close() clears the sweep interval", () => {
    const set = spyOn(globalThis, "setInterval");
    const clear = spyOn(globalThis, "clearInterval");
    try {
      const service = createInteractionService({ judgmentEngine: null });
      const index = set.mock.calls.findIndex((args) => args[1] === 60_000);
      expect(index).toBeGreaterThanOrEqual(0);
      const handle = set.mock.results[index]!.value;
      service.close();
      expect(clear).toHaveBeenCalledWith(handle);
    } finally {
      set.mockRestore();
      clear.mockRestore();
    }
  });

  test("invalid env overrides fall back to the defaults with one warning each", async () => {
    const saved = { idle: process.env.CODECAINE_DOCS_TASK_IDLE_MS, age: process.env.CODECAINE_DOCS_TASK_MAX_AGE_MS };
    const warn = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const value of ["0", "-1", "abc", "Infinity"]) {
        process.env.CODECAINE_DOCS_TASK_IDLE_MS = value;
        process.env.CODECAINE_DOCS_TASK_MAX_AGE_MS = value;
        warn.mockClear();
        // Idle: the 30-minute default.
        const idle = await open({ now });
        const a = await idle.begin();
        expect(warn.mock.calls.map(([message]) => String(message).split("=")[0])).toEqual(["CODECAINE_DOCS_TASK_IDLE_MS", "CODECAINE_DOCS_TASK_MAX_AGE_MS"]);
        advance(29 * MIN);
        expect([value, idle.service.stats().tasks]).toEqual([value, 1]);
        advance(2 * MIN);
        expect([value, idle.service.stats().tasks]).toEqual([value, 0]);
        expect(await idle.invoke("docs_guidance", { task_id: a })).toEqual({ ok: false, detail: idleMessage(a) });
        // Max age: the 12-hour default, with the idle limit out of the way.
        const aged = await open({ now, taskIdleMs: 48 * HOUR });
        const b = await aged.begin();
        advance(12 * HOUR);
        expect([value, aged.service.stats().tasks]).toEqual([value, 1]);
        advance(1);
        expect(await aged.invoke("docs_guidance", { task_id: b })).toEqual({ ok: false, detail: maxAgeMessage(b) });
      }
    } finally {
      warn.mockRestore();
      for (const [key, value] of [["CODECAINE_DOCS_TASK_IDLE_MS", saved.idle], ["CODECAINE_DOCS_TASK_MAX_AGE_MS", saved.age]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  test("a valid env override sets the idle limit and its message", async () => {
    const saved = process.env.CODECAINE_DOCS_TASK_IDLE_MS;
    process.env.CODECAINE_DOCS_TASK_IDLE_MS = "120000";
    try {
      const { service, invoke, begin } = await open();
      const id = await begin();
      advance(2 * MIN + 1);
      expect(service.stats().tasks).toBe(0);
      expect(await invoke("docs_guidance", { task_id: id })).toEqual({
        ok: false, detail: `Task ${id} expired after 2 minutes without a docs call. Your saved edits are kept. Call docs_begin again, then read docs_guidance topic "style".`,
      });
    } finally {
      if (saved === undefined) delete process.env.CODECAINE_DOCS_TASK_IDLE_MS; else process.env.CODECAINE_DOCS_TASK_IDLE_MS = saved;
    }
  });
});

describe("tombstones", () => {
  test("a retired task's id answers with the generic message in another workspace", async () => {
    const { invoke, begin, service } = await open();
    const id = await begin();
    await invoke("docs_end", { task_id: id });
    const other = join(workspace, "alpha");
    const elsewhere = async (name: string, args: Record<string, unknown>) => (await service.call(other, name, args)).structuredContent;
    expect(await elsewhere("docs_guidance", { task_id: id })).toEqual(UNKNOWN);
    expect(await elsewhere("docs_end", { task_id: id })).toEqual(UNKNOWN);
    expect(await invoke("docs_guidance", { task_id: id })).toEqual({ ok: false, detail: endedMessage(id) });
  });

  test("a tombstone is dropped after 24 hours", async () => {
    const { invoke, begin } = await open();
    const id = await begin();
    await invoke("docs_end", { task_id: id });
    advance(24 * HOUR);
    expect(await invoke("docs_guidance", { task_id: id })).toEqual({ ok: false, detail: endedMessage(id) });
    advance(1);
    expect(await invoke("docs_guidance", { task_id: id })).toEqual(UNKNOWN);
  });

  test("only the newest maxRetired tombstones are kept", async () => {
    const { invoke, begin } = await open({ maxRetired: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await begin();
      await invoke("docs_end", { task_id: id });
      ids.push(id);
    }
    expect(await invoke("docs_guidance", { task_id: ids[0] })).toEqual(UNKNOWN);
    for (const id of ids.slice(1)) expect(await invoke("docs_guidance", { task_id: id })).toEqual({ ok: false, detail: endedMessage(id) });
  });
});
