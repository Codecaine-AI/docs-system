#!/usr/bin/env bun
/**
 * The one list of docs-system test areas. `bun run test`, the Makefile's
 * `test-<area>` targets and CI (.github/workflows/test.yml) all run from it.
 *
 *   bun scripts/test-packages.ts                 run every area, keep going, exit 1 if any failed
 *   bun scripts/test-packages.ts docs-model ...  run the named areas
 *   bun scripts/test-packages.ts --list          print the area names as a JSON array
 *   git diff --name-only ... | bun scripts/test-packages.ts --affected
 *                                                print the areas a change set must run
 *
 * Every run passes explicit paths; a bare `bun test` would sweep external/,
 * hill-climb/ and other trees that are not suites. Packages with their own
 * bunfig.toml run from their own folder so their preload list applies.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { linkPackages } from "./link-packages";

type Area = {
  /** Folder the run starts in, relative to docs-system. */
  cwd: string;
  /** Paths handed to `bun test`, relative to `cwd`. */
  paths: string[];
};

export const AREAS: Record<string, Area> = {
  "docs-model": { cwd: ".", paths: ["./packages/docs-model"] },
  "docs-style": { cwd: ".", paths: ["./packages/docs-style"] },
  "docs-index": { cwd: ".", paths: ["./packages/docs-index"] },
  "docs-cli": { cwd: ".", paths: ["./packages/docs-cli"] },
  "docs-server": { cwd: ".", paths: ["./packages/docs-server"] },
  "docs-viewer": { cwd: ".", paths: ["./packages/docs-viewer"] },
  "docs-workbench": { cwd: ".", paths: ["./packages/docs-workbench/src", "./packages/docs-workbench/web/src"] },
  // docs-mcp's bunfig.toml leaves out the DOM preloads on purpose.
  "docs-mcp": { cwd: "packages/docs-mcp", paths: ["./src"] },
  // From the root: its editor tests need the root DOM preloads, and it has no bunfig.toml.
  "docs-publish": { cwd: ".", paths: ["./packages/docs-publish"] },
  // Root-level suites that belong to no package.
  repo: { cwd: ".", paths: ["./evals/quality-climb", "./import-boundaries.test.ts"] },
};

const root = resolve(import.meta.dir, "..");

/** Area name → the package folder it tests, for areas that test one package. */
function areaPackageDirs(): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const [name, area] of Object.entries(AREAS)) {
    const dir = (area.cwd === "." ? area.paths[0] : area.cwd)?.replace(/^\.\//, "").match(/^packages\/[^/]+/)?.[0];
    if (dir) dirs.set(name, dir);
  }
  return dirs;
}

/**
 * The areas a change set must run. A file in one package selects that
 * package's area and the area of every docs-system package that depends on
 * it, directly or through other packages. Any file outside packages/ (root
 * config, preloads, scripts, lockfiles, CI) selects every area. The repo area
 * runs on every change: import-boundaries checks all packages.
 */
export function affectedAreas(changedFiles: string[]): string[] {
  const all = Object.keys(AREAS);
  const files = changedFiles.map((file) => file.trim()).filter(Boolean);
  if (files.some((file) => !file.startsWith("packages/"))) return all;

  const graph = packageGraph();
  if (!graph) return all; // A cross-package reference did not resolve: run everything.

  const changed = new Set(files.map((file) => file.split("/").slice(0, 2).join("/")));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [dir, deps] of graph) {
      if (changed.has(dir)) continue;
      if ([...deps].some((dep) => changed.has(dep))) {
        changed.add(dir);
        grew = true;
      }
    }
  }
  const dirs = areaPackageDirs();
  return all.filter((name) => name === "repo" || changed.has(dirs.get(name) ?? ""));
}

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];

/**
 * Package folder → the other docs-system package folders its source and tests
 * reach. Read from the code, not package.json (some tests use packages their
 * package.json does not declare), counting three kinds of reference:
 * - `@codecaine-ai/docs-*` imports;
 * - relative imports and re-exports that climb into another package
 *   (`../../docs-viewer/src/...`);
 * - `new URL("../...", import.meta.url)` paths, which tests use to read another
 *   package's files; a template literal counts by its static prefix.
 * Returns null when a reference into packages/ resolves to no package or file,
 * so the caller fails toward running every area.
 */
function packageGraph(): Map<string, Set<string>> | null {
  const packagesDir = join(root, "packages");
  const dirOfName = new Map<string, string>();
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const name = JSON.parse(readFileSync(join(packagesDir, entry.name, "package.json"), "utf8")).name;
      dirOfName.set(name, `packages/${entry.name}`);
    } catch {}
  }
  const known = new Set(dirOfName.values());
  const namePattern = /["'](@codecaine-ai\/docs-[a-z-]+)/g;
  const relativePattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']*)["']|\bnew URL\(\s*(["'`])(\.{1,2}\/[^"'`]*?)(?:\$\{[^`]*)?\3?\s*,\s*import\.meta\.url/g;

  const graph = new Map<string, Set<string>>();
  for (const dir of known) {
    const deps = new Set<string>();
    for (const file of new Bun.Glob("**/*.{ts,tsx,mts,js,mjs}").scanSync({ cwd: join(root, dir) })) {
      if (file.includes("node_modules/") || file.includes("dist/")) continue;
      const source = readFileSync(join(root, dir, file), "utf8");
      for (const match of source.matchAll(namePattern)) {
        const target = dirOfName.get(match[1]!);
        if (target && target !== dir) deps.add(target);
      }
      for (const match of source.matchAll(relativePattern)) {
        const spec = match[1] ?? match[3]!;
        const target = relative(root, resolve(join(root, dir, file, ".."), spec));
        if (!target.startsWith("packages/")) continue; // Root files: a change there already runs every area.
        const targetDir = target.split("/").slice(0, 2).join("/");
        if (targetDir === dir) continue;
        // A third-party module reached through another package's node_modules
        // (docs-publish's build.ts loads docs-workbench's vite plugins) is no
        // dependency on that package's code, and bun may hoist it elsewhere.
        if (target.split("/")[2] === "node_modules") continue;
        if (!known.has(targetDir)) return null;
        // A template literal's prefix names a folder; anything else must name a real file.
        const isPrefix = match[3] !== undefined && match[0].includes("${");
        if (!isPrefix && !SOURCE_EXTENSIONS.some((ext) => existsSync(join(root, target + ext)))) return null;
        deps.add(targetDir);
      }
    }
    graph.set(dir, deps);
  }
  return graph;
}

function runArea(name: string): number {
  const area = AREAS[name];
  if (!area) throw new Error(`Unknown test area "${name}". Areas: ${Object.keys(AREAS).join(", ")}`);
  console.log(`\n=== ${name}: (cd ${area.cwd} && bun test ${area.paths.join(" ")})`);
  const result = Bun.spawnSync(["bun", "test", ...area.paths], {
    cwd: resolve(root, area.cwd),
    stdio: ["inherit", "inherit", "inherit"],
  });
  return result.exitCode ?? 1;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "--list") {
    console.log(JSON.stringify(Object.keys(AREAS)));
  } else if (args[0] === "--affected") {
    // Changed file paths (relative to docs-system), one per line, on stdin.
    console.log(JSON.stringify(affectedAreas((await Bun.stdin.text()).split("\n"))));
  } else {
    // A worktree must test its own packages, not the main checkout's copies.
    linkPackages();
    const names = args.length > 0 ? args : Object.keys(AREAS);
    const failed = names.filter((name) => runArea(name) !== 0);
    if (names.length > 1) {
      console.log(`\n${names.length - failed.length}/${names.length} areas passed.${failed.length ? ` Failed: ${failed.join(", ")}` : ""}`);
    }
    process.exitCode = failed.length > 0 ? 1 : 0;
  }
}
