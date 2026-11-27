#!/usr/bin/env bun
/**
 * Makes every `@codecaine-ai/docs-*` import resolve to THIS docs-system tree.
 *
 * Core's `bun install` links each docs-system package from
 * core/node_modules to core/docs-system/packages/*. A docs-system worktree
 * elsewhere under core (for example core/.worktrees/<name>) climbs to those
 * same links, so its tests would import the main checkout's packages. This
 * script links each package into <this tree>/node_modules/@codecaine-ai/,
 * which module resolution reaches first. Member packages (design-system,
 * text-measure, canvas, ...) keep resolving from core's pinned checkouts.
 *
 * A worktree also has no installed dependencies. Some packages install their
 * own versions (docs-workbench pins tailwindcss 4 while core has 3), and a
 * worktree outside core cannot climb to core/node_modules at all. So in a
 * worktree this script also mirrors, from the main checkout (found with
 * `git rev-parse --git-common-dir`):
 *   - each packages/<name>/node_modules;
 *   - core's node_modules, into <this tree>/node_modules (only when the
 *     worktree sits outside core and cannot climb to it).
 * A mirror is a real folder with one symlink per entry, so builds never write
 * into the main checkout. It skips caches (.vite, .vite-temp, ...) and this
 * repo's own @codecaine-ai/docs-* packages, and never replaces an existing
 * entry. In the main checkout, a submodule or without git these steps do nothing.
 *
 *   bun scripts/link-packages.ts           link, then print where packages resolve
 *   bun scripts/link-packages.ts --check   print only; exit 1 if a package resolves wrong
 */
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const scopeDir = join(root, "node_modules", "@codecaine-ai");

function docsPackages(): { name: string; dir: string }[] {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(root, "packages", entry.name);
      try {
        const { name } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
        return name?.startsWith("@codecaine-ai/") ? [{ name, dir }] : [];
      } catch {
        return [];
      }
    });
}

/** Idempotent: leaves a correct link alone and replaces a wrong one. */
export function linkPackages(): void {
  realFolder(scopeDir);
  for (const { name, dir } of docsPackages()) {
    const link = join(scopeDir, name.slice("@codecaine-ai/".length));
    const target = relative(dirname(link), dir);
    try {
      if (lstatSync(link).isSymbolicLink() && readlinkSync(link) === target) continue;
      rmSync(link, { recursive: true, force: true });
    } catch {
      // No link yet.
    }
    symlinkSync(target, link, "dir");
  }
}

/** The main checkout's root, or undefined in the main checkout, a submodule, a non-linked repo or without git. */
function mainCheckout(): string | undefined {
  try {
    const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { cwd: root });
    if (git.exitCode !== 0) return undefined;
    const [gitDir, commonDir] = git.stdout.toString().trim().split("\n").map((path) => realpathSync(path));
    if (!gitDir || !commonDir || gitDir === commonDir) return undefined;
    const main = dirname(commonDir);
    return main !== realpathSync(root) && isDir(join(main, "packages")) ? main : undefined;
  } catch {
    return undefined;
  }
}

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Makes dir a real folder. A symlink there (an older link or someone else's tree) is replaced, never written through. */
function realFolder(dir: string): void {
  try {
    if (lstatSync(dir).isSymbolicLink()) rmSync(dir);
  } catch {
    // Missing.
  }
  mkdirSync(dir, { recursive: true });
}

/**
 * Mirrors one node_modules folder: dest is a real folder holding a symlink per src entry it lacks.
 * Scope folders (@scope) and .bin are mirrored the same way, so no write goes through a link into the
 * main checkout. Other dot entries (.vite, .vite-temp, .cache) are caches and are skipped. This repo's
 * own @codecaine-ai/docs-* packages are skipped, so they keep resolving to this tree.
 */
function mirror(src: string, dest: string, skip: Set<string>): void {
  if (!isDir(src)) return;
  realFolder(dest);
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (skip.has(to)) continue;
    if (name.startsWith("@") || name === ".bin") mirror(from, to, skip);
    else if (!name.startsWith(".") && !exists(to)) symlinkSync(from, to);
  }
}

const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** Idempotent: in a worktree, links the dependencies the main checkout has installed and this tree lacks. */
export function linkDependencies(): void {
  const main = mainCheckout();
  if (!main) return;
  const own = docsPackages().map(({ name }) => name.slice("@codecaine-ai/".length));
  const ownLinks = (nodeModules: string) => new Set(own.map((name) => join(nodeModules, "@codecaine-ai", name)));
  for (const entry of readdirSync(join(main, "packages"), { withFileTypes: true })) {
    const pkg = join(root, "packages", entry.name);
    const nodeModules = join(pkg, "node_modules");
    if (entry.isDirectory() && isDir(pkg)) mirror(join(main, "packages", entry.name, "node_modules"), nodeModules, ownLinks(nodeModules));
  }
  // The nearest node_modules above the main checkout (core's). Mirror it only when this tree cannot climb to it.
  for (let dir = dirname(main); dir !== dirname(dir); dir = dirname(dir)) {
    const shared = join(dir, "node_modules");
    if (!isDir(shared)) continue;
    if (!inside(realpathSync(root), realpathSync(dir))) mirror(shared, join(root, "node_modules"), ownLinks(join(root, "node_modules")));
    return;
  }
}

const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);

/** The file a bare import resolves to, or its package.json when it has no "." export. */
function resolveSpec(spec: string, from: string): string {
  for (const candidate of [spec, `${spec}/package.json`]) {
    try {
      return Bun.resolveSync(candidate, from);
    } catch {}
  }
  return "UNRESOLVED";
}

/** Prints where each package resolves from a docs-system consumer; returns false on a wrong one. */
export function checkResolution(): boolean {
  const consumer = join(root, "packages", "docs-workbench");
  const external = join(root, "external");
  const rows: { spec: string; path: string; ok: boolean; want: string }[] = [];
  for (const { name } of docsPackages()) {
    const path = resolveSpec(name, consumer);
    rows.push({ spec: name, path, ok: inside(path, root) && !inside(path, external), want: "this tree" });
  }
  for (const spec of [
    "@codecaine-ai/design-system",
    "@codecaine-ai/text-measure",
    "@codecaine-ai/canvas",
    "@codecaine-ai/sequence",
    "@codecaine-ai/annotations",
    "@codecaine-ai/action-log",
  ]) {
    const path = resolveSpec(spec, consumer);
    // Members come from core's checkouts, never from this tree's external/ submodules.
    rows.push({ spec, path, ok: path !== "UNRESOLVED" && !inside(path, root), want: "core member" });
  }
  console.log(`docs-system tree under test: ${root}`);
  for (const row of rows) {
    console.log(`${row.ok ? "ok  " : "FAIL"} ${row.spec.padEnd(30)} ${dirname(row.path)}  (want: ${row.want})`);
  }
  return rows.every((row) => row.ok);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    process.exitCode = checkResolution() ? 0 : 1;
  } else {
    linkPackages();
    linkDependencies();
    // Bun caches lookups it made before the links existed, so check in a fresh process.
    const check = Bun.spawnSync(["bun", import.meta.path, "--check"], { stdio: ["inherit", "inherit", "inherit"] });
    process.exitCode = check.exitCode ?? 1;
  }
}
