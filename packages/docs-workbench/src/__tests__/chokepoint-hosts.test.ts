import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Round 2, fresh processes, no registration call:
 *
 * - B7-2-04: a knowledge base whose codecaine.docs.json has a present
 *   non-string `docsRoot` (42) is refused by every host before any corpus
 *   access or export work, exactly as central discovery refuses it: the MCP
 *   service, the standalone serve app, the kernel edit-session service and the
 *   real `docs-cli export` entry. The corpus (dot folders included) stays
 *   byte-identical and no export folder appears.
 * - B7-2-02: a standalone serve app over KB/notes refuses an assets alias
 *   into the enclosing KB's excluded sibling (upload with a missing and an
 *   existing name, asset and Canvas reads); a real assets folder works.
 */

const PACKAGES = resolve(import.meta.dir, "../../..");
const FROZEN = "sessions/s1/outputs/inputs/p1";
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
const CANVAS = JSON.stringify({
  schemaVersion: 1,
  id: "frozen",
  mode: "diagram",
  title: "frozen",
  objects: [],
  connections: [],
});

let home: string;

async function write(root: string, rel: string, bytes: string | Buffer) {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), bytes);
}

/** Every entry below `root` (dot folders and links included) with each file's sha256. */
async function treeBytes(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (rel: string) => {
    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out[path] = "link";
      else if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(root, path))).digest("hex");
    }
  };
  await walk("");
  return out;
}

/** Runs `source` as a script in a new bun process; returns its last stdout line, parsed. */
async function fresh(name: string, source: string, ...args: string[]): Promise<any> {
  const script = join(home, `${name}.ts`);
  await writeFile(script, source);
  const child = Bun.spawn([process.execPath, script, ...args], {
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
  home = await realpath(await mkdtemp(join(tmpdir(), "docs-chokepoint-hosts-")));
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("B7-2-04: a present non-string docsRoot refuses every fresh host, as discovery does", () => {
  let kb: string;
  let before: Record<string, string>;

  beforeAll(async () => {
    kb = join(home, "malformed-kb");
    await write(kb, "codecaine.docs.json", JSON.stringify({ name: "kb", docsRoot: 42, exclude: ["sessions/*/outputs/inputs/**"] }));
    await write(kb, "notes/seed/doc.json", DOC("seed"));
    await write(kb, `${FROZEN}/doc.json`, DOC("frozen"));
    await write(kb, `${FROZEN}/assets/images/frozen.png`, PNG);
    before = await treeBytes(kb);
  });

  test("MCP service: discovery refuses with Invalid docsRoot; no project, no store", async () => {
    const result = await fresh("mcp-malformed", `
      import { createInteractionService } from ${JSON.stringify(join(PACKAGES, "docs-mcp/src/service.ts"))};
      const [kb] = process.argv.slice(2);
      const service = createInteractionService({ judgmentEngine: null });
      const discovered = await service.call(kb, "docs_discover", { workspace: kb });
      console.log(JSON.stringify({ isError: discovered.isError === true, text: discovered.content[0].text }));
      service.close();
      process.exit(0);
    `, kb);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid docsRoot");
  }, 60_000);

  test("standalone serve app: construction refuses (the store validates the policy first)", async () => {
    const result = await fresh("serve-malformed", `
      import { createDocsServeApp } from ${JSON.stringify(join(PACKAGES, "docs-workbench/src/server.ts"))};
      const [kb] = process.argv.slice(2);
      let outcome;
      try { createDocsServeApp({ docsRoot: kb }); outcome = { refused: false }; }
      catch (error) { outcome = { refused: true, message: String(error?.message ?? error) }; }
      // A folder inside the knowledge base is governed by the same malformed config.
      try { createDocsServeApp({ docsRoot: kb + "/notes" }); outcome.subfolderRefused = false; }
      catch (error) { outcome.subfolderRefused = true; }
      console.log(JSON.stringify(outcome));
      process.exit(0);
    `, kb);
    expect(result).toMatchObject({ refused: true, subfolderRefused: true });
    expect(result.message).toContain("Invalid docsRoot");
  }, 60_000);

  test("kernel edit-session: the page never loads; the refusal names the invalid docsRoot", async () => {
    const result = await fresh("kernel-malformed", `
      import { createDocsEditSessionService } from ${JSON.stringify(join(PACKAGES, "docs-kernel/src/docs-edit-session/service.ts"))};
      const [kb] = process.argv.slice(2);
      const service = createDocsEditSessionService({ docsRoot: kb, allowWrites: false });
      const seed = await service.createSession({ path: "notes/seed", instruction: "Tighten the wording.", spawn: false });
      console.log(JSON.stringify({ seed }));
      service.disposeAll();
      process.exit(0);
    `, kb);
    expect(result.seed.ok).toBe(false);
    expect(result.seed.reason).toBe("launch-error");
    expect(JSON.stringify(result.seed.errors)).toContain("Invalid docsRoot");
  }, 60_000);

  test("CLI export: exits non-zero before any build or copy; no output folder", async () => {
    const out = join(home, "malformed-site");
    const child = Bun.spawn([process.execPath, join(PACKAGES, "docs-cli/src/index.ts"), "export", "--root", kb, "--out", out], {
      cwd: home,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("Invalid docsRoot");
    expect(existsSync(out)).toBe(false);
  }, 120_000);

  test("no host touched the corpus (no index, journal or change-set folder appeared)", async () => {
    expect(await treeBytes(kb)).toEqual(before);
  });
});

describe("B7-2-02: a fresh standalone serve app over KB/notes refuses an alias into an excluded sibling", () => {
  test("upload (missing and existing names), asset and Canvas reads are refused; a real assets folder works", async () => {
    const kb = join(home, "subfolder-kb");
    await write(kb, "codecaine.docs.json", JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
    await write(kb, "notes/twin/doc.json", DOC("twin"));
    await write(kb, "notes/real/doc.json", DOC("real"));
    await write(kb, `${FROZEN}/doc.json`, DOC("frozen"));
    await write(kb, `${FROZEN}/assets/images/existing.png`, PNG);
    await write(kb, `${FROZEN}/assets/canvases/c.canvas.json`, CANVAS);
    await symlink(join(kb, FROZEN, "assets"), join(kb, "notes/twin/assets"), "dir");
    const frozenBefore = await treeBytes(join(kb, "sessions"));

    const result = await fresh("serve-subfolder", `
      import { createDocsServeApp } from ${JSON.stringify(join(PACKAGES, "docs-workbench/src/server.ts"))};
      const [notes] = process.argv.slice(2);
      const app = createDocsServeApp({ docsRoot: notes });
      const q = encodeURIComponent;
      const get = (path) => app.handle(new Request("http://localhost" + path));
      const png = Buffer.from(${JSON.stringify(PNG.toString("base64"))}, "base64");
      const upload = (bundlePath, name) => {
        const form = new FormData();
        form.set("file", new File([png], name, { type: "image/png" }));
        form.set("bundlePath", bundlePath);
        return app.handle(new Request("http://localhost/api/assets", { method: "POST", body: form }));
      };
      console.log(JSON.stringify({
        uploadMissing: (await upload("twin", "added.png")).status,
        uploadExisting: (await upload("twin", "existing.png")).status,
        assetRead: (await get("/api/asset?path=" + q("twin/assets/images/existing.png"))).status,
        canvasRead: (await get("/api/canvas?src=" + q("twin/assets/canvases/c.canvas.json"))).status,
        uploadReal: (await upload("real", "ok.png")).status,
      }));
      process.exit(0);
    `, join(kb, "notes"));
    expect(result.uploadMissing).toBe(403);
    expect(result.uploadExisting).toBe(403);
    expect(result.assetRead).toBe(400);
    expect(result.canvasRead).toBe(400);
    expect(result.uploadReal).toBe(201);
    expect(await readFile(join(kb, "notes/real/assets/images/ok.png"))).toEqual(PNG);
    expect(await treeBytes(join(kb, "sessions"))).toEqual(frozenBefore);
  }, 60_000);
});
