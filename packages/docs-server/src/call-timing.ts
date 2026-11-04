import { AsyncLocalStorage } from "node:async_hooks";

/** What one tool call spent waiting: on the store-wide lock, and inside Jev judgment spans. */
export type CallTiming = { readonly callId: string; storeLockWaitMs: number; jevSpanMs: number };

const current = new AsyncLocalStorage<CallTiming>();

/** Runs `fn` as the tool call `callId`: every wait or span added inside it, across awaits, lands on this call only. */
export function runWithCallTiming<T>(callId: string, fn: (timing: CallTiming) => T): T {
  return current.run({ callId, storeLockWaitMs: 0, jevSpanMs: 0 }, () => fn(current.getStore()!));
}

/** The tool call this code runs inside, if any (routes and direct tests run outside one). */
export function currentCallTiming(): CallTiming | undefined {
  return current.getStore();
}

/** Adds time from a store-lock request to its grant. A no-op outside a tool call. */
export function addStoreLockWait(ms: number): void {
  const timing = current.getStore();
  if (timing) timing.storeLockWaitMs += ms;
}

/** Adds one Jev judgment span. A no-op outside a tool call. */
export function addJevSpan(ms: number): void {
  const timing = current.getStore();
  if (timing) timing.jevSpanMs += ms;
}
