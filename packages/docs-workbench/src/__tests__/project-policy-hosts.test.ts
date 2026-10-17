import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * B7-05: every supported host loads the project's codecaine.docs.json policy
 * itself. Each host runs in a FRESH bun process against a knowledge base with
 * `"docsRoot": "."` and an `exclude` glob; nothing calls setDocsRootExclude or
 * passes the globs in. Hosts: the MCP service, the standalone serve app, the
 * kernel edit-session service and the CLI export (with its asset walker).
 */

const PACKAGES = resolve(import.meta.dir, "../../..");
const FROZEN = "sessions/s1/outputs/inputs/spec-pages/p1";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082", "hex");
const DOC = (id: string) => JSON.stringify({
  schemaVersion: 1,
  id,
  title: id,
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: `Body of ${id}.` }], children: [] },
  },
});

let home: string;
let kb: string;
let frozenBefore: Record<string, string>;

async function write(rel: string, bytes: string | Buffer) {
  await mkdir(join(kb, rel, ".."), { recursive: true });
  await writeFile(join(kb, rel), bytes);
}

async function frozenBytes(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(join(kb, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(kb, path))).digest("hex");
    }
  };
  await walk("sessions");
  return out;
}

/** Runs `source` as a script in a new bun process; returns its last stdout line, parsed. */
async function fresh(name: string, source: string, ...args: string[]): Promise<any> {
  const script = join(home, `${name}.ts`);
  await writeFile(script, source);
  const child = Bun.spawn([process.execPath, script, kb, ...args], {
    cwd: home,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CODECAINE_DOCS_JUDGMENT: "off" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${name} exited ${code}: ${stderr}`);
  return JSON.parse(stdout.trim().split("\n").at(-1)!);
}

beforeAll(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "docs-policy-hosts-")));
  kb = join(home, "kb");
  await write("codecaine.docs.json", JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
  await write("notes/seed/doc.json", DOC("seed"));
  await write("notes/seed/assets/images/seed.png", PNG);
  await write(`${FROZEN}/doc.json`, DOC("frozen"));
  await write(`${FROZEN}/assets/images/frozen.png`, PNG);
  frozenBefore = await frozenBytes();
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("fresh hosts honor codecaine.docs.json exclude without any registration call", () => {
  test("MCP service: discovery, docs_read and the editor tree", async () => {
    const result = await fresh("mcp", `
      import { createInteractionService } from ${JSON.stringify(join(PACKAGES, "docs-mcp/src/service.ts"))};
      const [kb] = process.argv.slice(2);
      const service = createInteractionService({ judgmentEngine: null });
      const discovered = JSON.parse((await service.call(kb, "docs_discover", { workspace: kb })).content[0].text);
      const project = discovered.projects[0].id;
      const read = async (path) => JSON.parse((await service.call(kb, "docs_read", { project, path })).content[0].text);
      const tree = await (await service.uiRequest(project, new Request("http://localhost/projects/" + project + "/api/tree"))).json();
      console.log(JSON.stringify({ frozen: (await read(${JSON.stringify(FROZEN)})).ok, seed: (await read("notes/seed")).ok, tree: JSON.stringify(tree) }));
      service.close();
      process.exit(0);
    `);
    expect(result.frozen).toBe(false);
    expect(result.seed).toBe(true);
    expect(result.tree).toContain("notes/seed");
    expect(result.tree).not.toContain("outputs/inputs");
  }, 60_000);

  test("standalone serve app: tree, bundle, markdown and asset routes", async () => {
    const result = await fresh("serve", `
      import { createDocsServeApp } from ${JSON.stringify(join(PACKAGES, "docs-workbench/src/server.ts"))};
      const [kb] = process.argv.slice(2);
      const app = createDocsServeApp({ docsRoot: kb });
      const get = (path) => app.handle(new Request("http://localhost" + path));
      const tree = await (await get("/api/tree")).json();
      const q = encodeURIComponent;
      console.log(JSON.stringify({
        tree: JSON.stringify(tree),
        frozenBundle: (await get("/api/bundle?path=" + q(${JSON.stringify(FROZEN)}))).status,
        frozenMarkdown: (await get("/api/markdown?path=" + q(${JSON.stringify(FROZEN)}))).status,
        frozenAsset: (await get("/api/asset?path=" + q(${JSON.stringify(`${FROZEN}/assets/images/frozen.png`)}))).status,
        seedBundle: (await get("/api/bundle?path=notes/seed")).status,
        seedAsset: (await get("/api/asset?path=" + q("notes/seed/assets/images/seed.png"))).status,
      }));
      process.exit(0);
    `);
    expect(result.tree).toContain("notes/seed");
    expect(result.tree).not.toContain("outputs/inputs");
    expect(result.frozenBundle).toBe(400);
    expect(result.frozenMarkdown).toBe(400);
    expect(result.frozenAsset).toBe(400);
    expect(result.seedBundle).toBe(200);
    expect(result.seedAsset).toBe(200);
  }, 60_000);

  test("kernel edit-session service: an excluded page never loads into a session", async () => {
    const result = await fresh("kernel", `
      import { createDocsEditSessionService } from ${JSON.stringify(join(PACKAGES, "docs-kernel/src/docs-edit-session/service.ts"))};
      const [kb] = process.argv.slice(2);
      const service = createDocsEditSessionService({ docsRoot: kb, allowWrites: false });
      const frozen = await service.createSession({ path: ${JSON.stringify(FROZEN)}, instruction: "Tighten the wording.", spawn: false });
      const seed = await service.createSession({ path: "notes/seed", instruction: "Tighten the wording.", spawn: false });
      console.log(JSON.stringify({ frozen, seed }));
      service.disposeAll();
      process.exit(0);
    `);
    // The excluded page never loads; the seed page loads (it only has no requests to work).
    expect(result.frozen).toEqual({ ok: false, reason: "launch-error", errors: [`Invalid docs path: ${FROZEN}`] });
    expect(result.seed).toMatchObject({ ok: false, reason: "empty-scope" });
  }, 60_000);

  test("CLI export: no excluded bundle, markdown or asset file is published", async () => {
    const out = join(home, "site");
    // The real CLI entry point, in its own process: docs-cli export --root <kb> --out <dir>.
    const child = Bun.spawn([process.execPath, join(PACKAGES, "docs-cli/src/index.ts"), "export", "--root", kb, "--out", out], {
      cwd: home,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0) throw new Error(`docs-cli export exited ${code}: ${stderr}`);
    const result = { exitCode: code, report: JSON.parse(stdout) };
    expect(result.exitCode).toBe(0);
    expect(result.report.failures).toEqual([]);
    const tree = await readFile(join(out, "data/tree.json"), "utf8");
    expect(tree).toContain("notes/seed");
    expect(tree).not.toContain("outputs/inputs");
    expect(existsSync(join(out, "data/bundles/notes/seed.json"))).toBe(true);
    expect(existsSync(join(out, "data/files/notes/seed/assets/images/seed.png"))).toBe(true);
    expect(existsSync(join(out, `data/bundles/${FROZEN}.json`))).toBe(false);
    expect(existsSync(join(out, `data/markdown/${FROZEN}.md`))).toBe(false);
    expect(existsSync(join(out, "data/files/sessions"))).toBe(false);
  }, 300_000);

  test("no host changed the frozen inputs", async () => {
    expect(await frozenBytes()).toEqual(frozenBefore);
  });
});
