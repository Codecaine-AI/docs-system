import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { componentGuidance } from "../../docs-model/src/authoring-guidance";
import { loadGuidance } from "./guidance";
import { createInteractionService } from "./service";
import { STYLE_DIGEST } from "./style-digest";

const fixture: DocDocument = {
  schemaVersion: 1, id: "review", title: "Service Review", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["body"] },
    body: { id: "body", type: "paragraph", props: {}, children: [], text: [{ insert: "Original documentation." }] },
  },
};
let workspace: string;
let service: ReturnType<typeof createInteractionService>;
let ids: Record<string, string>;
const invoke = async (name: string, args: Record<string, unknown> = {}, cwd = workspace) => {
  const result = await service.call(cwd, name, args);
  return result.structuredContent as Record<string, any>;
};
const STYLE_GATE = 'Read the style guide before your first edit: call docs_guidance with task_id and topic "style". Required once per task.';
/** Begin a task and satisfy its read-before-write gate. */
const beginEditing = async (cwd = workspace) => {
  const task = await invoke("docs_begin", {}, cwd);
  expect((await invoke("docs_guidance", { task_id: task.task_id, topic: "style" }, cwd)).ok).toBe(true);
  return task;
};
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "codecaine-service-review-"));
  await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "alpha" }, { dir: "beta" }]));
  for (const name of ["alpha", "beta"]) {
    await mkdir(join(workspace, name, "docs/page"), { recursive: true });
    await writeFile(join(workspace, name, "docs/page/doc.json"), serializeDocDocument(fixture));
  }
  service = createInteractionService();
  const found = await invoke("docs_discover");
  ids = Object.fromEntries(found.projects.map((project: any) => [project.name, project.id]));
});
afterEach(async () => {
  // The existing store schedules best-effort backlink indexing after successful writes.
  await Bun.sleep(30);
  await rm(workspace, { recursive: true, force: true });
});

test("service requires a live task in the current workspace for every write", async () => {
  const read = await invoke("docs_read", { project: ids.alpha, path: "page" });
  const args = { project: ids.alpha, path: "page", blockId: "body", expected_hash: read.hash, markdown: "Updated documentation." };
  expect((await invoke("docs_write_text", args)).ok).toBe(false);
  const parentTask = await beginEditing();
  const wrongWorkspace = await invoke("docs_write_text", { ...args, task_id: parentTask.task_id }, join(workspace, "alpha"));
  expect(wrongWorkspace.ok).toBe(false);
  expect(wrongWorkspace.detail).toContain("before editing");
  const changed = await invoke("docs_write_text", { ...args, task_id: parentTask.task_id });
  expect(changed.ok).toBe(true);
  expect((await invoke("docs_end", { task_id: parentTask.task_id })).ended).toBe(true);
  expect((await invoke("docs_write_text", { ...args, expected_hash: changed.hash, task_id: parentTask.task_id })).ok).toBe(false);
  expect((await invoke("docs_read", { project: ids.alpha, path: "page" })).markdown).toContain("Updated documentation.");
});

test("a project learned in another workspace remains unavailable to this workspace", async () => {
  const beta = join(workspace, "beta");
  const result = await invoke("docs_read", { project: ids.alpha, path: "page" }, beta);
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("not in this workspace");
  const task = await invoke("docs_begin", {}, beta);
  expect((await invoke("docs_guidance", { task_id: task.task_id }, workspace)).ok).toBe(false);
  expect((await invoke("docs_end", { task_id: task.task_id }, workspace)).ok).toBe(false);
  expect((await invoke("docs_guidance", { task_id: task.task_id }, beta)).snapshot_id).toBe(task.snapshot_id);
});

test("invalid edits leave their project unchanged without rolling back another project", async () => {
  const task = await beginEditing();
  const alpha = await invoke("docs_read", { project: ids.alpha, path: "page" });
  const beta = await invoke("docs_read", { project: ids.beta, path: "page" });
  const betaFile = join(workspace, "beta/docs/page/doc.json");
  const betaBefore = await readFile(betaFile, "utf8");
  expect((await invoke("docs_write_text", {
    task_id: task.task_id, project: ids.alpha, path: "page", blockId: "body", expected_hash: alpha.hash, markdown: "Alpha update survives.",
  })).ok).toBe(true);
  const invalid = await invoke("docs_apply_ops", {
    task_id: task.task_id, project: ids.beta, path: "page", expected_hash: beta.hash,
    ops: [{ type: "insertBlock", blockId: "invalid", parentId: "root", index: 0, blockType: "heading", props: { level: 99 } }],
  });
  expect(invalid.ok).toBe(false);
  expect(await readFile(betaFile, "utf8")).toBe(betaBefore);
  expect((await invoke("docs_read", { project: ids.alpha, path: "page" })).markdown).toContain("Alpha update survives.");
});

test("UI reads immediately see changes made through the tool authority", async () => {
  const task = await beginEditing();
  const before = await invoke("docs_read", { project: ids.alpha, path: "page" });
  const change = await invoke("docs_write_text", {
    task_id: task.task_id, project: ids.alpha, path: "page", blockId: "body", expected_hash: before.hash, markdown: "Visible to the UI.",
  });
  expect(change.ok).toBe(true);
  const response = await service.uiRequest(ids.alpha!, new Request(`http://localhost/projects/${ids.alpha}/api/bundle?path=page`));
  expect(response.status).toBe(200);
  const body = await response.json() as Record<string, any>;
  expect(body.doc_hash).toBe(change.hash);
  expect(JSON.stringify(body)).toContain("Visible to the UI.");
});

test("focused guidance returns the canonical component chapter from the task snapshot", async () => {
  const task = await invoke("docs_begin");
  const focused = await invoke("docs_guidance", { task_id: task.task_id, component: "state-shape" });
  expect(focused.snapshot_id).toBe(task.snapshot_id);
  expect(focused.component.name).toBe("state-shape");
  expect(focused.reference).toContain("## State Schema");
  expect(focused.reference).toContain("state-shape.setExample");
  expect((await invoke("docs_guidance", { task_id: task.task_id, component: "unknown" })).ok).toBe(false);
});

test("docs_begin fits the style digest into the client preview and leaves full guidance to topics", async () => {
  const result = await service.call(workspace, "docs_begin");
  const json = result.content[0]!.text;
  const begin = result.structuredContent as Record<string, any>;
  const digest = JSON.stringify(STYLE_DIGEST);
  // Clients persist large results and show the model a 2 KB preview of this JSON.
  expect(Object.keys(begin).slice(0, 4)).toEqual(["ok", "task_id", "style_digest", "next"]);
  expect(json.indexOf(digest)).toBeGreaterThan(0);
  expect(json.indexOf(digest) + digest.length).toBeLessThanOrEqual(2_000);
  expect(Buffer.byteLength(json)).toBeLessThan(6_000);
  expect(begin.next).toContain('topic "style"');
  expect(begin.guidance).toBeUndefined();
  expect(begin.components).toEqual(componentGuidance().map(({ name }) => ({ name, when_to_use: expect.stringMatching(/^[^\n]+$/) })));
});

test("docs_guidance lists topics by default and serves each topic from the task snapshot", async () => {
  const task = await invoke("docs_begin");
  const index = await invoke("docs_guidance", { task_id: task.task_id });
  expect(index.guidance).toBeUndefined();
  expect(index.topics).toEqual(task.topics);
  const listed = service.listTools().find(tool => tool.name === "docs_guidance") as any;
  expect(listed.inputSchema.properties.topic.enum).toEqual([...index.topics.map((entry: any) => entry.topic), "standards"]);
  for (const entry of index.topics) {
    const result = await service.call(workspace, "docs_guidance", { task_id: task.task_id, topic: entry.topic });
    const read = result.structuredContent as Record<string, any>;
    expect([entry.topic, read.snapshot_id, read.guidance.length]).toEqual([entry.topic, task.snapshot_id, entry.chars]);
    // Each topic stays small enough for a client to show inline. Only the unsplit text is larger.
    if (entry.topic !== "all") expect([entry.topic, Buffer.byteLength(result.content[0]!.text) < 20_000]).toEqual([entry.topic, true]);
  }
  expect((await invoke("docs_guidance", { task_id: task.task_id, topic: "style" })).guidance).toContain("<docs_style_guide");
  const all = await invoke("docs_guidance", { topic: "all" });
  const fresh = await loadGuidance();
  expect(all).toMatchObject({ snapshot_id: fresh.snapshotId, guidance: fresh.text, components: fresh.components });
  expect(all.sources).toHaveLength(fresh.sources.length);
  expect((await invoke("docs_guidance", { topic: "standards" })).topics).toEqual(index.topics.filter((entry: any) => entry.topic.startsWith("standards-")));
  expect((await invoke("docs_guidance", { topic: "unknown" })).ok).toBe(false);
  expect((await invoke("docs_guidance", { topic: "style", component: "state-shape" })).ok).toBe(false);
});

test("content writes wait until the task reads the style guide", async () => {
  const task = await invoke("docs_begin");
  const read = await invoke("docs_read", { project: ids.alpha, path: "page" });
  const write = { task_id: task.task_id, project: ids.alpha, path: "page", blockId: "body", expected_hash: read.hash, markdown: "Gated." };
  expect(await invoke("docs_write_text", write)).toEqual({ ok: false, detail: STYLE_GATE });
  await invoke("docs_guidance", { task_id: task.task_id, topic: "components" });
  await invoke("docs_guidance", { topic: "style" });
  expect((await invoke("docs_write_text", write)).detail).toBe(STYLE_GATE);
  expect((await invoke("docs_read", { project: ids.alpha, path: "page" })).hash).toBe(read.hash);
  expect((await invoke("docs_guidance", { task_id: task.task_id, topic: "style" })).ok).toBe(true);
  const saved = await invoke("docs_write_text", write);
  expect(saved.ok).toBe(true);
  // The read is per task. Topic "all" also contains the style guide.
  const next = await invoke("docs_begin");
  const again = { ...write, task_id: next.task_id, expected_hash: saved.hash, markdown: "Second task." };
  expect((await invoke("docs_write_text", again)).detail).toBe(STYLE_GATE);
  await invoke("docs_guidance", { task_id: next.task_id, topic: "all" });
  expect((await invoke("docs_write_text", again)).ok).toBe(true);
});

test("tree, annotation, review, asset, undo, restore, and lint-fix tools skip the style gate", async () => {
  const task = await invoke("docs_begin");
  const minimal = { task_id: task.task_id, project: ids.alpha, path: "page" };
  // An exempt tool reaches its own argument validation. A gated tool is refused before it.
  for (const name of ["docs_create", "docs_move", "docs_set_title", "docs_annotation_add", "docs_proposal_accept", "docs_changeset_accept", "docs_asset_upload", "docs_undo", "docs_management_restore", "docs_fix_lints"]) {
    expect([name, (await invoke(name, minimal)).issues?.length > 0]).toEqual([name, true]);
  }
  for (const name of ["docs_write_text", "docs_apply_ops", "docs_insert", "docs_proposal_stage", "docs_component_create", "docs_state_shape_add_field"]) {
    expect([name, (await invoke(name, minimal)).detail]).toEqual([name, STYLE_GATE]);
  }
});

test("docs_check takes an optional task_id and rejects a task this workspace does not own", async () => {
  const listed = service.listTools().find(tool => tool.name === "docs_check") as any;
  expect(listed.inputSchema.properties.task_id).toBeDefined();
  expect(listed.inputSchema.required).not.toContain("task_id");
  expect(listed.description).toContain("task_id");
  const target = { project: ids.alpha, path: "page" };
  expect((await invoke("docs_check", target)).structurally_valid).toBe(true);
  const task = await invoke("docs_begin");
  expect((await invoke("docs_check", { ...target, task_id: task.task_id })).structurally_valid).toBe(true);
  const foreign = await invoke("docs_begin", {}, join(workspace, "beta"));
  await invoke("docs_end", { task_id: task.task_id });
  for (const task_id of ["missing", task.task_id, foreign.task_id]) {
    expect(await invoke("docs_check", { ...target, task_id })).toEqual({ ok: false, detail: "Unknown task for this workspace." });
  }
});

test("isolated daemon authenticates local requests and removes its state on shutdown", async () => {
  const stateDir = join(workspace, "daemon-state");
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "daemon"], {
    env: { ...process.env, CODECAINE_DOCS_STATE_DIR: stateDir }, stdout: "ignore", stderr: "ignore",
  });
  try {
    let state: { url: string; token: string; pid: number } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { state = JSON.parse(await readFile(join(stateDir, "daemon.json"), "utf8")); break; }
      catch { await Bun.sleep(20); }
    }
    expect(state?.pid).toBe(child.pid);
    if (!state) throw new Error("Isolated test daemon did not start");
    const headers = { authorization: `Bearer ${state.token}` };
    expect((await Bun.fetch(`${state.url}/health`)).status).toBe(401);
    expect((await Bun.fetch(`${state.url}/health`, { headers: { ...headers, origin: "https://example.invalid" } })).status).toBe(403);
    const healthy = await Bun.fetch(`${state.url}/health`, { headers });
    expect(healthy.status).toBe(200);
    expect((await healthy.json() as any).pid).toBe(child.pid);
    const rpc = await Bun.fetch(`${state.url}/rpc`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ workspace, name: "docs_discover", arguments: {} }) });
    expect((await rpc.json() as any).structuredContent.projects).toHaveLength(2);
    expect((await Bun.fetch(`${state.url}/shutdown`, { method: "POST", headers })).status).toBe(200);
    await child.exited;
    await expect(readFile(join(stateDir, "daemon.json"))).rejects.toThrow();
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}, 10_000);
