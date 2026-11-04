// Times walkDocsDir on one docs root, read-only.
//
//   bun scripts/bench-tree-walk.ts <docsRoot> [runs]
//
// Registers the root's codecaine.docs.json exclude globs the way the hub does
// (setDocsRootExclude), walks the root `runs` times (default 3) and prints one
// JSON line per run: ms, folders (dir and bundle nodes), bundles, bytes (the
// JSON the tree route would send) and maxStallMs (the longest gap a 5 ms timer
// saw, less its period). The last line is the load average; a warning goes to
// stderr when the 1-minute average is over 8, because the numbers then say
// more about the machine than about the walk.
import { loadavg } from "node:os";
import { join, resolve } from "node:path";

import { setDocsRootExclude } from "../packages/docs-index/src/paths";
import { DOCS_PROJECT_CONFIG, readDocsProjectConfigSync } from "../packages/docs-index/src/project-policy";
import { collectBundlePaths, walkDocsDir, type DocsTreeNode } from "../packages/docs-server/src/docs-tree";

const [rootArg, runsArg] = process.argv.slice(2);
if (!rootArg) {
  console.error("usage: bun scripts/bench-tree-walk.ts <docsRoot> [runs]");
  process.exit(2);
}
const root = resolve(rootArg);
const runs = Math.max(1, Number.parseInt(runsArg ?? "3", 10) || 3);

const config = readDocsProjectConfigSync(join(root, DOCS_PROJECT_CONFIG));
setDocsRootExclude(root, config?.exclude);

const countFolders = (nodes: DocsTreeNode[]): number =>
  nodes.reduce((sum, node) => sum + (node.kind === "file" ? 0 : 1 + countFolders(node.children ?? [])), 0);

const PROBE_MS = 5;

async function timedWalk(): Promise<{ ms: number; folders: number; bundles: number; bytes: number; maxStallMs: number }> {
  let maxStall = 0;
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    maxStall = Math.max(maxStall, now - last - PROBE_MS);
    last = now;
  }, PROBE_MS);
  const started = performance.now();
  try {
    const tree = await walkDocsDir(root);
    const ms = performance.now() - started;
    return {
      ms: Math.round(ms),
      folders: countFolders(tree),
      bundles: collectBundlePaths(tree).length,
      bytes: JSON.stringify(tree).length,
      maxStallMs: Math.round(maxStall),
    };
  } finally {
    clearInterval(probe);
  }
}

for (let run = 0; run < runs; run += 1) {
  console.log(JSON.stringify(await timedWalk()));
}
const load = loadavg().map((value) => Math.round(value * 100) / 100);
console.log(JSON.stringify({ loadAverage: load, exclude: config?.exclude ?? [] }));
if (load[0]! > 8) {
  console.error(`warning: 1-minute load average ${load[0]} is over 8; the machine is busy and these numbers run high`);
}
