#!/usr/bin/env bun
/**
 * Read-only probes of what the live hub does per call against a real docs root, run in this process:
 *
 *   bun scripts/hub-soak/live-probes.ts [--root /Users/Ford/workspace/knowledge-base] [--docs-tree <docs-tree.ts>]
 *
 *  1. discoverProjects(root): what every /rpc call pays (service.ts call() runs discover() first). Its
 *     `**\/doc.json` glob walks the whole root; Bun's glob runs on a thread pool, so CPU time exceeds wall time.
 *  2. walkDocsDir(root): one GET /api/tree on a build without the tree index. --docs-tree points at another
 *     checkout's docs-tree.ts (the main checkout is the live hub's code); default is this worktree's.
 *  3. fs.watch(root, { recursive: true }) for 20 s: RSS, file descriptors and CPU of one watcher.
 *  4. Six concurrent discoveries, then six concurrent walks: how CPU and RSS scale with concurrent clients,
 *     and whether RSS comes back after a full GC (JS heap vs native retention).
 *
 * Nothing is written. Measured on 2026-11-04 against the 354k-file knowledge base (results in findings.md).
 */
import { readdirSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { heapStats } from 'bun:jsc';
import { discoverProjects } from '../../packages/docs-mcp/src/discovery';

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '/Users/Ford/workspace/knowledge-base' }, 'docs-tree': { type: 'string', default: resolve(import.meta.dir, '../../packages/docs-server/src/docs-tree.ts') } } });
const root = resolve(args.root!);
const { walkDocsDir } = await import(resolve(args['docs-tree']!)) as { walkDocsDir: (root: string, rel?: string) => Promise<unknown[]> };

const mb = (n: number) => Math.round(n / 1048576);
const memory = () => { const u = process.memoryUsage(); return { rssMb: mb(u.rss), heapUsedMb: mb(u.heapUsed), jscHeapMb: mb(heapStats().heapSize), externalMb: mb(u.external) }; };
const fds = () => { try { return readdirSync('/dev/fd').length; } catch { return -1; } };
async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const cpu0 = process.cpuUsage(); const t0 = performance.now();
  const result = await run();
  const cpu = process.cpuUsage(cpu0);
  console.log(JSON.stringify({ probe: label, wallMs: Math.round(performance.now() - t0), cpuMs: Math.round((cpu.user + cpu.system) / 1000), ...memory() }));
  return result;
}
const countNodes = (nodes: any[]): number => nodes.reduce((n, x) => n + 1 + countNodes(x.children ?? []), 0);

console.log(JSON.stringify({ root, start: memory(), fds: fds() }));
const discovery = await timed('discoverProjects x1', () => discoverProjects(root));
console.log(JSON.stringify({ projects: discovery.projects.map(p => p.id), warnings: discovery.warnings.length }));
const tree = await timed('walkDocsDir x1', () => walkDocsDir(root));
console.log(JSON.stringify({ treeNodes: countNodes(tree as any[]) }));
await timed('walkDocsDir x1 again', () => walkDocsDir(root));

const before = { ...memory(), fds: fds() };
let events = 0;
const watcher = watch(root, { recursive: true }, () => { events++; });
await timed('fs.watch recursive, 20 s', () => Bun.sleep(20_000));
console.log(JSON.stringify({ watchBefore: before, watchAfter: { ...memory(), fds: fds(), events } }));
watcher.close();

await timed('discoverProjects x6 concurrent', () => Promise.all(Array.from({ length: 6 }, () => discoverProjects(root))));
Bun.gc(true); await Bun.sleep(1000); console.log(JSON.stringify({ afterGc: memory() }));
await timed('walkDocsDir x6 concurrent', () => Promise.all(Array.from({ length: 6 }, () => walkDocsDir(root))));
Bun.gc(true); await Bun.sleep(1000); console.log(JSON.stringify({ afterGc: memory() }));
