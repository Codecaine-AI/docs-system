import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { backlinksRescanCommand, grepCommand, linksCheckCommand, renderCommand } from "../index";

// The docs-cli package root (spawned CLI runs live here — the CLI itself is
// path-agnostic; every test passes absolute temp paths).
const packageRoot = path.resolve(import.meta.dir, "../..");

type TestDoc = {
  schemaVersion: 1;
  id: string;
  title: string;
  root: "root";
  blocks: Record<string, unknown>;
};

let tempDir: string;

function doc(id: string, heading: string, paragraph: string): TestDoc {
  return {
    schemaVersion: 1,
    id,
    title: heading,
    root: "root",
    blocks: {
      root: {
        id: "root",
        flavour: "paragraph",
        props: {},
        children: ["heading", "body"],
      },
      heading: {
        id: "heading",
        flavour: "heading",
        props: { level: 1 },
        text: [{ insert: heading }],
        children: [],
      },
      body: {
        id: "body",
        flavour: "paragraph",
        props: {},
        text: [{ insert: paragraph }],
        children: [],
      },
    },
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixtureTree(): Promise<void> {
  await mkdir(path.join(tempDir, "foundation"), { recursive: true });
  await mkdir(path.join(tempDir, "implementation", "auth"), { recursive: true });
  await mkdir(path.join(tempDir, "broken"), { recursive: true });

  await writeJson(
    path.join(tempDir, "foundation", "doc.json"),
    doc("foundation-doc", "Foundation Overview", "Boundary layer keeps shared contracts stable."),
  );
  await writeJson(
    path.join(tempDir, "implementation", "auth", "doc.json"),
    doc("auth-doc", "Auth Module", "Token refresh uses BOUNDARY claims after login."),
  );
  await writeJson(
    path.join(tempDir, "standalone.doc.json"),
    doc("standalone-doc", "Standalone Notes", "Standalone bundle mentions boundary once."),
  );
  await writeFile(path.join(tempDir, "broken", "doc.json"), "{ invalid json");
}

async function snapshotTree(root: string): Promise<string> {
  const rows: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(dir, entry.name);
      const relative = path.relative(root, entryPath).split(path.sep).join(path.posix.sep);
      const stats = await stat(entryPath);
      rows.push(`${relative}\t${entry.isDirectory() ? "dir" : "file"}\t${stats.mtimeMs}`);
      if (entry.isDirectory()) await walk(entryPath);
    }
  }

  await walk(root);
  return rows.join("\n");
}

async function spawnCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const captureDir = await mkdtemp(path.join(os.tmpdir(), "spectre-docs-cli-capture-"));
  const stdoutPath = path.join(captureDir, "stdout.txt");
  const stderrPath = path.join(captureDir, "stderr.txt");
  const command = ["bun", "src/index.ts", ...args]
    .map((arg) => `'${arg.replaceAll("'", "'\\''")}'`)
    .join(" ");
  const proc = Bun.spawn(["sh", "-c", `${command} > '${stdoutPath}' 2> '${stderrPath}'`], {
    cwd: packageRoot,
  });
  try {
    return {
      exitCode: await proc.exited,
      stdout: await readFile(stdoutPath, "utf8"),
      stderr: await readFile(stderrPath, "utf8"),
    };
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "spectre-docs-cli-"));
  await createFixtureTree();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("docs cli render", () => {
  test("renders bundle folder path directly and through CLI", async () => {
    const bundlePath = path.join(tempDir, "foundation");
    await expect(renderCommand(bundlePath)).resolves.toContain("# Foundation Overview");

    const result = await spawnCli(["render", bundlePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Foundation Overview");
    expect(result.stderr).toBe("");
  });

  test("renders explicit doc.json path", async () => {
    const markdown = await renderCommand(path.join(tempDir, "implementation", "auth", "doc.json"));
    expect(markdown).toContain("# Auth Module");
    expect(markdown).toContain("Token refresh");
  });

  test("renders bare *.doc.json path", async () => {
    const markdown = await renderCommand(path.join(tempDir, "standalone.doc.json"));
    expect(markdown).toContain("# Standalone Notes");
  });

  test("throws and exits non-zero for missing path", async () => {
    const missingPath = path.join(tempDir, "missing");
    await expect(renderCommand(missingPath)).rejects.toThrow(
      `Could not resolve a doc.json bundle for: ${missingPath}`,
    );

    const result = await spawnCli(["render", missingPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Could not resolve a doc.json bundle for: ${missingPath}`);
  });
});

describe("docs cli grep", () => {
  test("finds case-insensitive matches with relative posix paths", async () => {
    const matches = await grepCommand("boundary", tempDir);
    expect(matches).toEqual(
      expect.arrayContaining([
        { path: "foundation/doc.json", line: 3, text: "Boundary layer keeps shared contracts stable." },
        {
          path: "implementation/auth/doc.json",
          line: 3,
          text: "Token refresh uses BOUNDARY claims after login.",
        },
        { path: "standalone.doc.json", line: 3, text: "Standalone bundle mentions boundary once." },
      ]),
    );
  });

  test("respects case-sensitive search", async () => {
    const matches = await grepCommand("boundary", tempDir, { caseSensitive: true });
    expect(matches.map((match) => match.path).sort()).toEqual(["standalone.doc.json"]);
  });

  test("returns empty array when term matches nothing", async () => {
    await expect(grepCommand("never-present", tempDir)).resolves.toEqual([]);

    const result = await spawnCli(["grep", "never-present", tempDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0 match(es)");
  });

  test("skips malformed doc.json and keeps valid bundle matches", async () => {
    const matches = await grepCommand("foundation", tempDir);
    expect(matches).toEqual([{ path: "foundation/doc.json", line: 1, text: "# Foundation Overview" }]);
  });

  test("does not write during render or grep, including spawned CLI runs", async () => {
    const before = await snapshotTree(tempDir);

    await renderCommand(path.join(tempDir, "foundation"));
    await grepCommand("boundary", tempDir);

    const renderResult = await spawnCli(["render", path.join(tempDir, "foundation")]);
    expect(renderResult.exitCode).toBe(0);
    const grepResult = await spawnCli(["grep", "boundary", tempDir]);
    expect(grepResult.exitCode).toBe(0);

    expect(await snapshotTree(tempDir)).toBe(before);
  });
});

describe("docs cli backlinks rescan (TG7.1)", () => {
  test("indexes every doc.json reference span and reports counts", async () => {
    await mkdir(path.join(tempDir, "referrer"), { recursive: true });
    await writeJson(path.join(tempDir, "referrer", "doc.json"), {
      schemaVersion: 1,
      id: "referrer-doc",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "paragraph", props: {}, children: ["p1"] },
        p1: {
          id: "p1",
          flavour: "paragraph",
          props: {},
          children: [],
          text: [
            { insert: "See " },
            {
              insert: "foundation",
              attributes: { reference: { kind: "doc", path: "docs/foundation.md", label: "foundation" } },
            },
          ],
        },
      },
    });

    const result = await backlinksRescanCommand(tempDir);
    // 4 doc.json bundles exist (foundation, auth, standalone, referrer), but
    // "broken/doc.json" is intentionally invalid JSON and is skipped by
    // rescanAll rather than counted as scanned.
    expect(result.sourcesScanned).toBeGreaterThanOrEqual(3);
    expect(result.refsIndexed).toBeGreaterThanOrEqual(1);
    expect(result.dbPath).toBe(path.join(path.resolve(tempDir), ".index", "backlinks.db"));

    const cliResult = await spawnCli(["backlinks", "rescan", tempDir]);
    expect(cliResult.exitCode).toBe(0);
    expect(cliResult.stdout).toContain("Sources scanned:");
    expect(cliResult.stdout).toContain("References indexed:");
  });
});

describe("docs cli links check (TG7.2)", () => {
  test("reports a stale doc reference and exits non-zero", async () => {
    await mkdir(path.join(tempDir, "referrer"), { recursive: true });
    await writeJson(path.join(tempDir, "referrer", "doc.json"), {
      schemaVersion: 1,
      id: "referrer-doc",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "paragraph", props: {}, children: ["p1"] },
        p1: {
          id: "p1",
          flavour: "paragraph",
          props: {},
          children: [],
          text: [
            {
              insert: "missing",
              attributes: {
                reference: { kind: "doc", path: "docs/does-not-exist.md", label: "missing" },
              },
            },
          ],
        },
      },
    });

    const stale = await linksCheckCommand(tempDir);
    expect(stale).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: "referrer/doc.json",
          targetPath: "docs/does-not-exist.md",
        }),
      ]),
    );

    const cliResult = await spawnCli(["links", "check", tempDir]);
    expect(cliResult.exitCode).toBe(1);
    expect(cliResult.stdout).toContain("stale reference(s)");
  });

  test("does not flag a doc reference whose pre-migration file form exists", async () => {
    await mkdir(path.join(tempDir, "referrer"), { recursive: true });
    await writeFile(path.join(tempDir, "resolvable.md"), "# Resolvable\n");
    await writeJson(path.join(tempDir, "referrer", "doc.json"), {
      schemaVersion: 1,
      id: "referrer-doc",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "paragraph", props: {}, children: ["p1"] },
        p1: {
          id: "p1",
          flavour: "paragraph",
          props: {},
          children: [],
          text: [
            {
              insert: "resolvable",
              attributes: {
                reference: { kind: "doc", path: "docs/resolvable.md", label: "resolvable" },
              },
            },
          ],
        },
      },
    });

    const stale = await linksCheckCommand(tempDir);
    expect(stale.some((link) => link.targetPath === "docs/resolvable.md")).toBe(false);
  });
});
