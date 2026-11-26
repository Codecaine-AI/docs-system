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
 *   bun scripts/link-packages.ts           link, then print where packages resolve
 *   bun scripts/link-packages.ts --check   print only; exit 1 if a package resolves wrong
 */
import { lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
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
    // Bun caches lookups it made before the links existed, so check in a fresh process.
    const check = Bun.spawnSync(["bun", import.meta.path, "--check"], { stdio: ["inherit", "inherit", "inherit"] });
    process.exitCode = check.exitCode ?? 1;
  }
}
