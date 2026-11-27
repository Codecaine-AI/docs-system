#!/usr/bin/env bun
/**
 * Makes every `@codecaine-ai/docs-*` import resolve to THIS docs-system tree,
 * and gives a git worktree the dependencies the main checkout has installed.
 *
 * Own packages. Core's `bun install` links each docs-system package from
 * core/node_modules to core/docs-system/packages/*. A docs-system worktree
 * under core climbs to those same links, so its tests would import the main
 * checkout's packages. This script links each package, and each `bin` it
 * declares, into <this tree>/node_modules, which resolution reaches first.
 *
 * Dependencies. A worktree has nothing installed, and no `bun install` can
 * run in it: the only lockfile is core's. So in a worktree this script
 * mirrors three node_modules folders of the main checkout (found with
 * `git rev-parse --git-common-dir`):
 *   - each packages/<name>/node_modules (docs-workbench has tailwindcss 4
 *     while core has 3);
 *   - the root node_modules;
 *   - core's node_modules, only when the worktree sits outside core and
 *     cannot climb to it.
 *
 * One rule decides what a mirror links: where the entry really lands
 * (`mayLink`). It links an installed package (the realpath has a
 * node_modules segment) and a core member's checkout (design-system, canvas,
 * ...). It never links a broken entry or one that lands in the main
 * checkout's source (its packages/ and external/). So no import and no bin
 * of this tree can reach the main checkout's code, whatever the entry's name.
 *
 * A mirror never shares a folder: node_modules, each @scope in it and .bin
 * are real folders in this tree, with one symlink per entry and no deeper
 * level. A symlink in a folder's place is replaced, so a build writes its
 * caches (.vite, .vite-temp) here. Dot entries are caches, never packages:
 * they stay behind. A rerun adds what is missing, removes a link that breaks
 * the rule and leaves every other entry alone. In the main checkout, a
 * submodule, a bare repo's worktree or without git, nothing is mirrored.
 *
 *   bun scripts/link-packages.ts           link, then print where packages resolve
 *   bun scripts/link-packages.ts --check   print only; exit 1 on a wrong resolution or link
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
const here = realpathSync(root);
const SCOPE = "@codecaine-ai/";

type DocsPackage = { name: string; dir: string; bins: { bin: string; file: string }[] };

function docsPackages(): DocsPackage[] {
  return packageNames(root).flatMap((folder) => {
    const dir = join(root, "packages", folder);
    try {
      const { name, bin }: { name?: unknown; bin?: unknown } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (typeof name !== "string" || !name.startsWith(SCOPE)) return [];
      // `bin` is one path, named after the package, or a map of name to path.
      const map: Record<string, unknown> = typeof bin === "string" ? { [name.slice(SCOPE.length)]: bin } : bin && typeof bin === "object" ? { ...bin } : {};
      const bins = Object.entries(map).flatMap(([bin, file]) => (typeof file === "string" ? [{ bin, file }] : []));
      return [{ name, dir, bins }];
    } catch {
      return [];
    }
  });
}

/** The real folders in tree/packages. */
function packageNames(tree: string): string[] {
  try {
    return readdirSync(join(tree, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Points link at target, relative. Leaves a correct link alone and replaces anything else. */
function setLink(link: string, target: string, type?: "dir"): void {
  const to = relative(dirname(link), target);
  try {
    if (lstatSync(link).isSymbolicLink() && readlinkSync(link) === to) return;
    rmSync(link, { recursive: true, force: true });
  } catch {
    // No link yet.
  }
  symlinkSync(to, link, type);
}

/** Idempotent: links this tree's packages and their bins into its root node_modules. */
export function linkPackages(): void {
  const modules = join(root, "node_modules");
  const link = (path: string, target: string, type?: "dir") => {
    for (const folder of [modules, dirname(path)]) if (!realFolder(folder)) throw new Error(`cannot link packages into ${folder}`);
    setLink(path, target, type);
  };
  for (const { name, dir, bins } of docsPackages()) {
    link(join(modules, name), dir, "dir");
    for (const { bin, file } of bins) link(join(modules, ".bin", bin), join(dir, file));
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
    return main !== here && isDir(join(main, "packages")) ? main : undefined;
  } catch {
    return undefined;
  }
}

const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** What sits at path itself, without following a link. */
function kind(path: string): "missing" | "link" | "folder" | "file" {
  try {
    const stat = lstatSync(path);
    return stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "folder" : "file";
  } catch {
    return "missing";
  }
}

/** Where path really lands, or undefined for a broken link or a missing path. */
function landing(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * The one rule for a link in this tree's node_modules: may it point at `path`? Yes when path lands in an
 * installed package, in this tree or in a core member's checkout. No when it is broken, when it loops back
 * to a folder above itself (core has @scope/@scope links), or when it lands in the main checkout's source.
 */
function mayLink(path: string, main: string): boolean {
  const target = landing(path);
  const parent = landing(dirname(path));
  if (!target || !parent || inside(parent, target)) return false;
  return target.split(sep).includes("node_modules") || inside(target, here) || !inside(target, main);
}

/**
 * Makes dir a real folder and returns true. A symlink there (an older link, a link into core or a broken
 * one) is replaced, never written through. A file there is left alone: warn and return false.
 */
function realFolder(dir: string): boolean {
  const found = kind(dir);
  if (found === "file") {
    console.warn(`link-packages: skipped ${dir}: a file sits where a folder belongs`);
    return false;
  }
  if (found === "link") rmSync(dir);
  mkdirSync(dir, { recursive: true });
  return true;
}

/** A node_modules name that holds entries, not one entry: a scope or .bin. */
const isGroup = (name: string) => name === ".bin" || name.startsWith("@");

/**
 * This tree's node_modules layout, read without following a link: the folders that must be real (each
 * node_modules, and each scope and .bin in it) and the entries in them.
 */
function layout(): { folders: string[]; entries: string[] } {
  const folders: string[] = [];
  const entries: string[] = [];
  const visit = (dir: string, depth: number) => {
    folders.push(dir);
    if (kind(dir) !== "folder") return;
    for (const name of readdirSync(dir)) {
      if (depth === 0 && isGroup(name)) visit(join(dir, name), 1);
      else entries.push(join(dir, name));
    }
  };
  for (const dir of [root, ...packageNames(root).map((name) => join(root, "packages", name))]) visit(join(dir, "node_modules"), 0);
  return { folders, entries };
}

/** The links in this tree's node_modules that break the rule: a link in a folder's place, or an entry `mayLink` refuses. */
function wrongLinks(main: string): string[] {
  const { folders, entries } = layout();
  const isLink = (path: string) => kind(path) === "link";
  return [...folders.filter(isLink), ...entries.filter((path) => isLink(path) && !mayLink(path, main))];
}

/** Mirrors the node_modules folder src into dest: one link per entry that `mayLink` allows and dest lacks. */
function mirror(src: string, dest: string, main: string): void {
  if (!isDir(src) || !realFolder(dest)) return;
  const link = (name: string) => {
    const from = join(src, name);
    const to = join(dest, name);
    // A dot entry is a cache or a tool's state, never a package.
    if (!basename(name).startsWith(".") && kind(to) === "missing" && mayLink(from, main)) symlinkSync(from, to);
  };
  for (const name of readdirSync(src)) {
    if (!isGroup(name)) link(name);
    else if (isDir(join(src, name)) && realFolder(join(dest, name))) for (const child of readdirSync(join(src, name))) link(join(name, child));
  }
}

/** Idempotent: in a worktree, mirrors the dependencies the main checkout has installed and this tree lacks. */
export function linkDependencies(): void {
  const main = mainCheckout();
  if (!main) return;
  for (const link of wrongLinks(main)) {
    console.log(`link-packages: removed ${relative(root, link)}: a link in a folder's place, a broken link or one into ${main}`);
    rmSync(link);
  }
  for (const name of packageNames(main)) {
    const pkg = join(root, "packages", name);
    if (kind(pkg) === "folder") mirror(join(main, "packages", name, "node_modules"), join(pkg, "node_modules"), main);
  }
  mirror(join(main, "node_modules"), join(root, "node_modules"), main);
  // The nearest node_modules above the main checkout (core's). Mirror it only when this tree cannot climb to it.
  for (let dir = dirname(main); dir !== dirname(dir); dir = dirname(dir)) {
    if (!isDir(join(dir, "node_modules"))) continue;
    if (!inside(here, dir)) mirror(join(dir, "node_modules"), join(root, "node_modules"), main);
    return;
  }
}

/** The file a bare import resolves to, or its package.json when it has no "." export. */
function resolveSpec(spec: string, from: string): string {
  for (const candidate of [spec, `${spec}/package.json`]) {
    try {
      return Bun.resolveSync(candidate, from);
    } catch {}
  }
  return "UNRESOLVED";
}

/** The folder a resolved file sits in, for printing. */
const folderOf = (path: string) => (path === "UNRESOLVED" ? path : dirname(path));

/** Prints where each package and bin resolves from a docs-system consumer; returns false on a wrong one. */
export function checkResolution(): boolean {
  const consumer = join(root, "packages", "docs-workbench");
  const external = join(root, "external");
  const rows: { spec: string; path: string; ok: boolean; want: string }[] = [];
  for (const { name, bins } of docsPackages()) {
    const path = resolveSpec(name, consumer);
    rows.push({ spec: name, path: folderOf(path), ok: inside(path, root) && !inside(path, external), want: "this tree" });
    for (const { bin } of bins) {
      const path = landing(join(root, "node_modules", ".bin", bin)) ?? "UNRESOLVED";
      rows.push({ spec: `.bin/${bin}`, path, ok: inside(path, here), want: "this tree" });
    }
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
    rows.push({ spec, path: folderOf(path), ok: path !== "UNRESOLVED" && !inside(path, root), want: "core member" });
  }
  // In a worktree, every link in its node_modules must keep the rule the mirror links by.
  const main = mainCheckout();
  if (main) {
    for (const link of wrongLinks(main)) {
      rows.push({ spec: relative(root, link), path: landing(link) ?? "BROKEN", ok: false, want: "a real folder, or a whole link that lands outside the main checkout's source" });
    }
  }
  console.log(`docs-system tree under test: ${root}`);
  for (const row of rows) {
    console.log(`${row.ok ? "ok  " : "FAIL"} ${row.spec.padEnd(30)} ${row.path}  (want: ${row.want})`);
  }
  if (main) console.log(`dependencies mirrored from: ${main}`);
  return rows.every((row) => row.ok);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    process.exitCode = checkResolution() ? 0 : 1;
  } else {
    linkPackages();
    linkDependencies();
    // Bun caches lookups it made before the links existed, so check in a fresh process.
    const check = Bun.spawnSync([process.execPath, import.meta.path, "--check"], { stdio: ["inherit", "inherit", "inherit"] });
    process.exitCode = check.exitCode ?? 1;
  }
}
