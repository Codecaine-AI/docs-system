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
 * worktree this script also links, from the main checkout (found with
 * `git rev-parse --git-common-dir`):
 *   - each packages/<name>/node_modules the worktree lacks;
 *   - each entry of core's node_modules the worktree cannot reach, into
 *     <this tree>/node_modules (only when the worktree sits outside core).
 * It never replaces a node_modules entry that already exists. In the main
 * checkout these steps do nothing.
 *
 *   bun scripts/link-packages.ts           link, then print where packages resolve
 *   bun scripts/link-packages.ts --check   print only; exit 1 if a package resolves wrong
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
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
  mkdirSync(scopeDir, { recursive: true });
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

/** The main checkout's root, or undefined when this tree is the main checkout or not a git tree. */
function mainCheckout(): string | undefined {
  const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root });
  if (git.exitCode !== 0) return undefined;
  const main = dirname(git.stdout.toString().trim());
  return main === root ? undefined : main;
}

const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** Links src into dest when dest is missing. Merges a scope folder (@scope) one child at a time. */
function linkMissing(src: string, dest: string): void {
  if (!exists(dest)) {
    symlinkSync(src, dest, "dir");
    return;
  }
  const isRealDir = !lstatSync(dest).isSymbolicLink() && lstatSync(dest).isDirectory();
  if (isRealDir && dest.split(sep).at(-1)!.startsWith("@")) {
    for (const child of readdirSync(src)) linkMissing(join(src, child), join(dest, child));
  }
}

/** Idempotent: in a worktree, links the dependencies the main checkout has installed and this tree lacks. */
export function linkDependencies(): void {
  const main = mainCheckout();
  if (!main) return;
  for (const entry of readdirSync(join(main, "packages"), { withFileTypes: true })) {
    const src = join(main, "packages", entry.name, "node_modules");
    const pkg = join(root, "packages", entry.name);
    if (entry.isDirectory() && existsSync(src) && existsSync(pkg)) linkMissing(src, join(pkg, "node_modules"));
  }
  // The nearest node_modules above the main checkout (core's). Link it in only when this tree cannot climb to it.
  for (let dir = dirname(main); dir !== dirname(dir); dir = dirname(dir)) {
    const shared = join(dir, "node_modules");
    if (!existsSync(shared)) continue;
    if (inside(root, dir)) return;
    mkdirSync(join(root, "node_modules"), { recursive: true });
    for (const name of readdirSync(shared)) linkMissing(join(shared, name), join(root, "node_modules", name));
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
