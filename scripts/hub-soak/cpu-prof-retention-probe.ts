#!/usr/bin/env bun
/**
 * Shows why hub-soak's --cpu-profile is separate from --profile: JavaScriptCore's sampling profiler
 * (Bun --cpu-prof) keeps every sampled function alive until the process exits, about one closure per sample.
 * A runtime that makes a fresh closure object per unit of hot work (docsFs() per directory in the tree
 * walker) then shows a heap that grows with the sampler, not with the code.
 *
 *   bun scripts/hub-soak/cpu-prof-retention-probe.ts                                   # live Functions after GC
 *   bun --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-interval=5000 scripts/hub-soak/cpu-prof-retention-probe.ts   # about 600 more
 *   bun --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-interval=1000 scripts/hub-soak/cpu-prof-retention-probe.ts   # about 3000 more
 *
 * Measured 2026-11-04 on Bun 1.4.2: 435 live Functions without the flag, 1024 at 5 ms, 2978 at 1 ms.
 * --heap-prof on its own changes nothing.
 */
import { heapStats } from 'bun:jsc';

function makeFs(root: string) {
  const guard = (p: string) => `${root}/${p}`;
  return { root, guard, existsSync(p: string) { let s = 0; for (let i = 0; i < 20000; i++) s += p.length + i; return guard(p).length + s > 0; } };
}
const t0 = performance.now();
let iterations = 0;
while (performance.now() - t0 < 3000) { const fs = makeFs(`/root/${iterations++}`); fs.existsSync('doc.json'); }
Bun.gc(true); await Bun.sleep(200); Bun.gc(true);
const counts = heapStats().objectTypeCounts;
console.log(JSON.stringify({ cpuProf: process.execArgv.some(a => a.startsWith('--cpu-prof')), iterations, liveFunctions: counts.Function ?? 0, heapKb: Math.round(process.memoryUsage().heapUsed / 1024) }));
process.exit(0);
