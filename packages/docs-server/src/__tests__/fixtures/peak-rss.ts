// Peak resident memory of THIS process, in bytes, for the *-rss.ts child processes.
import { readFileSync } from 'node:fs';

/**
 * On Linux, ru_maxrss (process.resourceUsage().maxRSS) survives fork and exec:
 * a child spawned from a large `bun test` process starts at the parent's
 * high-water mark, so it measures the parent. VmHWM belongs to the memory map
 * exec created, so it counts only this process. Elsewhere ru_maxrss is used
 * (in kilobytes on every platform).
 */
export function peakRSS(): number {
 try {
  const hwm = /^VmHWM:\s+(\d+) kB$/m.exec(readFileSync('/proc/self/status', 'utf8'));
  if (hwm) return Number(hwm[1]) * 1024;
 } catch {
  // No /proc (macOS): fall back below.
 }
 return process.resourceUsage().maxRSS * 1024;
}
