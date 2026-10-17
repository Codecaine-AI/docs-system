import { existsSync } from 'node:fs';
import { canActivate, createLogOnce } from './activation-policy';

/** Live supervisor state, read through getters so every guard sees the current value. */
export interface ActivationGuards<R> {
  candidate(): R | undefined;
  active(): R | undefined;
  activeRequests(): number;
  requestRevision(): number;
  registryRevision(): number;
  closing(): boolean;
}

export type ActivationOutcome =
  /** Entry guard refused: no candidate, requests in flight, closing, or an activation already running. */
  | { status: 'skipped' }
  /** The active runtime still holds authoring tasks or drafts. */
  | { status: 'waiting'; tasks: number; drafts: number }
  /** Requests, the registry or the candidate changed during rediscovery, or the service is closing. */
  | { status: 'aborted' }
  | { status: 'activated' };

export interface ActivatorOptions<R> {
  /** GET (no body) or POST (body) a runtime path and return its JSON. */
  fetchRuntime(runtime: R, path: string, body?: unknown): Promise<any>;
  /** The registered workspaces to rediscover on the candidate. */
  workspaces(): readonly string[];
  /** Replace the active runtime with `next`. Runs only after every guard passed. */
  swap(next: R): Promise<void>;
  log?: (message: string) => void;
  exists?: (path: string) => boolean;
}

/**
 * Activation coordinator. Checks the active runtime's task/draft gate first, so a closed gate costs
 * one /health fetch; rediscovers every workspace on the candidate right before the swap, so the
 * candidate sees current manifest exclusions; then re-checks the gate and the request, registry and
 * candidate guards before swapping.
 */
export function createActivator<R>(options: ActivatorOptions<R>) {
  const log = options.log ?? (message => console.error(message));
  const exists = options.exists ?? existsSync;
  const unavailable = createLogOnce(log);
  let activating = false;

  async function gate(active: R | undefined): Promise<ActivationOutcome | undefined> {
    if (!active) return undefined;
    const health = await options.fetchRuntime(active, '/health');
    return canActivate(health) ? undefined : { status: 'waiting', tasks: health.tasks ?? 0, drafts: health.drafts ?? 0 };
  }

  async function activate(guards: ActivationGuards<R>): Promise<ActivationOutcome> {
    if (!guards.candidate() || guards.activeRequests() || guards.closing() || activating) return { status: 'skipped' };
    activating = true;
    const next = guards.candidate()!;
    try {
      const closed = await gate(guards.active());
      if (closed) return closed;
      const revision = guards.registryRevision();
      const requests = guards.requestRevision();
      for (const workspace of options.workspaces()) {
        if (!exists(workspace)) { unavailable.miss(workspace, `[docs] Registered workspace unavailable: ${workspace}`); continue; }
        unavailable.hit(workspace, `[docs] Registered workspace available again: ${workspace}`);
        const result = await options.fetchRuntime(next, '/rpc', { workspace, name: 'docs_discover', arguments: {} });
        if (result?.isError) throw new Error('Replacement could not rediscover registered workspace');
      }
      const reopened = await gate(guards.active());
      if (reopened) return reopened;
      if (guards.activeRequests() || requests !== guards.requestRevision() || revision !== guards.registryRevision() || guards.candidate() !== next || guards.closing()) return { status: 'aborted' };
      await options.swap(next);
      return { status: 'activated' };
    } finally { activating = false; }
  }

  return { activate, get activating() { return activating; } };
}
