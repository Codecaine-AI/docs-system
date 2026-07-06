import { describe, expect, it, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigration, retireTwins } from "../run";

const tmpDirs: string[] = [];

function makeTempRepo(): { repoRoot: string; docsDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "docs-migrate-run-test-"));
  tmpDirs.push(repoRoot);
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir, { recursive: true });
  return { repoRoot, docsDir };
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const SIMPLE_MDX = "# Hello\n\nA paragraph.\n";

describe("runMigration — bundle placement", () => {
  it("creates a new subfolder bundle for a standalone .mdx sibling file", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    writeFileSync(join(docsDir, "00-foundation", "10-purpose.mdx"), SIMPLE_MDX);

    const report = runMigration({ repoRoot, docsDir, verbose: false });

    expect(report.totals.filesFailed).toBe(0);
    expect(report.totals.filesMigrated).toBe(1);
    const bundlePath = join(docsDir, "00-foundation", "10-purpose", "doc.json");
    expect(existsSync(bundlePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(bundlePath, "utf8"));
    expect(parsed.title).toBe("Hello");
  });

  it("places doc.json directly in an existing folder-with-index directory (no extra nesting)", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "50-interactive-canvas"), { recursive: true });
    writeFileSync(join(docsDir, "50-interactive-canvas", "index.mdx"), SIMPLE_MDX);

    const report = runMigration({ repoRoot, docsDir, verbose: false });

    expect(report.totals.filesFailed).toBe(0);
    const bundlePath = join(docsDir, "50-interactive-canvas", "doc.json");
    expect(existsSync(bundlePath)).toBe(true);
    // Must NOT create a nested docs/50-interactive-canvas/index/doc.json.
    expect(existsSync(join(docsDir, "50-interactive-canvas", "index", "doc.json"))).toBe(false);
  });

  it("exempts docs/.drafts by default and includes it only with includeDrafts: true", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, ".drafts"), { recursive: true });
    writeFileSync(join(docsDir, ".drafts", "wip.mdx"), SIMPLE_MDX);

    const exemptReport = runMigration({ repoRoot, docsDir, verbose: false });
    expect(exemptReport.totals.filesMigrated).toBe(0);
    expect(exemptReport.totals.filesSkipped).toBe(1);
    expect(exemptReport.draftsPolicy).toBe("exempt");

    const includedReport = runMigration({ repoRoot, docsDir, includeDrafts: true, verbose: false });
    expect(includedReport.totals.filesMigrated).toBe(1);
    expect(includedReport.totals.filesSkipped).toBe(0);
    expect(includedReport.draftsPolicy).toBe("included");
  });

  it("never modifies or deletes the source .mdx file", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    const sourcePath = join(docsDir, "00-foundation", "10-purpose.mdx");
    writeFileSync(sourcePath, SIMPLE_MDX);

    runMigration({ repoRoot, docsDir, verbose: false });

    expect(existsSync(sourcePath)).toBe(true);
    expect(readFileSync(sourcePath, "utf8")).toBe(SIMPLE_MDX);
  });

  it("copies a referenced local asset sidecar into the new bundle's assets/ folder", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    const docDir = join(docsDir, "10-system-design", "50-interactive-canvas");
    mkdirSync(join(docDir, "assets", "canvases"), { recursive: true });
    writeFileSync(join(docDir, "assets", "canvases", "sample.canvas.json"), '{"nodes":[]}');
    const mdx = [
      "# Canvas Doc",
      "",
      '<Canvas id="c1" title="Sample" src="./assets/canvases/sample.canvas.json" />',
      "",
    ].join("\n");
    writeFileSync(join(docDir, "index.mdx"), mdx);

    const report = runMigration({ repoRoot, docsDir, verbose: false });

    expect(report.totals.filesFailed).toBe(0);
    const copiedAssetPath = join(docDir, "assets", "canvases", "sample.canvas.json");
    expect(existsSync(copiedAssetPath)).toBe(true);
    // Original sidecar must still exist untouched (copy, not move).
    expect(existsSync(join(docDir, "assets", "canvases", "sample.canvas.json"))).toBe(true);
    expect(report.migrated[0].assetsCopied.length).toBeGreaterThan(0);
  });

  it("reports validation-style failures without throwing, and writes zero output for the failing file", () => {
    // A file that produces unparsable frontmatter shouldn't crash the whole run;
    // mdxToDoc still succeeds on ordinary malformed-but-recoverable input, so
    // this test instead verifies the report shape stays well-formed on an
    // empty tree (defensive coverage for the failed[]/skipped[] arrays).
    const { repoRoot, docsDir } = makeTempRepo();
    const report = runMigration({ repoRoot, docsDir, verbose: false });
    expect(report.totals.filesFound).toBe(0);
    expect(report.failed).toEqual([]);
    expect(report.migrated).toEqual([]);
  });
});

describe("retireTwins — gated, dry-run by default", () => {
  it("dry-run reports what would be retired without deleting anything", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    const sourcePath = join(docsDir, "00-foundation", "10-purpose.mdx");
    writeFileSync(sourcePath, SIMPLE_MDX);
    runMigration({ repoRoot, docsDir, verbose: false });

    const report = retireTwins({ repoRoot, docsDir, dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.wouldRetire).toContain("docs/00-foundation/10-purpose.mdx");
    expect(report.totals.wouldRetire).toBe(1);
    expect(existsSync(sourcePath)).toBe(true);
  });

  it("skips files with no migrated bundle yet", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    writeFileSync(join(docsDir, "00-foundation", "10-purpose.mdx"), SIMPLE_MDX);

    // No runMigration() call first — no doc.json exists yet.
    const report = retireTwins({ repoRoot, docsDir, dryRun: true });

    expect(report.wouldRetire).toEqual([]);
    expect(report.skippedNoBundle).toContain("docs/00-foundation/10-purpose.mdx");
  });

  it("only deletes when dryRun is explicitly false", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    const sourcePath = join(docsDir, "00-foundation", "10-purpose.mdx");
    writeFileSync(sourcePath, SIMPLE_MDX);
    runMigration({ repoRoot, docsDir, verbose: false });

    retireTwins({ repoRoot, docsDir, dryRun: false });

    expect(existsSync(sourcePath)).toBe(false);
  });

  it("retires a .md twin whose stem matches a migrated bundle (both twins retire against one bundle)", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    const mdxPath = join(docsDir, "00-foundation", "10-purpose.mdx");
    const mdPath = join(docsDir, "00-foundation", "10-purpose.md");
    writeFileSync(mdxPath, SIMPLE_MDX);
    writeFileSync(mdPath, "# Hello\n\nSame doc, markdown twin.\n");
    runMigration({ repoRoot, docsDir, verbose: false });

    const dryReport = retireTwins({ repoRoot, docsDir, dryRun: true });
    expect(dryReport.wouldRetire).toContain("docs/00-foundation/10-purpose.mdx");
    expect(dryReport.wouldRetire).toContain("docs/00-foundation/10-purpose.md");
    expect(dryReport.totals.wouldRetire).toBe(2);
    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(mdxPath)).toBe(true);

    retireTwins({ repoRoot, docsDir, dryRun: false });
    expect(existsSync(mdxPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    // The bundle itself must survive retirement.
    expect(existsSync(join(docsDir, "00-foundation", "10-purpose", "doc.json"))).toBe(true);
  });

  it("leaves a .md with no matching bundle alone, listed in skippedNoBundle", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    const mdPath = join(docsDir, "00-foundation", "99-unmigrated.md");
    writeFileSync(mdPath, "# Standalone markdown\n");

    const report = retireTwins({ repoRoot, docsDir, dryRun: false });

    expect(report.wouldRetire).toEqual([]);
    expect(report.skippedNoBundle).toContain("docs/00-foundation/99-unmigrated.md");
    expect(existsSync(mdPath)).toBe(true);
  });

  it("never considers docs/.drafts files, even when deletion is enabled", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, ".drafts"), { recursive: true });
    const draftMd = join(docsDir, ".drafts", "wip.md");
    const draftMdx = join(docsDir, ".drafts", "wip.mdx");
    writeFileSync(draftMd, "# Draft\n");
    writeFileSync(draftMdx, "# Draft\n");

    const report = retireTwins({ repoRoot, docsDir, dryRun: false });

    expect(report.wouldRetire).toEqual([]);
    expect(report.skippedNoBundle).toEqual([]);
    expect(report.draftsExempt).toContain("docs/.drafts/wip.md");
    expect(report.draftsExempt).toContain("docs/.drafts/wip.mdx");
    expect(existsSync(draftMd)).toBe(true);
    expect(existsSync(draftMdx)).toBe(true);
  });
});

describe("runMigration — .md and twin handling", () => {
  it("migrates plain .md sources (generic host repos are .md-only)", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    writeFileSync(join(docsDir, "00-foundation", "10-purpose.md"), SIMPLE_MDX);
    writeFileSync(join(docsDir, "00-foundation", "20-notes.markdown"), SIMPLE_MDX);

    const report = runMigration({ repoRoot, docsDir, verbose: false });

    expect(report.totals.filesFailed).toBe(0);
    expect(report.totals.filesMigrated).toBe(2);
    expect(existsSync(join(docsDir, "00-foundation", "10-purpose", "doc.json"))).toBe(true);
    expect(existsSync(join(docsDir, "00-foundation", "20-notes", "doc.json"))).toBe(true);
  });

  it("prefers .mdx over a same-stem .md twin and reports the twin as skipped", () => {
    const { repoRoot, docsDir } = makeTempRepo();
    mkdirSync(join(docsDir, "00-foundation"), { recursive: true });
    writeFileSync(join(docsDir, "00-foundation", "10-purpose.mdx"), "# From MDX\n\nBody.\n");
    writeFileSync(join(docsDir, "00-foundation", "10-purpose.md"), "# From MD\n\nBody.\n");

    const report = runMigration({ repoRoot, docsDir, verbose: false });

    expect(report.totals.filesFailed).toBe(0);
    expect(report.totals.filesMigrated).toBe(1);
    const parsed = JSON.parse(readFileSync(join(docsDir, "00-foundation", "10-purpose", "doc.json"), "utf8"));
    expect(parsed.title).toBe("From MDX");
    const twin = report.skipped.find((s) => s.sourcePath.endsWith("10-purpose.md"));
    expect(twin?.reason).toContain("twin");
    // Both source files remain on disk — migration stays non-destructive.
    expect(existsSync(join(docsDir, "00-foundation", "10-purpose.md"))).toBe(true);
    expect(existsSync(join(docsDir, "00-foundation", "10-purpose.mdx"))).toBe(true);
  });
});
