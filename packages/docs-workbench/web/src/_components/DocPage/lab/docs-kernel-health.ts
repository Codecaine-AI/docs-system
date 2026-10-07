import type { DocsKernelClient } from "./docs-kernel-client";

const healthProbes = new WeakMap<DocsKernelClient, Promise<boolean>>();

/** One health request per client instance; concurrent callers share it. */
export function probeKernelHealth(client: DocsKernelClient): Promise<boolean> {
	const existing = healthProbes.get(client);
	if (existing) return existing;
	const probe = Promise.resolve(client.health()).catch(() => false);
	healthProbes.set(client, probe);
	return probe;
}

