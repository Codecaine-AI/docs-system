import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { auditCommand, type AuditFinding } from "../audit";

// The docs-cli package root (the one subprocess smoke test spawns from here;
// the CLI itself is path-agnostic — every test passes absolute temp paths).
const packageRoot = path.resolve(import.meta.dir, "../..");

let tempDir: string;

type DocOptions = {
  /** Extra root-level blocks appended after the title + opener. */
  extraBlocks?: Record<string, unknown>;
  /** Replaces the default [title, opener] root children order entirely. */
  rootChildren?: string[];
};

/** Minimal valid doc: level-1 title heading followed by an opening paragraph. */
function doc(id: string, options: DocOptions = {}): Record<string, unknown> {
  const extra = options.extraBlocks ?? {};
  const children = options.rootChildren ?? ["title", "opener", ...Object.keys(extra)];
  const available: Record<string, unknown> = {
    title: {
      id: "title",
      type: "heading",
      props: { level: 1 },
      text: [{ insert: id }],
      children: [],
    },
    opener: {
      id: "opener",
      type: "paragraph",
      props: {},
      text: [{ insert: "Opening paragraph." }],
      children: [],
    },
    ...extra,
  };
  // Only referenced blocks may appear: validateDocDocument rejects blocks
  // unreachable from root.
  const blocks: Record<string, unknown> = {
    root: { id: "root", type: "paragraph", props: {}, children },
  };
  for (const childId of children) blocks[childId] = available[childId];
  return { schemaVersion: 1, id, title: id, root: "root", blocks };
}

async function writeBundle(relDir: string, document: Record<string, unknown>): Promise<void> {
  const dir = path.join(tempDir, relDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "doc.json"), `${JSON.stringify(document, null, 2)}\n`);
}

function findingsFor(findings: AuditFinding[], checkId: AuditFinding["checkId"]): AuditFinding[] {
  return findings.filter((finding) => finding.checkId === checkId);
}

/**
 * A structurally clean tree: root has two prefixed layer sections (root is
 * E3-exempt, so it needs no parent doc.json), and each non-root section with
 * >= 2 children carries its own parent doc.json.
 */
async function createCleanTree(): Promise<void> {
  await writeBundle("10-foundation", doc("foundation"));
  await writeBundle("20-design", doc("design"));
  await writeBundle("20-design/10-shape", doc("shape"));
  await writeBundle("20-design/20-color", doc("color"));
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "spectre-docs-audit-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("docs cli audit — clean tree", () => {
  test("reports no findings on a conforming tree", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  test("throws for a missing docsRoot", async () => {
    await expect(auditCommand(path.join(tempDir, "missing"))).rejects.toThrow();
  });

  test("accepts 00-prefixed bundles and dense NN-prefix numbering", async () => {
    await writeBundle("00-manifesto", doc("manifesto"));
    await writeBundle("11-color", doc("color"));
    await writeBundle("12-motion", doc("motion"));

    const report = await auditCommand(tempDir);
    expect(report.findings).toEqual([]);
  });
});

describe("E1 — duplicate sibling prefix", () => {
  test("flags two children of a bundle sharing a two-digit prefix", async () => {
    await writeBundle("10-design", doc("design"));
    await writeBundle("10-design/10-shape", doc("shape"));
    await writeBundle("10-design/10-color", doc("color"));

    const report = await auditCommand(tempDir);
    const e1 = findingsFor(report.findings, "E1");
    expect(e1).toHaveLength(1);
    expect(e1[0]).toMatchObject({ severity: "error", path: "10-design" });
    expect(e1[0]!.message).toContain('"10"');
    expect(e1[0]!.message).toContain("10-color");
    expect(e1[0]!.message).toContain("10-shape");
    expect(report.errorCount).toBe(1);
  });

  test("does not flag distinct prefixes", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E1")).toEqual([]);
  });
});

describe("E2 — entry naming", () => {
  test("flags an unprefixed child of a bundle and ignores dotfiles and plain files", async () => {
    await createCleanTree();
    await writeBundle("10-design/misnamed", doc("misnamed"));
    await mkdir(path.join(tempDir, ".index"), { recursive: true });
    await writeFile(path.join(tempDir, ".index", "backlinks.db"), "not a corpus entry");
    await writeFile(path.join(tempDir, "10-design", "stray.txt"), "ignored file");

    const report = await auditCommand(tempDir);
    const e2 = findingsFor(report.findings, "E2");
    expect(e2).toHaveLength(1);
    expect(e2[0]).toMatchObject({ severity: "error", path: "10-design/misnamed" });
    expect(report.findings.some((finding) => finding.path.includes(".index"))).toBe(false);
    expect(report.findings.some((finding) => finding.path.includes("stray"))).toBe(false);
  });

  test("accepts NN- prefixed entries", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E2")).toEqual([]);
  });

  test("does not reserve assets or canvases inside a non-bundle section", async () => {
    await mkdir(path.join(tempDir, "assets"), { recursive: true });
    await mkdir(path.join(tempDir, "canvases"), { recursive: true });

    const report = await auditCommand(tempDir);
    const e2 = findingsFor(report.findings, "E2");
    expect(e2).toHaveLength(2);
    expect(e2.map((finding) => finding.path)).toEqual(["assets", "canvases"]);
  });
});

describe("E3 — sections need their own parent doc.json", () => {
  test("flags a non-root section with two children and no parent doc.json", async () => {
    await writeBundle("10-design/10-shape", doc("shape"));
    await writeBundle("10-design/20-color", doc("color"));

    const report = await auditCommand(tempDir);
    const e3 = findingsFor(report.findings, "E3");
    expect(e3).toHaveLength(1);
    expect(e3[0]).toMatchObject({ severity: "error", path: "10-design" });
    expect(e3[0]!.message).toBe("section has 2 children but no parent doc.json");
  });

  test("a bundle with two child docs does not error", async () => {
    await writeBundle("10-design", doc("design"));
    await writeBundle("10-design/10-shape", doc("shape"));
    await writeBundle("10-design/20-color", doc("color"));

    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E3")).toEqual([]);
  });

  test("docs root itself is exempt even with many children and no parent doc.json", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E3")).toEqual([]);
  });

  test("a single-child section does not need a parent doc.json", async () => {
    await writeBundle("10-design/10-shape", doc("shape"));
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E3")).toEqual([]);
  });
});

describe("E5 — retired 00-overview convention", () => {
  test("flags a bundle that also contains a 00-overview child", async () => {
    await writeBundle("10-design", doc("design"));
    await writeBundle("10-design/00-overview", doc("legacy-overview"));

    const report = await auditCommand(tempDir);
    const e5 = findingsFor(report.findings, "E5");
    expect(e5).toHaveLength(1);
    expect(e5[0]).toMatchObject({ severity: "error", path: "10-design" });
    expect(e5[0]!.message).toContain("has both a parent doc.json and a 00-overview child");
    expect(e5[0]!.message).toContain("retired");
  });

  test("clean trees contain no retired overview conflicts", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E5")).toEqual([]);
  });
});

describe("E4 — bundle validity", () => {
  test("flags unparseable doc.json", async () => {
    await mkdir(path.join(tempDir, "10-broken"), { recursive: true });
    await writeFile(path.join(tempDir, "10-broken", "doc.json"), "{ invalid json");

    const report = await auditCommand(tempDir);
    const e4 = findingsFor(report.findings, "E4");
    expect(e4).toHaveLength(1);
    expect(e4[0]).toMatchObject({ severity: "error", path: "10-broken" });
    expect(e4[0]!.message).toContain("not valid JSON");
  });

  test("flags a document failing validateDocDocument", async () => {
    await writeBundle("10-invalid", { schemaVersion: 1, id: "bad", root: "root", blocks: {} });

    const report = await auditCommand(tempDir);
    const e4 = findingsFor(report.findings, "E4");
    expect(e4).toHaveLength(1);
    expect(e4[0]!.message).toContain("failed validation");
  });

  test("flags a leaf directory with no doc.json", async () => {
    await mkdir(path.join(tempDir, "10-empty"), { recursive: true });

    const report = await auditCommand(tempDir);
    const e4 = findingsFor(report.findings, "E4");
    expect(e4).toHaveLength(1);
    expect(e4[0]).toMatchObject({ severity: "error", path: "10-empty", message: "missing doc.json" });
  });

  test("valid bundles produce no E4", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "E4")).toEqual([]);
  });

  test("validates a child doc nested beneath a bundle", async () => {
    await writeBundle("10-design", doc("design"));
    await mkdir(path.join(tempDir, "10-design", "10-shape"), { recursive: true });
    await writeFile(path.join(tempDir, "10-design", "10-shape", "doc.json"), "{ invalid json");

    const report = await auditCommand(tempDir);
    const e4 = findingsFor(report.findings, "E4");
    expect(e4).toHaveLength(1);
    expect(e4[0]).toMatchObject({ severity: "error", path: "10-design/10-shape" });
    expect(e4[0]!.message).toContain("not valid JSON");
  });
});

describe("bundle-reserved entries", () => {
  test("ignores assets, canvases, comments.json, and index twins inside a bundle", async () => {
    await writeBundle("10-design", doc("design"));
    await mkdir(path.join(tempDir, "10-design", "assets"), { recursive: true });
    await mkdir(path.join(tempDir, "10-design", "canvases"), { recursive: true });
    await writeFile(path.join(tempDir, "10-design", "comments.json"), "{}\n");
    await writeFile(path.join(tempDir, "10-design", "index.md"), "# Projected markdown\n");
    await writeFile(path.join(tempDir, "10-design", "index.mdx"), "# Projected MDX\n");

    const report = await auditCommand(tempDir);
    expect(report.findings).toEqual([]);
  });
});

describe("W1 — single level-1 heading", () => {
  test("warns when a doc has two level-1 headings", async () => {
    await writeBundle(
      "10-doc",
      doc("two-titles", {
        extraBlocks: {
          second: {
            id: "second",
            type: "heading",
            props: { level: 1 },
            text: [{ insert: "Second title" }],
            children: [],
          },
        },
      }),
    );

    const report = await auditCommand(tempDir);
    const w1 = findingsFor(report.findings, "W1");
    expect(w1).toHaveLength(1);
    expect(w1[0]).toMatchObject({ severity: "warn", path: "10-doc" });
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
  });

  test("level-2 headings do not trigger it", async () => {
    await writeBundle(
      "10-doc",
      doc("one-title", {
        extraBlocks: {
          section: {
            id: "section",
            type: "heading",
            props: { level: 2 },
            text: [{ insert: "Section" }],
            children: [],
          },
        },
      }),
    );

    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "W1")).toEqual([]);
  });
});

describe("W2 — image alt text", () => {
  test("warns for an image block without alt", async () => {
    await writeBundle(
      "10-doc",
      doc("with-image", {
        extraBlocks: {
          img: { id: "img", type: "image", props: { src: "diagram.png" }, children: [] },
        },
      }),
    );

    const report = await auditCommand(tempDir);
    const w2 = findingsFor(report.findings, "W2");
    expect(w2).toHaveLength(1);
    expect(w2[0]).toMatchObject({ severity: "warn", path: "10-doc" });
    expect(w2[0]!.message).toContain('"img"');
  });

  test("does not warn when alt is present", async () => {
    await writeBundle(
      "10-doc",
      doc("with-image", {
        extraBlocks: {
          img: {
            id: "img",
            type: "image",
            props: { src: "diagram.png", alt: "The block pipeline" },
            children: [],
          },
        },
      }),
    );

    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "W2")).toEqual([]);
  });
});

describe("W4 — opening paragraph", () => {
  test("warns when the block after the title is not a paragraph", async () => {
    await writeBundle(
      "10-doc",
      doc("no-opener", {
        rootChildren: ["title", "code"],
        extraBlocks: {
          code: {
            id: "code",
            type: "code",
            props: { language: "ts" },
            text: [{ insert: "const x = 1;" }],
            children: [],
          },
        },
      }),
    );

    const report = await auditCommand(tempDir);
    const w4 = findingsFor(report.findings, "W4");
    expect(w4).toHaveLength(1);
    expect(w4[0]).toMatchObject({ severity: "warn", path: "10-doc" });
    expect(w4[0]!.message).toContain('"code"');
  });

  test("title followed by a paragraph does not warn", async () => {
    await createCleanTree();
    const report = await auditCommand(tempDir);
    expect(findingsFor(report.findings, "W4")).toEqual([]);
  });
});

describe("docs cli audit — subprocess smoke test", () => {
  async function spawnCli(
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const captureDir = await mkdtemp(path.join(os.tmpdir(), "spectre-docs-audit-capture-"));
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

  test("exits 1 on errors and 0 on a warnings-only tree", async () => {
    // Error tree: an unparseable bundle.
    await mkdir(path.join(tempDir, "10-broken"), { recursive: true });
    await writeFile(path.join(tempDir, "10-broken", "doc.json"), "{ invalid json");

    const failing = await spawnCli(["audit", tempDir]);
    expect(failing.exitCode).toBe(1);
    expect(failing.stdout).toContain("ERROR E4 10-broken");
    expect(failing.stdout).toContain("1 error(s), 0 warning(s)");

    // Warnings-only tree: replace the broken bundle with an image lacking alt.
    await rm(path.join(tempDir, "10-broken"), { recursive: true, force: true });
    await writeBundle(
      "10-image",
      doc("image-warning", {
        extraBlocks: {
          img: { id: "img", type: "image", props: { src: "diagram.png" }, children: [] },
        },
      }),
    );

    const warning = await spawnCli(["audit", tempDir]);
    expect(warning.exitCode).toBe(0);
    expect(warning.stdout).toContain("WARN W2 10-image");
    expect(warning.stdout).toContain("0 error(s), 1 warning(s)");
  });
});
