/**
 * In-process async mutex keyed by absolute file path. Bun runs as a single
 * process, so this is sufficient to serialize the read-check-write critical
 * section of every mutating docs/canvas/comments route — no cross-process
 * coordination needed.
 */

// Tail of the queue for each path: the promise representing "everything
// queued so far for this path has settled." A missing entry means the path
// is currently uncontended.
const tails = new Map<string, Promise<unknown>>();

export function withPathLock<T>(absPath: string, fn: () => Promise<T>): Promise<T> {
  const priorTail = tails.get(absPath) ?? Promise.resolve();

  // `run` waits for everything ahead of it in line, then executes `fn`.
  // Swallow the prior tail's rejection (if any) here so one failed
  // critical section never poisons the ones queued behind it.
  const run = priorTail.catch(() => undefined).then(() => fn());

  // `settled` is what we publish as the new tail: it resolves/rejects
  // alongside `run`, but callers of `withPathLock` still observe `run`
  // (with its real value/error) via the returned promise below.
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(absPath, settled);

  return run.finally(() => {
    // Only clear the map entry if it still points at OUR settled promise.
    // If a new call chained onto our tail after we started, the map entry
    // will have been overwritten with that fresh promise, and we must not
    // delete it out from under it.
    if (tails.get(absPath) === settled) {
      tails.delete(absPath);
    }
  });
}
