import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Enforces the framework/host boundary: the docs-framework packages are
 * host-agnostic and must never import Spectre (or any host app) code, and
 * docs-model must stay React-free. This is the guarantee host apps rely on
 * when they consume these packages — keep it enforced, not incidental.
 */

const ROOTS = [
  "packages/docs-model/src",
  "packages/docs-index/src",
  "packages/docs-cli/src",
  "packages/docs-server/src",
  "packages/docs-viewer/src",
  "packages/docs-workbench/src",
  "packages/docs-workbench/web/src",
];

const SKIP_DIRS = new Set(["node_modules", "dist", "__fixtures__"]);

// Import specifiers that would couple the framework back to a host app.
const FORBIDDEN = [
  /^@spectre\//, // Spectre workspace packages
  /^@\//, // host tsconfig path alias
  /(^|\/)apps\/(frontend|backend|data-backend|tailer)\//, // relative reach into Spectre apps
  /\.\.\/\.\.\/\.\.\/apps\//, // any deep relative escape into a host apps dir
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|mts|cts|js)$/.test(entry)) files.push(full);
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

describe("import boundaries", () => {
  const repoRoot = import.meta.dir;

  test("framework code never imports host-app code", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(repoRoot, root))) {
        for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
          if (FORBIDDEN.some((re) => re.test(spec))) {
            violations.push(`${file.slice(repoRoot.length + 1)} -> ${spec}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("docs-model stays pure (no React, no DOM libs)", () => {
    const violations: string[] = [];
    for (const file of walk(join(repoRoot, "packages/docs-model/src"))) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        if (/^react(-dom)?($|\/)/.test(spec) || /^@tiptap\//.test(spec)) {
          violations.push(`${file.slice(repoRoot.length + 1)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("docs-model imports canvas only through the agent-schema leaf", () => {
    const violations: string[] = [];
    const canvasRoot = join(repoRoot, "external/canvas");
    const agentSchema = join(canvasRoot, "packages/canvas/src/agent-schema");
    for (const file of walk(join(repoRoot, "packages/docs-model/src"))) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        const resolved = resolve(dirname(file), spec);
        const canvasRelative = relative(canvasRoot, resolved);
        const isCanvasPath = canvasRelative !== "" && canvasRelative !== ".." && !canvasRelative.startsWith("../");
        const isAgentSchema = resolved === agentSchema || resolved === `${agentSchema}.ts`;
        if (
          (spec.startsWith("@codecaine-ai/canvas") && spec !== "@codecaine-ai/canvas/agent-schema") ||
          (isCanvasPath && !isAgentSchema)
        ) {
          violations.push(`${file.slice(repoRoot.length + 1)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
