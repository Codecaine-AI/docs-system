import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import type { SequenceLinter } from "@codecaine-ai/docs-server/component-lints";
import { createDocsTools, type DocsTool, type DocsToolCallContext, type DocsToolContext } from "../tools";
import { createInteractionService } from "../service";

const fixture: DocDocument = {
  schemaVersion: 1, id: "feedback", title: "Feedback", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["intro", "board", "flow"] },
    intro: { id: "intro", type: "paragraph", props: {}, children: [], text: [{ insert: "This page holds one board and one flow." }] },
    board: { id: "board", type: "canvas", props: { src: "./assets/canvases/board.canvas.json" }, children: [] },
    flow: { id: "flow", type: "sequence", props: { src: "./assets/sequences/flow.sequence.json" }, children: [] },
  },
};
const board = { schemaVersion: 1, id: "board", mode: "diagram", objects: [], connections: [], links: [], annotations: [] };
const flow = {
  version: 1, id: "flow", title: "Flow", style: {},
  participants: [{ id: "client", name: "client", kind: "actor" }, { id: "service", name: "service", kind: "participant" }],
  items: [{ kind: "message", id: "m1", from: "client", to: "service", line: "sync", text: "request" }],
};
const GATEWAY = { id: "gateway", type: "process", text: "Gateway", geometry: { x: 96, y: 96, width: 288, height: 96 } };
/** A box over most of GATEWAY, which the canvas covered-content lint reports. */
const CACHE_ON_GATEWAY = { id: "cache", type: "process", text: "Cache", geometry: { x: 128, y: 96, width: 288, height: 96 } };
const PROGRAM = "participant 1 text=client kind=actor\nparticipant 2 text=service\n\nseq\n  1 > 2 text=request\n  2 --> 1 text=response\n";
const task: DocsToolCallContext = { taskId: "task-1" };
/** The sequence package's crossed-columns lint: a message that crosses 2 or more other lifelines. */
const crossedColumns: SequenceLinter = (sequence) => {
  const column = new Map(sequence.participants.map((participant, index) => [participant.id, index]));
  return sequence.items.flatMap((item) => item.kind === "message" && Math.abs(column.get(item.from)! - column.get(item.to)!) > 2
    ? [{ rule: "crossed-columns", severity: "info" as const, message: `"${item.text}" crosses 2 other columns.`, target: item.id }] : []);
};
const CROSSING_PROGRAM = "participant 1 text=client\nparticipant 2 text=gateway\nparticipant 3 text=cache\nparticipant 4 text=service\n\nseq\n  1 > 4 text=request\n  4 --> 1 text=response\n";
let temp: string;
let tools: DocsTool[];
let context: DocsToolContext;
async function call(name: string, args: Record<string, unknown>, ctx?: DocsToolCallContext) {
  const tool = tools.find((entry) => entry.name === name)!;
  return (await tool.execute({ project: "a", path: "page", ...args }, ctx)).structuredContent as Record<string, any>;
}
async function hashes(blockId: string) {
  const read = await call("docs_component_read", { blockId });
  expect(read.ok).toBe(true);
  return { blockId, expected_hash: read.doc_hash, expected_component_hash: read.hash };
}
const component = (checked: Record<string, any>, blockId: string) => checked.components.find((entry: any) => entry.blockId === blockId);

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-components-"));
  await mkdir(join(temp, "page/assets/canvases"), { recursive: true });
  await mkdir(join(temp, "page/assets/sequences"), { recursive: true });
  await writeFile(join(temp, "page/doc.json"), serializeDocDocument(fixture));
  await writeFile(join(temp, "page/assets/canvases/board.canvas.json"), JSON.stringify(board));
  await writeFile(join(temp, "page/assets/sequences/flow.sequence.json"), JSON.stringify(flow));
  const pinned = new Map<string, unknown>();
  const store = <T>() => ({ get: (taskId: string, key: string) => pinned.get(`${taskId}|${key}`) as T | undefined, set: (taskId: string, key: string, value: T) => { pinned.set(`${taskId}|${key}`, value); } });
  context = { resolveProject: async (id) => ({ id, docsRoot: temp }), taskBaselines: store(), taskCanvasBaselines: store() };
  tools = createDocsTools(context);
});
afterEach(async () => {
  // The store indexes backlinks best-effort after each write.
  await Bun.sleep(30);
  await rm(temp, { recursive: true, force: true });
});

describe("component feedback", () => {
  test("a sequence program edit returns the saved program, an SVG file and findings", async () => {
    const saved = await call("docs_sequence_set_program", { ...await hashes("flow"), params: { program: PROGRAM } }, task);
    expect(saved.ok).toBe(true);
    // The program as saved: setProgram keeps the title the program left out.
    expect(saved.program).toBe(`title "Flow"\n${PROGRAM.trimEnd()}`);
    expect(saved.component_findings).toEqual({ shown: [], omitted: 0 });
    // Feedback and the render lead, so a client that shows only the start of a result still sees them.
    expect(Object.keys(saved).slice(0, 5)).toEqual(["ok", "component_findings", "svg_path", "program", "next"]);
    expect((await stat(saved.svg_path)).isFile()).toBe(true);
    const svg = await readFile(saved.svg_path, "utf8");
    expect(svg).toStartWith("<svg");
    expect(svg).toContain("response");
    // The render lives in the server's cache, never in the docs root as a corpus asset.
    expect(saved.svg_path.startsWith(temp)).toBe(false);
    await rm(saved.svg_path);
  });

  test("a sequence program the sequence diagnostics flag is refused with its findings, and a flagged sidecar shows in docs_check", async () => {
    const refused = await call("docs_sequence_set_program", { ...await hashes("flow"), params: { program: "participant 1 text=client\n\nseq\n  1 > 3 text=request\n" } }, task);
    expect(refused.ok).toBe(false);
    expect(refused.component_findings.shown.length).toBeGreaterThan(0);
    expect(refused.component_findings.shown[0]).toMatchObject({ rule: "sequence-program", severity: "error" });
    expect(refused.component_findings.shown[0].problem).toMatch(/^Line 4: /);
    expect(JSON.parse(await readFile(join(temp, "page/assets/sequences/flow.sequence.json"), "utf8"))).toEqual(flow);

    // The same defect seeded in the sidecar: a message to a participant the program never declared.
    const seeded = { ...flow, items: [{ ...flow.items[0], to: "ghost" }] };
    await writeFile(join(temp, "page/assets/sequences/flow.sequence.json"), JSON.stringify(seeded));
    const checked = await call("docs_check", {});
    expect(checked.ok).toBe(false);
    expect(component(checked, "flow")).toMatchObject({ type: "sequence", ok: false, findings: { shown: [{ rule: "sequence-schema", severity: "error", problem: '/items/0/to: unknown participant id "ghost"' }], omitted: 0 } });
  });

  test("a sequence lint finding is a warning on the edit and in docs_check, and never blocks either", async () => {
    tools = createDocsTools({ ...context, sequenceLinter: crossedColumns });
    const saved = await call("docs_sequence_set_program", { ...await hashes("flow"), params: { program: CROSSING_PROGRAM } }, task);
    expect(saved.ok).toBe(true);
    const warnings = saved.component_findings.shown;
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ rule: "crossed-columns", severity: "warning", problem: '"request" crosses 2 other columns.' });
    expect(saved.next).toContain("never block");
    // The write applied: the sidecar holds the four participants.
    const sidecar = JSON.parse(await readFile(join(temp, "page/assets/sequences/flow.sequence.json"), "utf8"));
    expect(sidecar.participants).toHaveLength(4);
    expect(warnings[0].at).toEqual([sidecar.items[0].id]);
    await rm(saved.svg_path);

    const checked = await call("docs_check", {}, task);
    expect(component(checked, "flow")).toMatchObject({ type: "sequence", ok: true, findings: { shown: warnings, omitted: 0 } });
    expect(checked.ok).toBe(true);
  });

  test("creating a sequence sidecar the lints flag returns their warnings, saves it, and docs_check still passes", async () => {
    tools = createDocsTools({ ...context, sequenceLinter: crossedColumns });
    const participants = ["client", "gateway", "cache", "service"].map((name) => ({ id: name, name, kind: "participant" }));
    const document = { version: 1, id: "wide", title: "Wide", style: {}, participants,
      items: [{ kind: "message", id: "m1", from: "client", to: "service", line: "sync", text: "request" }] };
    const read = await call("docs_read", {});
    const created = await call("docs_component_create", { expected_hash: read.hash, component: "sequence", src: "./assets/sequences/wide.sequence.json", document }, task);
    expect(created.ok).toBe(true);
    expect(created.component_findings).toEqual({ shown: [{ rule: "crossed-columns", severity: "warning", at: ["m1"], problem: '"request" crosses 2 other columns.' }], omitted: 0 });
    expect(created.next).toContain("never block");
    expect(JSON.parse(await readFile(join(temp, "page/assets/sequences/wide.sequence.json"), "utf8")).participants).toHaveLength(4);
    expect((await call("docs_check", {}, task)).ok).toBe(true);
  });

  test("without lintSequence in the sequence package, a sequence edit and docs_check carry no lint findings and no error", async () => {
    tools = createDocsTools({ ...context, sequenceLinter: null });
    const saved = await call("docs_sequence_set_program", { ...await hashes("flow"), params: { program: CROSSING_PROGRAM } }, task);
    expect(saved.ok).toBe(true);
    expect(saved.component_findings).toEqual({ shown: [], omitted: 0 });
    await rm(saved.svg_path);
    const checked = await call("docs_check", {}, task);
    expect(component(checked, "flow")).toEqual({ blockId: "flow", type: "sequence", ok: true, touched_by_task: false });
    expect(checked.ok).toBe(true);
  });

  test("a canvas edit that puts a box on another box reports it on the edit and in docs_check for the task", async () => {
    const first = await call("docs_canvas_add_object", { ...await hashes("board"), params: { object: GATEWAY } }, task);
    expect(first.component_findings).toEqual({ shown: [], omitted: 0 });
    const edited = await call("docs_canvas_add_object", { ...await hashes("board"), params: { object: CACHE_ON_GATEWAY } }, task);
    expect(edited.ok).toBe(true);
    expect(edited.component_findings.shown).toContainEqual(expect.objectContaining({ rule: "covered-content", severity: "error", at: expect.arrayContaining(["cache"]) }));
    expect(edited.next).toBe("Changes are saved. Fix component_findings, then run docs_check with task_id.");

    const checked = await call("docs_check", {}, task);
    expect(checked.ok).toBe(false);
    const entry = component(checked, "board");
    expect(entry).toMatchObject({ ok: false, touched_by_task: true });
    expect(entry.findings.shown).toContainEqual(expect.objectContaining({ rule: "covered-content", at: expect.arrayContaining(["cache"]) }));

    // Moving the box clear of the other one clears the finding.
    const moved = await call("docs_canvas_update_object", { ...await hashes("board"), params: { objectId: "cache", patch: { geometry: { x: 480, y: 96, width: 288, height: 96 } } } }, task);
    expect(moved.ok).toBe(true);
    expect(moved.component_findings).toEqual({ shown: [], omitted: 0 });
    expect((await call("docs_check", {}, task)).ok).toBe(true);
  });

  test("without a task, docs_check reports a board's overlap and blocks on it", async () => {
    await writeFile(join(temp, "page/assets/canvases/board.canvas.json"), JSON.stringify({ ...board, objects: [GATEWAY, CACHE_ON_GATEWAY] }));
    const checked = await call("docs_check", {});
    expect(component(checked, "board").ok).toBe(false);
    expect(component(checked, "board").findings.shown.map((finding: any) => finding.rule)).toContain("covered-content");
    expect(checked.ok).toBe(false);
  });

  test("under a task, a board's pre-existing finding is reported but blocks docs_check only once the task touches the board", async () => {
    const object = { ...GATEWAY, id: "other", geometry: { x: 96, y: 480, width: 288, height: 96 } };
    await writeFile(join(temp, "page/assets/canvases/board.canvas.json"), JSON.stringify({ ...board, objects: [GATEWAY, CACHE_ON_GATEWAY] }));
    const read = await call("docs_read", {});
    const prose = await call("docs_write_text", { blockId: "intro", expected_hash: read.hash, markdown: "This page holds a board and a flow." }, task);
    expect(prose.ok).toBe(true);

    const untouched = await call("docs_check", {}, task);
    expect(untouched.style_gate).toEqual([]);
    expect(component(untouched, "board")).toMatchObject({ ok: false, touched_by_task: false });
    expect(component(untouched, "board").findings.shown).toContainEqual(expect.objectContaining({ rule: "covered-content", at: expect.arrayContaining(["cache"]) }));
    expect(untouched.ok).toBe(true);

    // A refused edit leaves the board untouched.
    const stale = await call("docs_canvas_add_object", { ...await hashes("board"), expected_component_hash: "stale", params: { object } }, task);
    expect(stale.ok).toBe(false);
    expect((await call("docs_check", {}, task)).ok).toBe(true);

    // An unreadable block fails the check although the task never touched it.
    await rm(join(temp, "page/assets/sequences/flow.sequence.json"));
    const missing = await call("docs_check", {}, task);
    expect(component(missing, "flow")).toMatchObject({ ok: false, touched_by_task: false });
    expect(missing.ok).toBe(false);
    await writeFile(join(temp, "page/assets/sequences/flow.sequence.json"), JSON.stringify(flow));

    expect((await call("docs_canvas_add_object", { ...await hashes("board"), params: { object } }, task)).ok).toBe(true);
    const touched = await call("docs_check", {}, task);
    expect(component(touched, "board")).toMatchObject({ ok: false, touched_by_task: true });
    expect(component(touched, "board").findings.shown).toContainEqual(expect.objectContaining({ at: expect.arrayContaining(["cache"]) }));
    expect(touched.ok).toBe(false);
  });

  test("through the service, a task's canvas edit marks the board touched in docs_check and the style read gate still refuses writes", async () => {
    const workspace = join(temp, "workspace");
    await mkdir(join(workspace, "alpha/docs"), { recursive: true });
    await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "alpha" }]));
    await cp(join(temp, "page"), join(workspace, "alpha/docs/page"), { recursive: true });
    const service = createInteractionService({ judgmentEngine: null });
    try {
      const invoke = async (name: string, args: Record<string, unknown> = {}) =>
        (await service.call(workspace, name, args)).structuredContent as Record<string, any>;
      const project = (await invoke("docs_capabilities")).projects[0].id;
      const { task_id } = await invoke("docs_begin");
      const read = await invoke("docs_component_read", { project, path: "page", blockId: "board" });
      const args = { task_id, project, path: "page", blockId: "board", expected_hash: read.doc_hash, expected_component_hash: read.hash, params: { object: GATEWAY } };
      expect((await invoke("docs_canvas_add_object", args)).detail).toContain('topic "style"');
      expect((await invoke("docs_guidance", { task_id, topic: "style" })).ok).toBe(true);
      expect((await invoke("docs_canvas_add_object", args)).ok).toBe(true);
      const checkBoard = async (extra: Record<string, unknown>) => component(await invoke("docs_check", { project, path: "page", ...extra }), "board");
      expect(await checkBoard({ task_id })).toMatchObject({ ok: true, touched_by_task: true });
      // Without the task, docs_check marks no board as touched.
      expect(await checkBoard({})).not.toHaveProperty("touched_by_task");
    } finally { service.close(); }
  });
});
