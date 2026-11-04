import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as discovery from "../discovery";
import { createInteractionService } from "../service";

// The discovery cache rule (service.ts): one scan per workspace, reused until a manifest or the registry's
// listing changes; docs_discover always rescans. These tests count discoverProjects calls through a spy and
// use docs_discover and docs_tree only, which need no guidance snapshot. The service runs as managed with a
// build id so it never fingerprints the implementation (snapshot.ts reads sibling repos the worktree lacks).
const page = { schemaVersion: 1, id: "cache", title: "Cache", root: "root", blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } } };
let workspace: string;
let stateDir: string;
let registryFile: string;
let scans: ReturnType<typeof spyOn<typeof discovery, "discoverProjects">>;
let service: ReturnType<typeof createInteractionService>;

async function memberWorkspace(name: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "docs-discovery-cache-")));
  await writeFile(join(root, "members.json"), JSON.stringify([{ dir: name }]));
  await mkdir(join(root, name, "docs", "page"), { recursive: true });
  await writeFile(join(root, name, "docs", "page", "doc.json"), JSON.stringify(page));
  return root;
}
/** discovery.ts computes a project id from its name and docs root, so a never-discovered project's id is known. */
const projectId = (name: string, docsRoot: string) => `${name}-${createHash("sha256").update(docsRoot).digest("hex").slice(0, 8)}`;

beforeEach(async () => {
  workspace = await memberWorkspace("alpha");
  stateDir = await mkdtemp(join(tmpdir(), "docs-discovery-cache-state-"));
  registryFile = join(stateDir, "projects.json");
  scans = spyOn(discovery, "discoverProjects");
  process.env.CODECAINE_DOCS_BUILD ??= "discovery-cache-test";
  service = createInteractionService({ judgmentEngine: null, managed: true, registryFile });
});
afterEach(async () => {
  scans.mockRestore();
  service.close();
  await rm(workspace, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});
const invoke = (ws: string, name: string, args: Record<string, unknown> = {}) => service.call(ws, name, args).then(r => r.structuredContent as Record<string, any>);

test("one scan serves every call on a workspace, concurrent calls included; docs_discover rescans", async () => {
  const found = await invoke(workspace, "docs_discover");
  const project = found.projects[0].id as string;
  expect(scans).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
  const results = await Promise.all(Array.from({ length: 6 }, () => invoke(workspace, "docs_tree", { project })));
  expect(results.every(r => r.ok)).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
  expect((await invoke(workspace, "docs_discover")).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
});

test("a workspace never seen is scanned on first use, and concurrent first calls share that scan", async () => {
  const other = await memberWorkspace("beta");
  try {
    const project = projectId("beta", join(other, "beta", "docs"));
    const results = await Promise.all(Array.from({ length: 4 }, () => invoke(other, "docs_tree", { project })));
    expect(results.every(r => r.ok)).toBe(true);
    expect(scans).toHaveBeenCalledTimes(1);
    expect(service.stats().discoveries).toBe(1);
  } finally {
    await rm(other, { recursive: true, force: true });
  }
});

test("a manifest change at the workspace or at a project root rescans once on the next call", async () => {
  const project = (await invoke(workspace, "docs_discover")).projects[0].id as string;
  await writeFile(join(workspace, "codecaine.docs.json"), JSON.stringify({ name: "cache-workspace" }));
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  await writeFile(join(workspace, "alpha", "codecaine.docs.json"), JSON.stringify({ name: "alpha", exclude: ["drafts/**"] }));
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(3);
  expect(service.stats().discoveries).toBe(1);
});

test("a registry rewrite drops only a discovery the registry no longer lists unchanged, once per rewrite", async () => {
  const project = (await invoke(workspace, "docs_discover")).projects[0];
  // The supervisor's write after that scan lists the project as reported: nothing to drop.
  await writeFile(registryFile, JSON.stringify({ schemaVersion: 1, workspaces: [workspace], projects: [project] }));
  expect((await invoke(workspace, "docs_tree", { project: project.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
  // A rewrite that changes the project's shape drops the discovery: the next call rescans.
  await writeFile(registryFile, JSON.stringify({ schemaVersion: 1, workspaces: [workspace], projects: [{ ...project, exclude: ["drafts/**"] }] }));
  expect((await invoke(workspace, "docs_tree", { project: project.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  // The registry still disagrees, but it was not rewritten again: no rescan per call.
  expect((await invoke(workspace, "docs_tree", { project: project.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  // A rewrite that removes the project drops it again.
  await writeFile(registryFile, JSON.stringify({ schemaVersion: 1, workspaces: [workspace], projects: [] }));
  expect((await invoke(workspace, "docs_tree", { project: project.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(3);
});
