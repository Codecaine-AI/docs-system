import { copyFile, stat, truncate } from 'node:fs/promises';

/** Delay before the next refused attempt: 1 s, 2 s, 4 s … capped at 60 s. */
export const backoffMs = (attempt: number) => Math.min(1000 * 2 ** attempt, 60_000);

/** A runtime may be replaced only when it holds no authoring task and no draft lease. */
export const canActivate = (health: { tasks?: number; drafts?: number }) => !(health.tasks ?? 0) && !(health.drafts ?? 0);

/** Exponential backoff for refused attempts. `due()` is checked by the 1 s maintenance tick. */
export function createBackoff(now: () => number = Date.now) {
  let attempt = 0;
  let nextAt = 0;
  return {
    due: () => now() >= nextAt,
    refuse: () => { nextAt = now() + backoffMs(attempt); attempt++; },
    reset: () => { attempt = 0; nextAt = 0; },
  };
}

/** Logs a miss once per key, and once more when that key recovers. */
export function createLogOnce(log: (message: string) => void = message => console.error(message)) {
  const seen = new Set<string>();
  return {
    miss: (key: string, message: string) => { if (!seen.has(key)) { seen.add(key); log(message); } },
    hit: (key: string, message: string) => { if (seen.delete(key)) log(message); },
  };
}

/** Logs a state line only when it differs from the last one reported; `reset()` starts over (new candidate). */
export function createStateLog(log: (message: string) => void = message => console.error(message)) {
  let last: string | undefined;
  return {
    report: (message: string) => { if (message !== last) { last = message; log(message); } },
    reset: () => { last = undefined; },
  };
}

/**
 * Rotates a log that a writer holds open with O_APPEND (launchd's StandardOutPath):
 * copy it to `<path>.1`, then truncate in place. The writer's next append lands at offset 0.
 * Returns true when the file was rotated.
 */
export async function rotateLog(path: string, maxBytes = 5 * 1024 * 1024): Promise<boolean> {
  let size: number;
  try { size = (await stat(path)).size; } catch { return false; }
  if (size <= maxBytes) return false;
  await copyFile(path, `${path}.1`);
  await truncate(path, 0);
  return true;
}
