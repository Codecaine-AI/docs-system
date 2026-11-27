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
 *   - each packages/<name>/node_modules and the root node_modules;
 *   - core's node_modules, into <this tree>/node_modules, only when the
 *     worktree sits outside core and cannot climb to it.
 * A mirror is flat: a real folder with one symlink per entry. A scope folder
 * (@scope) and .bin are real folders with one symlink per entry, one level
 * deep and no deeper. It skips dot caches (.vite, .cache), this repo's own
 * @codecaine-ai/docs-* packages and the .bin entries that run them. It never
 * replaces an existing entry, and it skips a target where a file sits. In the
 * main checkout, a submodule or without git these steps do nothing.
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
import { basename, dirname, join, relative, resolve, sep } from "node:path";

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
  if (!realFolder(dirname(scopeDir)) || !realFolder(scopeDir)) throw new Error(`cannot link packages into ${scopeDir}`);
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

/** The main checkout's root, or undefined in the main checkout, a submodule, a bare repo or without git. */
function mainCheckout(): string | undefined {
  try {
    const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { cwd: root });
    if (git.exitCode !== 0) return undefined;
    const [gitDir, commonDir] = git.stdout.toString().trim().split("\n").map((path) => realpathSync(path));
    if (!gitDir || !commonDir || gitDir === commonDir || basename(commonDir) !== ".git") return undefined;
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

const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Makes dir a real folder and returns true. A symlink there (an older link, a link into core or a broken
 * one) is replaced, never written through. A file there is left alone: warn and return false.
 */
function realFolder(dir: string): boolean {
  try {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink()) rmSync(dir);
    else if (!stat.isDirectory()) {
      console.warn(`link-packages: skipped ${dir}: a file sits where a folder belongs`);
      return false;
    }
  } catch {
    // Missing.
  }
  mkdirSync(dir, { recursive: true });
  return true;
}

const linkMissing = (from: string, to: string) => exists(to) || symlinkSync(from, to);

/** Mirrors the node_modules folder src into dest, flat (see the header). `main` is the main checkout. */
function mirror(src: string, dest: string, own: Set<string>, main: string): void {
  if (!isDir(src) || !realFolder(dest)) return;
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (name === ".bin") {
      if (!isDir(from) || !realFolder(to)) continue;
      for (const bin of readdirSync(from)) {
        // A bin that runs the main checkout's own code (docs-cli, codecaine-docs) would test the wrong tree.
        let target = "";
        try {
          target = realpathSync(join(from, bin));
        } catch {}
        if (!inside(target, main)) linkMissing(join(from, bin), join(to, bin));
      }
    } else if (name.startsWith("@")) {
      if (!isDir(from) || !realFolder(to)) continue;
      for (const child of readdirSync(from)) {
        if (child.startsWith("@") || (name === "@codecaine-ai" && own.has(child))) continue;
        linkMissing(join(from, child), join(to, child));
      }
    } else if (!name.startsWith(".")) {
      linkMissing(from, to);
    }
  }
}

/** Idempotent: in a worktree, mirrors the dependencies the main checkout has installed and this tree lacks. */
export function linkDependencies(): void {
  const main = mainCheckout();
  if (!main) return;
  const own = new Set(docsPackages().map(({ name }) => name.slice("@codecaine-ai/".length)));
  for (const entry of readdirSync(join(main, "packages"), { withFileTypes: true })) {
    const pkg = join(root, "packages", entry.name);
    if (entry.isDirectory() && isDir(pkg)) mirror(join(main, "packages", entry.name, "node_modules"), join(pkg, "node_modules"), own, main);
  }
  mirror(join(main, "node_modules"), join(root, "node_modules"), own, main);
  // The nearest node_modules above the main checkout (core's). Mirror it only when this tree cannot climb to it.
  for (let dir = dirname(main); dir !== dirname(dir); dir = dirname(dir)) {
    if (!isDir(join(dir, "node_modules"))) continue;
    if (!inside(realpathSync(root), dir)) mirror(join(dir, "node_modules"), join(root, "node_modules"), own, main);
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
