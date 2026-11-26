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
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

  // Package folder → names of the docs-system packages its source and tests
  // import. Read from the code, not package.json: some tests import packages
  // their package.json does not declare.
  const nameOf = new Map<string, string>();
  const depsOf = new Map<string, string[]>();
  const importPattern = /["'](@codecaine-ai\/docs-[a-z-]+)/g;
  for (const entry of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = `packages/${entry.name}`;
    try {
      nameOf.set(dir, JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")).name);
    } catch {
      continue;
    }
    const imports = new Set<string>();
    for (const file of new Bun.Glob("**/*.{ts,tsx,mts,js,mjs}").scanSync({ cwd: join(root, dir) })) {
      if (file.includes("node_modules/") || file.includes("dist/")) continue;
      for (const match of readFileSync(join(root, dir, file), "utf8").matchAll(importPattern)) imports.add(match[1]!);
    }
    depsOf.set(dir, [...imports]);
  }
  const changed = new Set(files.map((file) => file.split("/").slice(0, 2).join("/")));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [dir, deps] of depsOf) {
      if (changed.has(dir)) continue;
      if ([...changed].some((changedDir) => deps.includes(nameOf.get(changedDir) ?? ""))) {
        changed.add(dir);
        grew = true;
      }
    }
  }
  const dirs = areaPackageDirs();
  return all.filter((name) => name === "repo" || changed.has(dirs.get(name) ?? ""));
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
