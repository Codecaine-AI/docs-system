import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { createInteractionService } from "./service";

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
  const parentTask = await invoke("docs_begin");
  expect(parentTask.guidance).toContain("docs_structure_standards");
  expect(parentTask.components.map((component: any) => component.name)).toContain("interaction-surface");
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
  const task = await invoke("docs_begin");
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
  const task = await invoke("docs_begin");
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
