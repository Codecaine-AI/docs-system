import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { openBacklinksDb, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import { normalizeDocRefPath } from "@codecaine-ai/docs-index/ref-match";

export type GrepMatch = { path: string; line: number; text: string };

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function resolveCandidate(inputPath: string): Promise<string | null> {
  const resolved = path.resolve(inputPath);
  if (/\.json$/i.test(inputPath) && (await fileExists(resolved))) return resolved;
  if (await directoryExists(resolved)) {
    const nested = path.join(resolved, "doc.json");
    if (await fileExists(nested)) return nested;
  }
  const bareBundle = path.resolve(`${inputPath}.doc.json`);
  if (await fileExists(bareBundle)) return bareBundle;
  const nested = path.join(resolved, "doc.json");
  if (await fileExists(nested)) return nested;
  return null;
}

export async function resolveDocJsonPath(inputPath: string): Promise<string> {
  const direct = await resolveCandidate(inputPath);
  if (direct) return direct;

  const docsRelative = await resolveCandidate(path.join("docs", inputPath));
  if (docsRelative) return docsRelative;

  throw new Error(`Could not resolve a doc.json bundle for: ${inputPath}`);
}

export async function loadAndProjectDoc(jsonPath: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse doc.json at ${jsonPath}: ${message}`);
  }

  const result = validateDocDocument(parsed);
  if (!result.ok) {
    const issues = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid doc.json at ${jsonPath}: ${issues}`);
  }

  return projectToMarkdown(result.document as DocDocument);
}

function shouldSkipDir(name: string): boolean {
  return name === "node_modules" || name === ".git" || name.startsWith(".");
}

export async function findDocJsonBundles(root: string): Promise<string[]> {
  const rootPath = path.resolve(root);
  await access(rootPath);

  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      if (entry.isFile() && (entry.name === "doc.json" || /\.doc\.json$/i.test(entry.name))) {
        found.push(path.join(dir, entry.name));
      }
    }
  }

  const stats = await stat(rootPath);
  if (stats.isFile()) {
    if (path.basename(rootPath).startsWith(".")) return [];
    if (path.basename(rootPath) === "doc.json" || /\.doc\.json$/i.test(rootPath)) return [rootPath];
    return [];
  }
  await walk(rootPath);
  return found.sort();
}

function relativePosixPath(from: string, to: string): string {
  return path.relative(path.resolve(from), to).split(path.sep).join(path.posix.sep);
}

export async function grepCommand(
  term: string,
  rootDir: string,
  options?: { caseSensitive?: boolean },
): Promise<GrepMatch[]> {
  const bundles = await findDocJsonBundles(rootDir);
  const needle = options?.caseSensitive ? term : term.toLowerCase();
  const matches: GrepMatch[] = [];

  for (const bundlePath of bundles) {
    let markdown: string;
    try {
      markdown = await loadAndProjectDoc(bundlePath);
    } catch {
      continue;
    }

    markdown.split(/\r?\n/).forEach((line, index) => {
      const haystack = options?.caseSensitive ? line : line.toLowerCase();
      if (haystack.includes(needle)) {
        matches.push({
          path: relativePosixPath(rootDir, bundlePath),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }

  return matches;
}

/**
 * Resolves the docsRoot the `backlinks`/`links` subcommands operate against:
 * an explicit arg if given, otherwise `./docs` resolved relative to the
 * current working directory (the CLI is documented as run from repo root).
 */
function resolveDocsRoot(explicit?: string): string {
  return path.resolve(explicit ?? "docs");
}

export type BacklinksRescanResult = {
  dbPath: string;
  sourcesScanned: number;
  refsIndexed: number;
};

/** `docs backlinks rescan [docsRoot]` (TG7.1): rebuilds the index from scratch. */
export async function backlinksRescanCommand(docsRootArg?: string): Promise<BacklinksRescanResult> {
  const docsRoot = resolveDocsRoot(docsRootArg);
  return rescanAll(docsRoot);
}

export type StaleLink = {
  sourcePath: string;
  sourceBlockId: string;
  targetPath: string;
  reason: string;
};

/**
 * `docs links check [docsRoot]` (TG7.2): rescans the index, then for every
 * indexed `kind: "doc"` backlink target, checks whether a bundle actually
 * exists at its normalized canonical path (`<docsRoot>/<canonical>/doc.json`).
 * `kind: "source"` targets are checked against the repo root (they're plain
 * repo-relative file paths, not bundle paths — see ref-match.ts's module
 * doc). Returns every unresolvable reference found; callers should exit
 * non-zero when the array is non-empty.
 *
 * NOTE: since reference spans are still in their pre-migration
 * `docs/<path>.md` form (never rewritten except by move-doc), a target is
 * considered resolved if EITHER its pre-migration file form OR its
 * post-migration bundle form exists on disk — that ambiguity is expected
 * and not itself a finding. Only references matching NEITHER form are
 * reported.
 */
export async function linksCheckCommand(docsRootArg?: string): Promise<StaleLink[]> {
  const docsRoot = resolveDocsRoot(docsRootArg);
  const repoRoot = path.resolve(docsRoot, "..");
  const db = await openBacklinksDb(docsRoot);
  await rescanAll(docsRoot, db);

  const rows = db
    .query(
      `SELECT DISTINCT source_path, source_block_id, target_kind, target_path
       FROM backlinks`,
    )
    .all() as Array<{
    source_path: string;
    source_block_id: string;
    target_kind: string;
    target_path: string;
  }>;

  const stale: StaleLink[] = [];
  for (const row of rows) {
    if (row.target_kind === "doc") {
      const canonical = normalizeDocRefPath(row.target_path);
      const bundleCandidate = path.join(docsRoot, canonical, "doc.json");
      const preMigrationMd = path.join(docsRoot, `${canonical}.md`);
      const preMigrationMdx = path.join(docsRoot, `${canonical}.mdx`);
      const resolved =
        (await fileExists(bundleCandidate)) ||
        (await fileExists(preMigrationMd)) ||
        (await fileExists(preMigrationMdx));
      if (!resolved) {
        stale.push({
          sourcePath: row.source_path,
          sourceBlockId: row.source_block_id,
          targetPath: row.target_path,
          reason: `No bundle or file found for doc reference (checked ${canonical}/doc.json, ${canonical}.md, ${canonical}.mdx)`,
        });
      }
      continue;
    }

    // kind === "source": a plain repo-relative file path.
    const sourceCandidate = path.join(repoRoot, row.target_path);
    if (!(await fileExists(sourceCandidate))) {
      stale.push({
        sourcePath: row.source_path,
        sourceBlockId: row.source_block_id,
        targetPath: row.target_path,
        reason: `Source file not found at ${row.target_path}`,
      });
    }
  }

  return stale.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

function usage(): string {
  return [
    "Usage:",
    "  docs-cli render <path>",
    "  docs-cli grep <term> [pathPrefix]",
    "  docs-cli backlinks rescan [docsRoot]",
    "  docs-cli links check [docsRoot]",
    "  docs-cli migrate [repoRoot] [--drafts] [--dry-run]",
    "  docs-cli serve [--root <path>] [--port <port>] [--ui-port <port>] [--host <addr>] [--dev] [--rebuild]",
    "  docs-cli export [--root <path>] --out <dir> [--rebuild]",
    "",
    "migrate is NON-DESTRUCTIVE by default: it writes doc.json bundles",
    "alongside the existing .mdx sources and never modifies or deletes them.",
    "(--retire-twins additionally DELETES the superseded .md/.mdx twins — it",
    "is dangerous, and refuses to run without BOTH --retire-twins and",
    "--yes-delete-markdown unless --dry-run is passed.)",
  ].join("\n");
}

/** Pulls `--flag value` out of an argv slice; returns the value (or undefined). */
function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

/**
 * `docs-cli migrate` — whole-tree .mdx -> doc.json bundle migration
 * (see ./migrate/run.ts). Non-destructive by default: bundles are written
 * ALONGSIDE the markdown sources. Twin retirement (deleting the markdown)
 * only runs behind the explicit --retire-twins + --yes-delete-markdown pair.
 */
async function migrateCommand(args: string[]): Promise<void> {
  const { findRepoRoot, retireTwins, runMigration } = await import("./migrate/run");
  const { writeFileSync } = await import("node:fs");

  const positional = args.filter((arg) => !arg.startsWith("--"));
  const repoRoot = path.resolve(positional[0] ?? findRepoRoot(process.cwd()));
  const includeDrafts = args.includes("--drafts");
  const retire = args.includes("--retire-twins");
  const dryRun = args.includes("--dry-run");
  const confirmedDelete = args.includes("--yes-delete-markdown");

  if (retire) {
    // DANGEROUS branch: deletes .md/.mdx twins that have a migrated bundle.
    // A real (non-dry-run) retirement demands the extra explicit
    // --yes-delete-markdown confirmation so it can never be reached by a
    // mistyped or half-remembered invocation.
    if (!dryRun && !confirmedDelete) {
      console.error(
        "--retire-twins DELETES markdown twins. Re-run with --dry-run to preview, " +
          "or add --yes-delete-markdown to confirm the deletion.",
      );
      process.exitCode = 1;
      return;
    }
    const report = retireTwins({ repoRoot, dryRun });
    console.log(JSON.stringify(report, null, 2));
    if (report.dryRun) {
      console.log(
        `[docs-migrate] DRY RUN — would retire ${report.totals.wouldRetire} .md/.mdx twin(s); ` +
          `${report.totals.skippedNoBundle} file(s) have no migrated bundle yet and were left alone; ` +
          `${report.totals.draftsExempt} docs/.drafts file(s) exempt.`,
      );
    } else {
      console.log(`[docs-migrate] Retired ${report.totals.wouldRetire} .md/.mdx twin(s).`);
    }
    return;
  }

  const report = runMigration({ repoRoot, includeDrafts, verbose: true });

  const reportPath = path.join(repoRoot, "docs-migrate-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\n[docs-migrate] Summary");
  console.log(`  files found:    ${report.totals.filesFound}`);
  console.log(`  files migrated: ${report.totals.filesMigrated}`);
  console.log(`  files skipped:  ${report.totals.filesSkipped} (drafts-exempt)`);
  console.log(`  files failed:   ${report.totals.filesFailed}`);
  console.log(`  blocks created: ${report.totals.blocksCreated}`);
  console.log(`  warnings:       ${report.totals.warnings}`);
  console.log(`  report written: ${path.relative(repoRoot, reportPath)}`);

  if (report.totals.filesFailed > 0) {
    console.log("\n[docs-migrate] FAILURES:");
    for (const failure of report.failed) {
      console.log(`  - ${failure.sourcePath}: ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "render" && args[0]) {
      const markdown = await renderCommand(args[0]);
      console.log(markdown);
      process.exitCode = 0;
      return;
    }

    if (command === "grep" && args[0]) {
      const matches = await grepCommand(args[0], args[1] ?? "docs");
      for (const match of matches) {
        console.log(`${match.path}:${match.line}: ${match.text}`);
      }
      console.log(`\n${matches.length} match(es)`);
      process.exitCode = 0;
      return;
    }

    if (command === "backlinks" && args[0] === "rescan") {
      const result = await backlinksRescanCommand(args[1]);
      console.log(`Backlinks index: ${result.dbPath}`);
      console.log(`Sources scanned: ${result.sourcesScanned}`);
      console.log(`References indexed: ${result.refsIndexed}`);
      process.exitCode = 0;
      return;
    }

    if (command === "links" && args[0] === "check") {
      const stale = await linksCheckCommand(args[1]);
      for (const link of stale) {
        console.log(`${link.sourcePath}:${link.sourceBlockId} -> ${link.targetPath}`);
        console.log(`  ${link.reason}`);
      }
      console.log(`\n${stale.length} stale reference(s)`);
      process.exitCode = stale.length > 0 ? 1 : 0;
      return;
    }

    if (command === "migrate") {
      await migrateCommand(args);
      return;
    }

    if (command === "serve") {
      // Standalone read-only docs server + viewer SPA (packages/docs-workbench).
      //   docs-cli serve [--root <path>] [--port <port>] [--ui-port <port>] [--host <addr>] [--dev] [--rebuild]
      // Default mode vite-builds the SPA once (cached) and serves API + SPA
      // from one port; --dev spawns `vite dev` with an /api proxy instead.
      // Binds loopback unless --host is given (the docs tree may be private).
      const root = path.resolve(flagValue(args, "--root") ?? "docs");
      const port = Number(flagValue(args, "--port") ?? "4800");
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        console.error(`Invalid --port: ${flagValue(args, "--port")}`);
        process.exitCode = 1;
        return;
      }
      const uiPortValue = flagValue(args, "--ui-port");
      const uiPort = uiPortValue === undefined ? undefined : Number(uiPortValue);
      if (uiPort !== undefined && (!Number.isInteger(uiPort) || uiPort <= 0 || uiPort > 65535)) {
        console.error(`Invalid --ui-port: ${uiPortValue}`);
        process.exitCode = 1;
        return;
      }
      const { runServe } = await import("@codecaine-ai/docs-workbench");
      await runServe({
        docsRoot: root,
        port,
        uiPort,
        hostname: flagValue(args, "--host"),
        dev: args.includes("--dev"),
        forceBuild: args.includes("--rebuild"),
      });
      return;
    }

    if (command === "export") {
      // Static-site export (packages/docs-workbench/src/export.ts):
      //   docs-cli export [--root <path>] --out <dir> [--rebuild]
      const root = path.resolve(flagValue(args, "--root") ?? "docs");
      const out = flagValue(args, "--out");
      if (!out) {
        console.error("docs-cli export requires --out <dir>.");
        process.exitCode = 1;
        return;
      }
      const { runExport } = await import("@codecaine-ai/docs-workbench");
      const report = await runExport({
        docsRoot: root,
        outDir: path.resolve(out),
        forceBuild: args.includes("--rebuild"),
        log: (message) => console.error(message),
      });
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.failures.length > 0 ? 1 : 0;
      return;
    }

    console.error(usage());
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

export async function renderCommand(inputPath: string): Promise<string> {
  const jsonPath = await resolveDocJsonPath(inputPath);
  return loadAndProjectDoc(jsonPath);
}

const isCliEntrypoint =
  import.meta.main || path.resolve(process.argv[1] ?? "") === path.resolve(import.meta.path);

if (isCliEntrypoint) {
  await main();
}
