import { newRunId, openActionLog, type ActionLog } from '@codecaine-ai/action-log';

type RpcBody = { name: string; arguments?: Record<string, unknown>; identity?: { runId?: string; threadId?: string | null; agent?: string | null } };

/** "ok", "refused" or "<n> findings": a write's style_findings {shown, omitted} plus a read or check's lint.findings. Error detail stays out, because validation text can echo the page's content. */
export function summarize(result: any): string {
 const data = result?.structuredContent ?? {};
 if (result?.isError || data.ok === false) return 'refused';
 const style = data.style_findings;
 const styleCount = Array.isArray(style?.shown) ? style.shown.length + (Number(style.omitted) || 0) : 0;
 const lintCount = Array.isArray(data.lint?.findings) ? data.lint.findings.length : 0;
 const count = styleCount + lintCount;
 return count ? `${count} findings` : 'ok';
}

/**
 * Appends one action-log record per tool call. The daemon serves several stdio
 * bridges, so identity arrives with each call. A failed write never fails the call.
 */
export function createRpcRecorder() {
 const daemonRunId = newRunId();
 let log: ActionLog | undefined;
 /** Each task's pinned guidance snapshot, from its docs_begin result, so every later call of the task carries it. */
 const taskSnapshots = new Map<string, string>();
 return (body: RpcBody, result: any): void => {
  try {
   log ??= openActionLog();
   const identity = body.identity ?? {};
   const runId = identity.runId || daemonRunId;
   const args = body.arguments ?? {};
   const data = result?.structuredContent ?? {};
   const refused = result?.isError === true || data.ok === false;
   if (body.name === 'docs_begin' && !refused && typeof args.thread_id === 'string' && args.thread_id) log.bindThread(runId, args.thread_id);
   if (body.name === 'docs_begin' && !refused && typeof data.task_id === 'string' && typeof data.snapshot_id === 'string') taskSnapshots.set(data.task_id, data.snapshot_id);
   const snapshotId = typeof data.snapshot_id === 'string' ? data.snapshot_id : (typeof args.task_id === 'string' ? taskSnapshots.get(args.task_id) : undefined) ?? null;
   log.record({
    runId,
    threadId: identity.threadId || null,
    agent: identity.agent || 'docs-mcp',
    tool: body.name,
    target: typeof args.path === 'string' && args.path ? args.path : '-',
    result: summarize(result),
    snapshotId,
    at: new Date(),
   });
  } catch (error) {
   console.error(`action log write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
 };
}

/** The daemon's /rpc handler: runs the call, then logs it. */
export async function serveRpc(service: { call(workspace: string, name: string, args: Record<string, unknown>): Promise<any> }, record: ReturnType<typeof createRpcRecorder>, body: RpcBody & { workspace: string }) {
 const result = await service.call(body.workspace, body.name, body.arguments ?? {});
 record(body, result);
 return result;
}
