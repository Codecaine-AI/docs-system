#!/usr/bin/env bun
/**
 * Summarize a hub soak's profile folder without Chrome.
 *
 *   bun scripts/hub-soak/summarize-profiles.ts <soak.json | profile dir> [--top 10] [--live live-before.jsonl]
 *
 * For each file the folder holds:
 *   heap.heapsnapshot, runtime.heapprofile  Chrome-format heap snapshots (the first from the end of the
 *                                           load phase, the second written by Bun on exit): shallow size by
 *                                           class, the biggest objects by retained size (dominator tree,
 *                                           weak edges excluded) with one retainer edge and the dominator
 *                                           chain, and the biggest strings.
 *   runtime.cpuprofile                      top self-time and total-time functions.
 *   memory.jsonl                            RSS and JS heap over time, with the growth per hour.
 *   heap-stats.json                         heap stats before and after the full GC the snapshot ran.
 * --live prints the same growth summary for the live runtime sampler's jsonl (t, rssKb, cpu).
 * --retainers <class> (repeatable): for every object of that class name, who holds it: the incoming edges
 *   grouped by (holder class, edge name) and the dominator classes, so a "68,000 copies of X" line gets an owner.
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args, positionals } = parseArgs({ options: { top: { type: 'string', default: '10' }, live: { type: 'string' }, retainers: { type: 'string', multiple: true, default: [] } }, allowPositionals: true });
const top = Number(args.top);
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const kb = (bytes: number) => bytes >= 1048576 ? mb(bytes) : `${(bytes / 1024).toFixed(1)} KB`;
const pad = (s: string | number, n: number) => String(s).padStart(n);
const trunc = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

let dir = positionals[0] ? resolve(positionals[0]) : undefined;
let soak: any;
if (dir && dir.endsWith('.json') && existsSync(dir)) {
  soak = JSON.parse(await readFile(dir, 'utf8'));
  dir = soak.profile?.dir ?? dir.replace(/\.json$/, '.profile');
}
if (!dir && !args.live) throw new Error('Pass a soak JSON, a profile folder, or --live <jsonl>');

// -- Soak summary --------------------------------------------------------------------
if (soak) {
  const load = soak.samples.filter((s: any) => s.phase === 'load');
  const first = load[0], last = load.at(-1);
  console.log(`# Soak ${soak.label}: ${soak.minutes} min, pid ${soak.pid}${soak.pidChanged ? ' (CHANGED: run void)' : ' stable'}`);
  console.log(`peak RSS ${mb(soak.peakRssKb * 1024)}, load RSS ${mb(first.rssKb * 1024)} -> ${mb(last.rssKb * 1024)} over ${last.t - first.t} s, mean CPU ${soak.meanCpu}%, idle CPU ${soak.idleMeanCpu}%`);
  console.log(`requests ${JSON.stringify(soak.requests)}, copy ${soak.copy.bundles} bundles / ${soak.copy.folders} folders, build ${soak.runtime.build}, judgment ${soak.runtime.judgment ?? 'on'}`);
  if (soak.errorSamples?.length) console.log(`errors: ${soak.errorSamples.join(' | ')}`);
  console.log();
}

// -- Growth over time ----------------------------------------------------------------
function growth(title: string, rows: { t: number; rss: number; heap?: number; external?: number }[]) {
  if (rows.length < 2) return;
  const first = rows[0]!, last = rows.at(-1)!;
  const hours = (last.t - first.t) / 3600 || 1 / 3600;
  const peak = rows.reduce((a, b) => b.rss > a.rss ? b : a);
  console.log(`# ${title}: ${rows.length} samples over ${Math.round(last.t - first.t)} s`);
  console.log(`RSS ${mb(first.rss)} -> ${mb(last.rss)} (peak ${mb(peak.rss)} at ${peak.t} s), ${mb((last.rss - first.rss) / hours)}/hour`);
  if (first.heap !== undefined && last.heap !== undefined) console.log(`JS heap ${mb(first.heap)} -> ${mb(last.heap)}, ${mb((last.heap - first.heap) / hours)}/hour; external ${mb(first.external ?? 0)} -> ${mb(last.external ?? 0)}`);
  // Quartile medians: a step (one-off growth) looks different from a slope.
  const q = [0, 0.25, 0.5, 0.75, 1].map(f => rows[Math.min(rows.length - 1, Math.floor(f * (rows.length - 1)))]!);
  console.log(`RSS at 0/25/50/75/100%: ${q.map(r => mb(r.rss)).join(', ')}`);
  console.log();
}
if (args.live && existsSync(args.live)) {
  const all = (await readFile(args.live, 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).map((r: any) => ({ t: r.t, pid: r.pid, rss: r.rssKb * 1024, cpu: r.cpu }));
  // The sampler takes the first pgrep match, so rows of another runtime (a soak's) can slip in: keep the dominant pid.
  const byPid = new Map<number, number>(); for (const r of all) byPid.set(r.pid, (byPid.get(r.pid) ?? 0) + 1);
  const pid = [...byPid].sort((a, b) => b[1] - a[1])[0]![0];
  const rows = all.filter(r => r.pid === pid);
  if (rows.length !== all.length) console.log(`(live sampler: ${all.length - rows.length} rows of other pids ${[...byPid.keys()].filter(p => p !== pid).join(', ')} dropped, keeping pid ${pid})`);
  growth(`Live runtime ${basename(args.live)} pid ${pid}`, rows);
  const cpu = rows.map(r => r.cpu).filter((c: number) => Number.isFinite(c));
  if (cpu.length) console.log(`live CPU mean ${(cpu.reduce((a: number, b: number) => a + b, 0) / cpu.length).toFixed(1)}%, max ${Math.max(...cpu)}%, samples at or above 100%: ${cpu.filter((c: number) => c >= 100).length}\n`);
}
if (dir && existsSync(join(dir, 'memory.jsonl'))) {
  const raw = (await readFile(join(dir, 'memory.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const rows = raw.map((r: any) => ({ t: r.t, rss: r.rss, heap: r.heapUsed ?? r.heapSize, external: r.external }));
  growth('Runtime memory.jsonl (process.memoryUsage every 10 s)', rows);
  const last = raw.at(-1);
  if (last?.cpuMs !== undefined) console.log(`runtime CPU time ${(last.cpuMs / 1000).toFixed(1)} s over ${last.t} s (${(last.cpuMs / 10 / Math.max(1, last.t)).toFixed(1)}% of one core)\n`);
}
if (dir && existsSync(join(dir, 'heap-stats.json'))) {
  const stats = JSON.parse(await readFile(join(dir, 'heap-stats.json'), 'utf8'));
  if (stats.error) console.log(`# heap-stats.json: ${stats.error}\n`);
  else {
    const b = stats.before, a = stats.afterGc;
    console.log(`# Heap stats at the end of the load phase (uptime ${stats.uptimeS} s), snapshot ${mb(stats.snapshotBytes)} in ${stats.ms} ms`);
    console.log(`before GC: rss ${mb(b.memoryUsage.rss)}, heapUsed ${mb(b.memoryUsage.heapUsed)}, external ${mb(b.memoryUsage.external)}, JSC heapSize ${mb(b.heapStats.heapSize)}, extraMemory ${mb(b.heapStats.extraMemorySize)}, objects ${b.heapStats.objectCount}`);
    console.log(`after GC:  rss ${mb(a.memoryUsage.rss)}, heapUsed ${mb(a.memoryUsage.heapUsed)}, external ${mb(a.memoryUsage.external)}, JSC heapSize ${mb(a.heapStats.heapSize)}, extraMemory ${mb(a.heapStats.extraMemorySize)}, objects ${a.heapStats.objectCount}`);
    const counts = Object.entries(a.heapStats.objectTypeCounts as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, top);
    console.log(`live object counts after GC: ${counts.map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
  }
}

// -- Heap snapshot: dominators and retained sizes ------------------------------------------
async function heapSnapshot(file: string) {
  const size = statSync(file).size;
  console.log(`# ${basename(file)} (${mb(size)})`);
  const snap = JSON.parse(await readFile(file, 'utf8'));
  const meta = snap.snapshot.meta;
  const nodeFields: string[] = meta.node_fields, edgeFields: string[] = meta.edge_fields;
  const NF = nodeFields.length, EF = edgeFields.length;
  const nTypeIndex = nodeFields.indexOf('type'), nNameIndex = nodeFields.indexOf('name'), nIdIndex = nodeFields.indexOf('id'), nSizeIndex = nodeFields.indexOf('self_size'), nEdgeCountIndex = nodeFields.indexOf('edge_count');
  const eTypeIndex = edgeFields.indexOf('type'), eNameIndex = edgeFields.indexOf('name_or_index'), eToIndex = edgeFields.indexOf('to_node');
  const nodeTypes: string[] = meta.node_types[nTypeIndex], edgeTypes: string[] = meta.edge_types[eTypeIndex];
  const nodes: number[] = snap.nodes, edges: number[] = snap.edges, strings: string[] = snap.strings;
  const N = nodes.length / NF, E = edges.length / EF;
  const weak = edgeTypes.indexOf('weak');
  const nodeName = (n: number) => strings[nodes[n * NF + nNameIndex]!] ?? '';
  const nodeType = (n: number) => nodeTypes[nodes[n * NF + nTypeIndex]!] ?? '';
  const selfSize = (n: number) => nodes[n * NF + nSizeIndex]!;
  const edgeName = (e: number) => { const t = edgeTypes[edges[e * EF + eTypeIndex]!]; const v = edges[e * EF + eNameIndex]!; return t === 'element' || t === 'hidden' ? `[${v}]` : `${t === 'property' ? '.' : `(${t}) `}${strings[v] ?? v}`; };
  console.log(`${N} nodes, ${E} edges, ${strings.length} strings, total self size ${mb(Array.from({ length: N }, (_, n) => selfSize(n)).reduce((a, b) => a + b, 0))}`);

  // First edge of each node, and reverse edges (CSR) without weak edges.
  const firstEdge = new Int32Array(N + 1);
  for (let n = 0, e = 0; n < N; n++) { firstEdge[n] = e; e += nodes[n * NF + nEdgeCountIndex]!; firstEdge[N] = e; }
  const inCount = new Int32Array(N + 1);
  for (let e = 0; e < E; e++) { if (edges[e * EF + eTypeIndex] === weak) continue; inCount[edges[e * EF + eToIndex]! / NF + 1]++; }
  for (let n = 0; n < N; n++) inCount[n + 1]! += inCount[n]!;
  const inEdge = new Int32Array(E), fill = inCount.slice(0, N);
  for (let e = 0; e < E; e++) { if (edges[e * EF + eTypeIndex] === weak) continue; const to = edges[e * EF + eToIndex]! / NF; inEdge[fill[to]!++] = e; }
  const edgeFrom = new Int32Array(E);
  for (let n = 0; n < N; n++) for (let e = firstEdge[n]!; e < firstEdge[n + 1]!; e++) edgeFrom[e] = n;

  // Reverse postorder from the root (node 0), iterative DFS over non-weak edges.
  const order = new Int32Array(N); let count = 0;
  const state = new Uint8Array(N), stack: number[] = [0], cursor = new Int32Array(N);
  state[0] = 1; cursor[0] = firstEdge[0]!;
  while (stack.length) {
    const n = stack[stack.length - 1]!;
    if (cursor[n]! < firstEdge[n + 1]!) {
      const e = cursor[n]!++;
      if (edges[e * EF + eTypeIndex] === weak) continue;
      const to = edges[e * EF + eToIndex]! / NF;
      if (!state[to]) { state[to] = 1; cursor[to] = firstEdge[to]!; stack.push(to); }
    } else { stack.pop(); order[count++] = n; }
  }
  const rpoIndex = new Int32Array(N).fill(-1);
  for (let i = 0; i < count; i++) rpoIndex[order[i]!] = count - 1 - i;
  // Cooper-Harvey-Kennedy dominators.
  const idom = new Int32Array(N).fill(-1); idom[0] = 0;
  const intersect = (a: number, b: number) => { while (a !== b) { while (rpoIndex[a]! > rpoIndex[b]!) a = idom[a]!; while (rpoIndex[b]! > rpoIndex[a]!) b = idom[b]!; } return a; };
  for (let changed = true, rounds = 0; changed && rounds < 50; rounds++) {
    changed = false;
    for (let i = count - 2; i >= 0; i--) {
      const n = order[i]!; let candidate = -1;
      for (let k = inCount[n]!; k < inCount[n + 1]!; k++) { const p = edgeFrom[inEdge[k]!]!; if (rpoIndex[p]! < 0 || idom[p]! < 0) continue; candidate = candidate < 0 ? p : intersect(p, candidate); }
      if (candidate >= 0 && idom[n] !== candidate) { idom[n] = candidate; changed = true; }
    }
  }
  const retained = new Float64Array(N);
  for (let n = 0; n < N; n++) retained[n] = selfSize(n);
  for (let i = 0; i < count - 1; i++) { const n = order[i]!; if (idom[n]! >= 0 && idom[n] !== n) retained[idom[n]!]! += retained[n]!; }
  const reachable = count, unreachable = N - count;
  console.log(`reachable from root: ${reachable}, unreachable: ${unreachable}`);

  // Shallow size by class.
  const byClass = new Map<string, { count: number; self: number }>();
  for (let n = 0; n < N; n++) { const key = `${nodeType(n)} ${nodeType(n) === 'string' || nodeType(n) === 'concatenated string' || nodeType(n) === 'sliced string' ? '(string)' : nodeName(n)}`; const row = byClass.get(key) ?? { count: 0, self: 0 }; row.count++; row.self += selfSize(n); byClass.set(key, row); }
  console.log(`\n## Shallow size by class (top ${top})`);
  for (const [key, row] of [...byClass].sort((a, b) => b[1].self - a[1].self).slice(0, top)) console.log(`${pad(kb(row.self), 11)}  ${pad(row.count, 8)}  ${trunc(key, 70)}`);

  // Biggest objects by retained size, skipping the synthetic root and GC-root buckets.
  const chain = (n: number) => { const parts: string[] = []; for (let d = idom[n]!, i = 0; d >= 0 && d !== 0 && i < 6 && d !== idom[d]; d = idom[d]!, i++) parts.push(`${trunc(nodeName(d) || nodeType(d), 28)}#${nodes[d * NF + nIdIndex]}`); return parts.join(' < '); };
  const retainer = (n: number) => { for (let k = inCount[n]!; k < inCount[n + 1]!; k++) { const e = inEdge[k]!, from = edgeFrom[e]!; if (from === 0) continue; return `${trunc(nodeName(from) || nodeType(from), 28)}${edgeName(e)}`; } return '(root)'; };
  const candidates: number[] = [];
  for (let n = 1; n < N; n++) if (rpoIndex[n]! >= 0 && nodeType(n) !== 'synthetic') candidates.push(n);
  candidates.sort((a, b) => retained[b]! - retained[a]!);
  console.log(`\n## Biggest objects by retained size (top ${top}; retained < self+children means shared children)`);
  console.log(`${pad('retained', 11)}  ${pad('self', 9)}  ${pad('type', 12)}  name  |  retained by  |  dominator chain`);
  for (const n of candidates.slice(0, top)) console.log(`${pad(kb(retained[n]!), 11)}  ${pad(kb(selfSize(n)), 9)}  ${pad(nodeType(n), 12)}  ${trunc(nodeName(n), 40)}#${nodes[n * NF + nIdIndex]}  |  ${retainer(n)}  |  ${chain(n)}`);
  // Retained by class, counting only dominator-tree tops of that class (an object whose dominator has another class), so sizes do not nest.
  const topsByClass = new Map<string, { count: number; retained: number }>();
  for (const n of candidates) { const key = nodeName(n) || nodeType(n); const d = idom[n]!; if (d >= 0 && (nodeName(d) || nodeType(d)) === key) continue; const row = topsByClass.get(key) ?? { count: 0, retained: 0 }; row.count++; row.retained += retained[n]!; topsByClass.set(key, row); }
  console.log(`\n## Retained size by class, top-of-chain objects only (top ${top})`);
  for (const [key, row] of [...topsByClass].sort((a, b) => b[1].retained - a[1].retained).slice(0, top)) console.log(`${pad(kb(row.retained), 11)}  ${pad(row.count, 8)}  ${trunc(key, 70)}`);
  // Who holds every object of a class: incoming edges grouped by (holder class, edge), and dominator classes.
  for (const className of args.retainers ?? []) {
    const members = candidates.filter(n => nodeName(n) === className);
    const byEdge = new Map<string, number>(), byDominator = new Map<string, number>();
    let rooted = 0;
    for (const n of members) {
      for (let k = inCount[n]!; k < inCount[n + 1]!; k++) { const e = inEdge[k]!, from = edgeFrom[e]!; if (from === 0) { rooted++; continue; } const key = `${nodeName(from) || nodeType(from)}${edgeName(e)}`; byEdge.set(key, (byEdge.get(key) ?? 0) + 1); }
      const d = idom[n]!; const key = d >= 0 ? (nodeName(d) || nodeType(d)) : '(none)'; byDominator.set(key, (byDominator.get(key) ?? 0) + 1);
    }
    console.log(`\n## Who holds the ${members.length} ${className} objects (${kb(members.reduce((a, n) => a + retained[n]!, 0))} retained in all; ${rooted} edges straight from GC roots)`);
    for (const [key, count] of [...byEdge].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${pad(count, 9)}  held by ${trunc(key, 90)}`);
    console.log(`dominated by: ${[...byDominator].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  // Biggest strings, with content.
  const stringNodes = candidates.filter(n => nodeType(n).includes('string')).sort((a, b) => selfSize(b) - selfSize(a)).slice(0, top);
  console.log(`\n## Biggest strings (top ${top})`);
  for (const n of stringNodes) console.log(`${pad(kb(selfSize(n)), 11)}  ${retainer(n)}  "${trunc(nodeName(n).replace(/\s+/g, ' '), 90)}"`);
  console.log();
}
for (const name of ['heap.heapsnapshot', 'runtime.heapprofile']) if (dir && existsSync(join(dir, name))) await heapSnapshot(join(dir, name));

// -- CPU profile ----------------------------------------------------------------------------
if (dir && existsSync(join(dir, 'runtime.cpuprofile'))) {
  const file = join(dir, 'runtime.cpuprofile');
  console.log(`# runtime.cpuprofile (${mb(statSync(file).size)})`);
  const profile = JSON.parse(await readFile(file, 'utf8')) as { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; hitCount?: number; children?: number[] }[]; samples?: number[]; timeDeltas?: number[]; startTime: number; endTime: number };
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n: typeof profile.nodes[number]) => `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url ? `${basename(n.callFrame.url)}:${n.callFrame.lineNumber + 1}` : ''}`.trim();
  const selfMs = new Map<string, number>(), totalMs = new Map<string, number>();
  let totalSampledMs = 0;
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  // Bun samples only while JavaScript runs, so a sample's time delta spans the idle gap before it. Each sample
  // counts as one sampling interval instead (the 10th-percentile delta: the interval while JS ran continuously).
  const sortedDeltas = deltas.filter(d => d > 0).sort((a, b) => a - b);
  const intervalMs = (sortedDeltas[Math.floor(sortedDeltas.length * 0.1)] ?? 5000) / 1000;
  if (samples.length) {
    for (let i = 0; i < samples.length; i++) {
      const ms = intervalMs; totalSampledMs += ms;
      const leaf = byId.get(samples[i]!); if (!leaf) continue;
      const k = key(leaf); selfMs.set(k, (selfMs.get(k) ?? 0) + ms);
      const seen = new Set<string>();
      for (let id: number | undefined = leaf.id; id !== undefined; id = parent.get(id)) { const kk = key(byId.get(id)!); if (seen.has(kk)) continue; seen.add(kk); totalMs.set(kk, (totalMs.get(kk) ?? 0) + ms); }
    }
  } else {
    for (const n of profile.nodes) { const k = key(n); selfMs.set(k, (selfMs.get(k) ?? 0) + (n.hitCount ?? 0)); totalSampledMs += n.hitCount ?? 0; }
  }
  const wallMs = (profile.endTime - profile.startTime) / 1000;
  const idle = [...selfMs].filter(([k]) => /^\((idle|program|garbage collector|root)\)/.test(k)).reduce((a, [, v]) => a + v, 0);
  console.log(`wall ${Math.round(wallMs / 1000)} s, ${samples.length} samples at ~${intervalMs.toFixed(1)} ms while JS ran: about ${Math.round((totalSampledMs - idle) / 1000)} s busy (${((totalSampledMs - idle) / wallMs * 100).toFixed(1)}% of wall); times below are samples x interval`);
  console.log(`(the sampler pinned about ${samples.length} functions until exit, so this run's heap snapshots and RSS are inflated by it: read retainers from a run without --cpu-profile)`);
  const busy = totalSampledMs - idle || 1;
  console.log(`\n## Top self time (top ${top})`);
  for (const [k, v] of [...selfMs].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${pad(`${(v / 1000).toFixed(2)} s`, 10)}  ${pad(`${(v / busy * 100).toFixed(1)}%`, 7)}  ${trunc(k, 100)}`);
  console.log(`\n## Top total time (top ${top}, inclusive, each function counted once per sample)`);
  for (const [k, v] of [...totalMs].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${pad(`${(v / 1000).toFixed(2)} s`, 10)}  ${pad(`${(v / busy * 100).toFixed(1)}%`, 7)}  ${trunc(k, 100)}`);
  console.log();
}
