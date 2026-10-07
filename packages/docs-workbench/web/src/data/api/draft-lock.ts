import type { DraftLockKind, AcquireDraftLockResult } from "@codecaine-ai/docs-viewer/client";
import { ApiError, postJson, assertWritable, bundlePathOf } from "./http";

// ---------------------------------------------------------------------------
// Draft locks (serve only)
// ---------------------------------------------------------------------------

async function draftLockCall(
  endpoint: "acquire" | "heartbeat",
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  const response = await fetch(`api/draft-lock/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: bundlePathOf(path), kind, sessionId }),
  });
  // 423 (held-by-other) is a NORMAL result for this contract, not an error.
  const payload = (await response.json()) as AcquireDraftLockResult & { detail?: string };
  if (!response.ok && response.status !== 423) {
    throw new ApiError(payload.detail ?? `${response.status}`, response.status);
  }
  return payload;
}

export function acquireDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  assertWritable("Draft locking");
  return draftLockCall("acquire", path, kind, sessionId);
}

export function heartbeatDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<AcquireDraftLockResult> {
  assertWritable("Draft locking");
  return draftLockCall("heartbeat", path, kind, sessionId);
}

export async function releaseDraftLock(
  path: string,
  kind: DraftLockKind,
  sessionId: string,
): Promise<void> {
  assertWritable("Draft locking");
  await postJson(`api/draft-lock/release`, { path: bundlePathOf(path), kind, sessionId });
}

