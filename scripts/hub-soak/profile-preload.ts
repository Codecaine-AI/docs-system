/**
 * Preloaded into the managed runtime by `bun scripts/hub-soak.ts --profile` (`bun --preload`).
 * Nothing here runs without HUB_SOAK_PROFILE_DIR, and the runtime's own code is untouched.
 *
 *  - Every 10 s: one line in <dir>/memory.jsonl with process.memoryUsage() and the process CPU time so
 *    far, so JS-heap growth can be told apart from native growth (SQLite, wasm, watchers), and CPU
 *    seconds are known even where the JS sampler saw nothing (native calls). Every 60 s the line also
 *    carries bun:jsc heapStats() (heapSize, heapCapacity, objectCount): it walks the heap, about 300 ms
 *    on 3.5 M objects, which was 5% of the heavy soak's CPU profile when it ran every 10 s.
 *  - When <dir>/snapshot.request appears (the soak writes it when the load phase ends; polled every
 *    500 ms, a signal handler from a preload did not survive in the runtime): heap stats before and
 *    after a full GC, then a Chrome-format heap snapshot in <dir>/heap.heapsnapshot and the stats in
 *    <dir>/heap-stats.json. The soak waits for heap-stats.json before its idle window.
 *
 * The exit heap snapshot comes from Bun's --heap-prof flag, and with --cpu-profile the CPU profile from
 * --cpu-prof, both written when the runtime exits through its SIGTERM handler.
 */
import { heapStats } from 'bun:jsc';
import { appendFileSync, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.HUB_SOAK_PROFILE_DIR;
if (dir) {
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  // heapStats() walks the heap, so only every 60 s line carries it (see the header).
  let lastHeapAt = -Infinity;
  const memoryLine = () => {
    const m = process.memoryUsage();
    const c = process.cpuUsage();
    const now = Date.now();
    let heap = {};
    if (now - lastHeapAt >= 60_000) {
      lastHeapAt = now;
      const h = heapStats();
      heap = { heapSize: h.heapSize, heapCapacity: h.heapCapacity, extraMemorySize: h.extraMemorySize, objectCount: h.objectCount, protectedObjectCount: h.protectedObjectCount };
    }
    return JSON.stringify({ t: Math.round((now - t0) / 1000), cpuMs: Math.round((c.user + c.system) / 1000), rss: m.rss, heapTotal: m.heapTotal, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, ...heap });
  };
  const memoryFile = join(dir, 'memory.jsonl');
  writeFileSync(memoryFile, memoryLine() + '\n');
  setInterval(() => { try { appendFileSync(memoryFile, memoryLine() + '\n'); } catch {} }, 10_000).unref();

  let busy = false;
  const requestFile = join(dir, 'snapshot.request');
  setInterval(() => {
    if (busy || !existsSync(requestFile)) return;
    busy = true;
    const statsFile = join(dir, 'heap-stats.json');
    // The soak polls for this file and parses it at once, so it appears whole or not at all.
    const writeStats = (body: unknown) => {
      const tmpStats = `${statsFile}.tmp`;
      writeFileSync(tmpStats, JSON.stringify(body, null, 2) + '\n');
      renameSync(tmpStats, statsFile);
    };
    try {
      unlinkSync(requestFile);
      const started = performance.now();
      const before = { memoryUsage: process.memoryUsage(), heapStats: heapStats() };
      Bun.gc(true);
      const afterGc = { memoryUsage: process.memoryUsage(), heapStats: heapStats() };
      const snapshot = Bun.generateHeapSnapshot('v8');
      const tmp = join(dir, 'heap.heapsnapshot.tmp');
      writeFileSync(tmp, snapshot);
      renameSync(tmp, join(dir, 'heap.heapsnapshot'));
      writeStats({ at: new Date().toISOString(), uptimeS: Math.round(process.uptime()), before, afterGc, snapshotBytes: snapshot.length, ms: Math.round(performance.now() - started) });
    } catch (error) {
      writeStats({ at: new Date().toISOString(), error: String(error) });
    } finally {
      busy = false;
    }
  }, 500).unref();
}
