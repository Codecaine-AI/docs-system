import { heapStats } from 'bun:jsc';

/**
 * The managed runtime's memory, for /health and a periodic stderr line: whether a large RSS is JS heap
 * (heapUsed, and JavaScriptCore's own heapSize) or native memory (SQLite, wasm, watchers, allocator slack).
 * heapStats() walks every heap cell (about 170 ms on 5 M objects), so its heapSize is refreshed at most
 * every HEAP_STATS_EVERY_MS; process.memoryUsage() is read on every call.
 */
export type MemoryReport = {
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers: number };
  jscHeapSize: number;
};
export const HEAP_STATS_EVERY_MS = 30_000;
export const MEMORY_LOG_EVERY_MS = 10 * 60_000;
let jscHeap = { at: -Infinity, size: 0 };

export function memoryReport(now = Date.now()): MemoryReport {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  if (now - jscHeap.at >= HEAP_STATS_EVERY_MS) jscHeap = { at: now, size: heapStats().heapSize };
  return { memory: { rss, heapUsed, heapTotal, external, arrayBuffers }, jscHeapSize: jscHeap.size };
}

const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
/** One line with every number in MB, the shape of the stderr log. */
export function memoryLine(report = memoryReport()): string {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = report.memory;
  return `[docs-runtime] memory rss ${mb(rss)}, JS heap used ${mb(heapUsed)} of ${mb(heapTotal)}, JSC heap ${mb(report.jscHeapSize)}, external ${mb(external)}, arrayBuffers ${mb(arrayBuffers)}`;
}

/** Log memoryLine() every everyMs (10 minutes: the supervisor pipes the runtime's stderr to background.log). Returns the stop function. */
export function startMemoryLog(log: (line: string) => void = console.error, everyMs = MEMORY_LOG_EVERY_MS): () => void {
  const timer = setInterval(() => log(memoryLine()), everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
