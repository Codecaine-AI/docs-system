#!/usr/bin/env bun
/**
 * Whole-tree migration runner (M2 migration, TG4.3).
 *
 * Walks docs/, converts every .mdx into a folder-bundle doc.json per design
 * record §4.1:
 *   docs/00-foundation/00-overview.mdx -> docs/00-foundation/00-overview/doc.json
 *   docs/10-system-design/50-interactive-canvas/index.mdx
 *     -> docs/10-system-design/50-interactive-canvas/doc.json (folder-with-index
 *        docs keep doc.json in the existing folder, no extra nesting)
 *
 * This run WRITES ALONGSIDE existing files — it never modifies, moves, or
 * deletes any .mdx/.md/asset. Canvas/asset sidecars referenced by a doc's own
 * `./assets/...` relative paths are COPIED (not moved) into the new bundle's
 * assets/ folder so the doc.json's relative `src` props keep resolving from
 * the bundle's location.
 *
 * `docs/.drafts/` is exempt by default (§8.5) — a non-rendered zone, not
 * migrated unless --drafts is passed explicitly.
 *
 * Twin retirement (deleting the now-superseded .mdx files) is implemented as
 * an explicit, isolated, opt-in step behind --retire-twins (+ --dry-run) —
 * see retireTwins() below. It is never invoked by a default run and MUST NOT
 * be run in this migration session per the coordinator's scope gate.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { dirname, join, relative, basename, extname } from "node:path";
import { mdxToDoc } from "./mdx-to-doc";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";

export type RunOptions = {
  repoRoot: string;
  docsDir?: string;
  /** Migrate docs/.drafts too. Default false (exempt, §8.5). */
  includeDrafts?: boolean;
  /** Print progress to stdout. Default true. */
  verbose?: boolean;
};

export type MigratedFileReport = {
  sourcePath: string;
  bundleDir: string;
  docJsonPath: string;
  blockCount: number;
  warnings: string[];
  assetsCopied: string[];
};

export type SkippedFileReport = {
  sourcePath: string;
  reason: string;
};

export type FailedFileReport = {
  sourcePath: string;
  error: string;
};

export type MigrationReport = {
  generatedAt: string;
  docsDir: string;
  draftsPolicy: "exempt" | "included";
  totals: {
    filesFound: number;
    filesMigrated: number;
    filesSkipped: number;
    filesFailed: number;
    blocksCreated: number;
    warnings: number;
  };
  migrated: MigratedFileReport[];
  skipped: SkippedFileReport[];
  failed: FailedFileReport[];
  warnings: Array<{ sourcePath: string; message: string }>;
};

function walkFilesByExtension(dir: string, extensions: readonly string[]): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFilesByExtension(full, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

/** Source extensions the migrator accepts, in twin-preference order. */
const SOURCE_EXTENSIONS = [".mdx", ".md", ".markdown"] as const;

/**
 * Walks every markdown-family source under `dir`. Spectre's original tree was
 * .mdx-only, but generic host repos are typically plain .md — both migrate
 * through the same pipeline (MDX is a superset). When multiple extensions
 * share one stem in one directory (a twin pair like a.mdx + a.md), only the
 * most-preferred extension is returned; the others are reported as twins.
 */
function walkSourceFiles(dir: string): { sources: string[]; twinsSkipped: string[] } {
  const all = walkFilesByExtension(dir, SOURCE_EXTENSIONS);
  const byStem = new Map<string, string[]>();
  for (const file of all) {
    const stemKey = join(dirname(file), basename(file, extname(file)));
    const group = byStem.get(stemKey);
    if (group) group.push(file);
    else byStem.set(stemKey, [file]);
  }
  const sources: string[] = [];
  const twinsSkipped: string[] = [];
  for (const group of byStem.values()) {
    group.sort(
      (a, b) =>
        SOURCE_EXTENSIONS.indexOf(extname(a) as (typeof SOURCE_EXTENSIONS)[number]) -
        SOURCE_EXTENSIONS.indexOf(extname(b) as (typeof SOURCE_EXTENSIONS)[number]),
    );
    sources.push(group[0]);
    twinsSkipped.push(...group.slice(1));
  }
  sources.sort();
  return { sources, twinsSkipped };
}

/** Twin extensions eligible for retirement once a bundle exists (§8.5: ".md/.mdx twins"). */
const RETIREMENT_EXTENSIONS = [".mdx", ".md", ".markdown"] as const;

/**
 * Computes the bundle directory (absolute path) that a given .mdx source
 * should migrate into, per §4.1 folder-per-doc anatomy.
 */
function bundleDirFor(sourceAbsPath: string): string {
  const dir = dirname(sourceAbsPath);
  const stem = basename(sourceAbsPath, extname(sourceAbsPath));
  if (stem === "index") {
    // Folder-with-index doc: doc.json lands directly in the existing folder.
    return dir;
  }
  // Sibling .mdx file: mint a new subfolder named after the stem so ordering
  // (numbered filename) carries over as a numbered folder name.
  return join(dir, stem);
}

/**
 * Finds `./assets/...`-relative sidecar references inside a doc's own source
 * (Canvas src attrs today; generalized to any `src="./assets/..."` or
 * `src='./assets/...'` attribute so future asset-bearing blocks are covered
 * for free) and copies each referenced file from the source doc's directory
 * into the bundle directory, preserving its relative path under assets/.
 * Returns the list of repo-relative destination paths copied.
 */
function copyLocalAssets(sourceAbsPath: string, bundleDir: string, repoRoot: string): string[] {
  const sourceDir = dirname(sourceAbsPath);
  const content = readFileSync(sourceAbsPath, "utf8");
  const assetRefRe = /src=["'](\.\/assets\/[^"']+)["']/g;
  const copied: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(assetRefRe)) {
    const relPath = match[1]; // e.g. ./assets/canvases/foo.canvas.json
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const sourceAssetPath = join(sourceDir, relPath);
    if (!existsSync(sourceAssetPath)) continue; // dangling ref — leave to the report's warnings via mdxToDoc, nothing to copy
    const destAssetPath = join(bundleDir, relPath);
    mkdirSync(dirname(destAssetPath), { recursive: true });
    copyFileSync(sourceAssetPath, destAssetPath);
    copied.push(relative(repoRoot, destAssetPath));
  }
  return copied;
}

export function runMigration(options: RunOptions): MigrationReport {
  const repoRoot = options.repoRoot;
  const docsDir = options.docsDir ?? join(repoRoot, "docs");
  const verbose = options.verbose ?? true;
  const includeDrafts = options.includeDrafts ?? false;

  const { sources: allFiles, twinsSkipped } = walkSourceFiles(docsDir);
  const migrated: MigratedFileReport[] = [];
  const skipped: SkippedFileReport[] = [];
  const failed: FailedFileReport[] = [];
  const warnings: Array<{ sourcePath: string; message: string }> = [];

  for (const twin of twinsSkipped) {
    const repoRelTwin = relative(repoRoot, twin).split("\\").join("/");
    skipped.push({ sourcePath: repoRelTwin, reason: "lower-preference twin of a sibling source with the same stem" });
    if (verbose) console.log(`[docs-migrate] SKIP  (twin) ${repoRelTwin}`);
  }

  if (verbose) {
    console.log(
      `[docs-migrate] drafts policy: ${includeDrafts ? "INCLUDED (--drafts)" : "EXEMPT (default, §8.5)"}`,
    );
    console.log(
      `[docs-migrate] found ${allFiles.length} markdown source files (.mdx/.md/.markdown) under ${relative(repoRoot, docsDir)}`,
    );
  }

  for (const sourceAbsPath of allFiles) {
    const repoRelSource = relative(repoRoot, sourceAbsPath).split("\\").join("/");

    if (!includeDrafts && repoRelSource.startsWith("docs/.drafts/")) {
      skipped.push({ sourcePath: repoRelSource, reason: "docs/.drafts is exempt by default (§8.5)" });
      if (verbose) console.log(`[docs-migrate] SKIP  (drafts-exempt) ${repoRelSource}`);
      continue;
    }

    try {
      const source = readFileSync(sourceAbsPath, "utf8");
      const { doc, warnings: docWarnings } = mdxToDoc(source, repoRelSource);

      const validation = validateDocDocument(doc);
      if (!validation.ok) {
        const issueText = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`validateDocDocument failed: ${issueText}`);
      }

      const bundleDir = bundleDirFor(sourceAbsPath);
      mkdirSync(bundleDir, { recursive: true });
      const docJsonPath = join(bundleDir, "doc.json");
      writeFileSync(docJsonPath, serializeDocDocument(validation.document));

      const assetsCopied = copyLocalAssets(sourceAbsPath, bundleDir, repoRoot);

      for (const message of docWarnings) {
        warnings.push({ sourcePath: repoRelSource, message });
      }

      migrated.push({
        sourcePath: repoRelSource,
        bundleDir: relative(repoRoot, bundleDir),
        docJsonPath: relative(repoRoot, docJsonPath),
        blockCount: Object.keys(validation.document.blocks).length,
        warnings: docWarnings,
        assetsCopied,
      });

      if (verbose) {
        const warnSuffix = docWarnings.length > 0 ? ` (${docWarnings.length} warning(s))` : "";
        console.log(
          `[docs-migrate] OK    ${repoRelSource} -> ${relative(repoRoot, docJsonPath)}${warnSuffix}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ sourcePath: repoRelSource, error: message });
      if (verbose) console.log(`[docs-migrate] FAIL  ${repoRelSource}: ${message}`);
    }
  }

  const report: MigrationReport = {
    generatedAt: new Date().toISOString(),
    docsDir: relative(repoRoot, docsDir),
    draftsPolicy: includeDrafts ? "included" : "exempt",
    totals: {
      filesFound: allFiles.length,
      filesMigrated: migrated.length,
      filesSkipped: skipped.length,
      filesFailed: failed.length,
      blocksCreated: migrated.reduce((sum, entry) => sum + entry.blockCount, 0),
      warnings: warnings.length,
    },
    migrated,
    skipped,
    failed,
    warnings,
  };

  return report;
}

// ---------------------------------------------------------------------------
// Twin retirement (implemented, gated, NEVER invoked in this migration run)
// ---------------------------------------------------------------------------

export type RetireTwinsOptions = {
  repoRoot: string;
  docsDir?: string;
  /** When true, only prints what would be deleted — no filesystem writes. */
  dryRun?: boolean;
};

export type RetireTwinsReport = {
  dryRun: boolean;
  /** .mdx/.md/.markdown twins that have a matching doc.json bundle and would be retired. */
  wouldRetire: string[];
  /** Twin files with no migrated bundle yet — left alone, reported for visibility. */
  skippedNoBundle: string[];
  /** docs/.drafts files — always exempt from retirement, never considered. */
  draftsExempt: string[];
  totals: {
    wouldRetire: number;
    skippedNoBundle: number;
    draftsExempt: number;
  };
};

/**
 * Deletes the markdown twins (.mdx AND .md/.markdown — §8.5 retires both)
 * for every doc that already has a migrated doc.json bundle. Twin matching
 * uses the same stem rule as bundle placement: `<dir>/<stem>.<ext>` retires
 * against `<dir>/<stem>/doc.json` (or `<dir>/doc.json` for index files), so
 * a .md and a .mdx sharing one stem both retire against the same bundle.
 * `docs/.drafts/**` is always exempt. This is the explicit, isolated
 * retirement step referenced by the design record's reversibility note
 * (§8.5) and the coordinator's scope gate — it is wired up and testable but
 * is NOT called by runMigration(), is NOT exposed as a default CLI action,
 * and must only run after browser QA gates the docs UI's read-surface swap
 * (CP5+). Always supports --dry-run.
 */
export function retireTwins(options: RetireTwinsOptions): RetireTwinsReport {
  const repoRoot = options.repoRoot;
  const docsDir = options.docsDir ?? join(repoRoot, "docs");
  const dryRun = options.dryRun ?? true;

  const allFiles = walkFilesByExtension(docsDir, RETIREMENT_EXTENSIONS);
  const wouldRetire: string[] = [];
  const skippedNoBundle: string[] = [];
  const draftsExempt: string[] = [];

  for (const sourceAbsPath of allFiles) {
    const repoRelSource = relative(repoRoot, sourceAbsPath).split("\\").join("/");
    if (repoRelSource.startsWith("docs/.drafts/")) {
      draftsExempt.push(repoRelSource);
      continue;
    }
    const bundleDir = bundleDirFor(sourceAbsPath);
    const docJsonPath = join(bundleDir, "doc.json");
    if (existsSync(docJsonPath)) {
      wouldRetire.push(repoRelSource);
      if (!dryRun) {
        rmSync(sourceAbsPath);
      }
    } else {
      skippedNoBundle.push(repoRelSource);
    }
  }

  return {
    dryRun,
    wouldRetire,
    skippedNoBundle,
    draftsExempt,
    totals: {
      wouldRetire: wouldRetire.length,
      skippedNoBundle: skippedNoBundle.length,
      draftsExempt: draftsExempt.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Repo-root discovery (shared with the docs-cli `migrate` command entry)
// ---------------------------------------------------------------------------

/**
 * Walks upward from `startDir` looking for a directory that has both a
 * package.json and a docs/ folder. Falls back to `startDir` when none is
 * found within 10 levels. The CLI wiring (the `migrate` subcommand in
 * ../index.ts) uses this when no explicit repo root is passed.
 */
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "docs"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
