import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInteractionService } from "../service";

// A local client's workspace and a project nest: the workspace sits inside the project's root, or the project's
// root sits inside the workspace. Either way the project is in the workspace, and docs_read and docs_tree work.
// The service runs as managed with a build id so it never fingerprints the implementation.
const page = (text: string) => ({ schemaVersion: 1, id: "page", title: "Page", root: "root", blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p"] }, p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: text }] } } });
let base: string;
let registryFile: string;
let service: ReturnType<typeof createInteractionService>;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "docs-workspace-in-project-")));
  registryFile = join(base, "state", "projects.json");
  await mkdir(join(base, "state"));
  process.env.CODECAINE_DOCS_BUILD ??= "workspace-in-project-test";
  service = createInteractionService({ judgmentEngine: null, managed: true, registryFile });
});
afterEach(async () => {
  service.close();
  await rm(base, { recursive: true, force: true });
});
const invoke = (workspace: string, name: string, args: Record<string, unknown> = {}) => service.call(workspace, name, args).then(r => r.structuredContent as Record<string, any>);
async function knowledgeBase(root: string) {
  await mkdir(join(root, "notes", "page"), { recursive: true });
  await mkdir(join(root, "sessions", "s1"), { recursive: true });
  await writeFile(join(root, "codecaine.docs.json"), JSON.stringify({ name: "knowledge-base", docsRoot: "." }));
  await writeFile(join(root, "notes", "page", "doc.json"), JSON.stringify(page("Knowledge text.")));
}
async function repo(root: string, text: string) {
  await mkdir(join(root, "docs", "page"), { recursive: true });
  await writeFile(join(root, "docs", "page", "doc.json"), JSON.stringify(page(text)));
}
/** The registry the supervisor writes: each project as its own scan reported it. */
async function register(...roots: string[]) {
  const projects = [];
  for (const root of roots) projects.push(...(await service.discover(root)).projects);
  await writeFile(registryFile, JSON.stringify({ schemaVersion: 1, workspaces: roots, projects }));
  return projects;
}

test("a workspace inside a whole-folder project lists it, and docs_read and docs_tree work there with no registry entry", async () => {
  const kb = join(base, "knowledge-base");
  await knowledgeBase(kb);
  const session = join(kb, "sessions", "s1");
  const found = await invoke(session, "docs_capabilities");
  expect(found.projects.map((p: any) => p.name)).toEqual(["knowledge-base"]);
  const project = found.projects[0].id;
  expect((await invoke(session, "docs_read", { project, path: "notes/page" })).markdown).toContain("Knowledge text.");
  expect((await invoke(session, "docs_tree", { project })).ok).toBe(true);
});

test("a registered project whose root sits below the workspace is in the workspace", async () => {
  const workspace = join(base, "workspace");
  const kb = join(workspace, "knowledge-base");
  await knowledgeBase(kb);
  const [registered] = await register(kb);
  const found = await invoke(workspace, "docs_capabilities");
  expect(found.projects.map((p: any) => p.id)).toEqual([registered!.id]);
  expect((await invoke(workspace, "docs_read", { project: registered!.id, path: "notes/page" })).markdown).toContain("Knowledge text.");
});

test("a registered project whose root holds the workspace is in the workspace, and an unrelated registered project stays out", async () => {
  const holder = join(base, "holder");
  await repo(holder, "Holder text.");
  await mkdir(join(holder, "packages", "app"), { recursive: true });
  const unrelated = join(base, "unrelated");
  await repo(unrelated, "Unrelated text.");
  const [held, other] = await register(holder, unrelated);
  const app = join(holder, "packages", "app");
  const found = await invoke(app, "docs_capabilities");
  expect(found.projects.map((p: any) => p.id)).toEqual([held!.id]);
  expect((await invoke(app, "docs_read", { project: held!.id, path: "page" })).markdown).toContain("Holder text.");
  const refused = await invoke(app, "docs_tree", { project: other!.id });
  expect(refused.detail).toContain("Project is not in this workspace");
});
