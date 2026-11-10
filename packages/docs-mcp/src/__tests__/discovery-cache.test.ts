import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as discovery from "../discovery";
import { createInteractionService } from "../service";
import { treeIndex } from "@codecaine-ai/docs-server/store";

// The discovery cache rule (service.ts): one scan per workspace, reused until a manifest or the registry's
// listing changes. These tests count discoverProjects calls through a spy and use docs_capabilities,
// docs_tree and the service's discover, which hold no task. The service runs as managed with a
// build id so it never fingerprints the implementation (snapshot.ts reads sibling repos the worktree lacks).
// A path whose mtime is within 50 ms of a scan's start is signed changed-during-scan and rescans once, so a
// test waits past that margin (settle) after it changes a fixture and before the call that scans it.
const page = { schemaVersion: 1, id: "cache", title: "Cache", root: "root", blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } } };
let workspace: string;
let stateDir: string;
let registryFile: string;
let scans: ReturnType<typeof spyOn<typeof discovery, "discoverProjects">>;
let service: ReturnType<typeof createInteractionService>;
const realDiscoverProjects = discovery.discoverProjects;
const settle = () => Bun.sleep(60);

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
  await settle();
});
afterEach(async () => {
  scans.mockRestore();
  service.close();
  await rm(workspace, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});
const invoke = (ws: string, name: string, args: Record<string, unknown> = {}) => service.call(ws, name, args).then(r => r.structuredContent as Record<string, any>);

test("one scan serves every call on a workspace, docs_capabilities and concurrent calls included", async () => {
  const found = await invoke(workspace, "docs_capabilities");
  const project = found.projects[0].id as string;
  expect(scans).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
  const results = await Promise.all(Array.from({ length: 6 }, () => invoke(workspace, "docs_tree", { project })));
  expect(results.every(r => r.ok)).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
  expect((await invoke(workspace, "docs_capabilities")).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(1);
});

test("a workspace never seen is scanned on first use, and concurrent first calls share that scan", async () => {
  const other = await memberWorkspace("beta");
  await settle();
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
  const project = (await invoke(workspace, "docs_capabilities")).projects[0].id as string;
  await writeFile(join(workspace, "codecaine.docs.json"), JSON.stringify({ name: "cache-workspace" }));
  await settle();
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  await writeFile(join(workspace, "alpha", "codecaine.docs.json"), JSON.stringify({ name: "alpha", exclude: ["drafts/**"] }));
  await settle();
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(3);
  expect(service.stats().discoveries).toBe(1);
});

test("a registry rewrite drops only a discovery the registry no longer lists unchanged, once per rewrite", async () => {
  const project = (await service.discover(workspace)).projects[0]!;
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

/** A workspace whose package.json globs packages/* and holds one project, packages/alpha. */
async function globWorkspace() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "docs-discovery-cache-glob-")));
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
  await mkdir(join(root, "packages", "alpha", "docs", "page"), { recursive: true });
  await writeFile(join(root, "packages", "alpha", "docs", "page", "doc.json"), JSON.stringify(page));
  return root;
}

test("a project that appears under a workspace glob is in the next docs_capabilities list", async () => {
  const globbed = await globWorkspace();
  try {
    // gamma matches the glob but has no corpus at its default docs root, so it is not a project yet.
    await mkdir(join(globbed, "packages", "gamma", "notes", "page"), { recursive: true });
    await writeFile(join(globbed, "packages", "gamma", "notes", "page", "doc.json"), JSON.stringify(page));
    await settle();
    const alpha = (await invoke(globbed, "docs_capabilities")).projects[0].id as string;
    expect((await invoke(globbed, "docs_tree", { project: alpha })).ok).toBe(true);
    expect(scans).toHaveBeenCalledTimes(1);
    // A new sibling folder with a manifest: the glob's prefix folder packages/ changes.
    await mkdir(join(globbed, "packages", "beta", "docs", "page"), { recursive: true });
    await writeFile(join(globbed, "packages", "beta", "docs", "page", "doc.json"), JSON.stringify(page));
    await writeFile(join(globbed, "packages", "beta", "codecaine.docs.json"), JSON.stringify({ name: "beta" }));
    await settle();
    const beta = projectId("beta", join(globbed, "packages", "beta", "docs"));
    expect((await invoke(globbed, "docs_capabilities")).projects.map((p: any) => p.id).sort()).toEqual([alpha, beta].sort());
    expect((await invoke(globbed, "docs_tree", { project: beta })).ok).toBe(true);
    expect(scans).toHaveBeenCalledTimes(2);
    // A manifest added to a folder the glob already matched: that folder changes.
    await writeFile(join(globbed, "packages", "gamma", "codecaine.docs.json"), JSON.stringify({ name: "gamma", docsRoot: "notes" }));
    await settle();
    const gamma = projectId("gamma", join(globbed, "packages", "gamma", "notes"));
    expect((await invoke(globbed, "docs_tree", { project: gamma })).ok).toBe(true);
    expect(scans).toHaveBeenCalledTimes(3);
    expect((await invoke(globbed, "docs_tree", { project: alpha })).ok).toBe(true);
    expect(scans).toHaveBeenCalledTimes(3);
  } finally {
    await rm(globbed, { recursive: true, force: true });
  }
});

test("a registry rewrite that lists a new project under a cached workspace drops that workspace, once per rewrite", async () => {
  // gamma is declared but its docs folder is empty: a doc.json written inside changes no signed folder or manifest.
  await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "alpha" }, { dir: "gamma" }]));
  await mkdir(join(workspace, "gamma", "docs", "page"), { recursive: true });
  await settle();
  const found = await service.discover(workspace);
  expect(found.projects.map(p => p.name)).toEqual(["alpha"]);
  await writeFile(join(workspace, "gamma", "docs", "page", "doc.json"), JSON.stringify(page));
  const gamma = { id: projectId("gamma", join(workspace, "gamma", "docs")), name: "gamma", root: join(workspace, "gamma"), docsRoot: join(workspace, "gamma", "docs"), products: ["docs"] };
  // Another client's docs_capabilities rewrites the registry with gamma.
  await writeFile(registryFile, JSON.stringify({ schemaVersion: 1, workspaces: [workspace], projects: [...found.projects, gamma] }));
  expect((await invoke(workspace, "docs_tree", { project: gamma.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  expect((await invoke(workspace, "docs_tree", { project: gamma.id })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
});

test("concurrent calls that find one stale entry after a manifest change share one rescan", async () => {
  const project = (await invoke(workspace, "docs_capabilities")).projects[0].id as string;
  await writeFile(join(workspace, "alpha", "codecaine.docs.json"), JSON.stringify({ name: "alpha" }));
  await settle();
  const results = await Promise.all(Array.from({ length: 4 }, () => invoke(workspace, "docs_tree", { project })));
  expect(results.every(r => r.ok)).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
});

test("a manifest edited during a scan rescans once on the next call", async () => {
  const manifest = join(workspace, "alpha", "codecaine.docs.json");
  await writeFile(manifest, JSON.stringify({ name: "alpha" }));
  await settle();
  // The edit lands after the scan read the manifest and before the scan returns.
  scans.mockImplementationOnce(async input => {
    const found = await realDiscoverProjects(input);
    await writeFile(manifest, JSON.stringify({ name: "alpha", exclude: ["drafts/**"] }));
    return found;
  });
  const found = await service.discover(workspace);
  expect(found.projects[0]!.exclude).toBeUndefined();
  await settle();
  const project = found.projects[0]!.id;
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
  expect((await invoke(workspace, "docs_tree", { project })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
});

test("a declared folder whose manifest is edited to enable docs is a project on the next call", async () => {
  await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "alpha" }, { dir: "gamma" }]));
  await mkdir(join(workspace, "gamma", "docs", "page"), { recursive: true });
  await writeFile(join(workspace, "gamma", "docs", "page", "doc.json"), JSON.stringify(page));
  await writeFile(join(workspace, "gamma", "codecaine.docs.json"), JSON.stringify({ name: "gamma", products: ["api"] }));
  await settle();
  expect((await invoke(workspace, "docs_capabilities")).projects.map((p: any) => p.name)).toEqual(["alpha"]);
  // Rewriting the file in place changes the manifest, not the gamma folder.
  await writeFile(join(workspace, "gamma", "codecaine.docs.json"), JSON.stringify({ name: "gamma", products: ["docs", "api"] }));
  await settle();
  const gamma = projectId("gamma", join(workspace, "gamma", "docs"));
  expect((await invoke(workspace, "docs_capabilities")).projects.map((p: any) => p.name).sort()).toEqual(["alpha", "gamma"]);
  expect((await invoke(workspace, "docs_tree", { project: gamma })).ok).toBe(true);
  expect(scans).toHaveBeenCalledTimes(2);
});

test("a project that appears below an unmatched folder of a nested glob is found on the next call", async () => {
  const nested = await realpath(await mkdtemp(join(tmpdir(), "docs-discovery-cache-nested-")));
  try {
    await writeFile(join(nested, "package.json"), JSON.stringify({ workspaces: ["packages/*/sub/*"] }));
    await mkdir(join(nested, "packages", "foo", "sub", "alpha", "docs", "page"), { recursive: true });
    await writeFile(join(nested, "packages", "foo", "sub", "alpha", "docs", "page", "doc.json"), JSON.stringify(page));
    // qux matches packages/* but nothing under it matches the full glob yet.
    await mkdir(join(nested, "packages", "qux"), { recursive: true });
    await settle();
    expect((await invoke(nested, "docs_capabilities")).projects.map((p: any) => p.name)).toEqual(["alpha"]);
    await mkdir(join(nested, "packages", "qux", "sub", "beta", "docs", "page"), { recursive: true });
    await writeFile(join(nested, "packages", "qux", "sub", "beta", "docs", "page", "doc.json"), JSON.stringify(page));
    await settle();
    const beta = projectId("beta", join(nested, "packages", "qux", "sub", "beta", "docs"));
    expect((await invoke(nested, "docs_tree", { project: beta })).ok).toBe(true);
    expect(scans).toHaveBeenCalledTimes(2);
  } finally {
    await rm(nested, { recursive: true, force: true });
  }
});

test("a project dropped from the workspace releases its watcher and its tree index on the next call", async () => {
  const watched = createInteractionService({ judgmentEngine: null, managed: true, registryFile, watchFs: true });
  try {
    const found = await watched.discover(workspace);
    const alphaRoot = found.projects[0]!.docsRoot;
    expect(treeIndex.isWatched(alphaRoot)).toBe(true);
    await mkdir(join(workspace, "beta", "docs", "page"), { recursive: true });
    await writeFile(join(workspace, "beta", "docs", "page", "doc.json"), JSON.stringify(page));
    await writeFile(join(workspace, "members.json"), JSON.stringify([{ dir: "beta" }]));
    await settle();
    const again = await watched.discover(workspace);
    expect(again.projects.map(p => p.docsRoot)).not.toContain(alphaRoot);
    expect(treeIndex.isWatched(alphaRoot)).toBe(false);
    expect(treeIndex.isWatched(again.projects[0]!.docsRoot)).toBe(true);
  } finally {
    watched.close();
  }
});

test("two docs_capabilities calls that overlap share one scan, so neither can commit over the other", async () => {
  const [first, second] = await Promise.all([invoke(workspace, "docs_capabilities"), invoke(workspace, "docs_capabilities")]);
  expect(scans).toHaveBeenCalledTimes(1);
  expect(first.projects.map((p: Record<string, unknown>) => p.id)).toEqual(second.projects.map((p: Record<string, unknown>) => p.id));
});
