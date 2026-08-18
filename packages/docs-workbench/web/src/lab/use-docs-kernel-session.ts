import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { fetchLabConfig, type LabConfig } from "../data/api";
import { createDocsKernelClient, type DocsKernelClient } from "./docs-kernel-client";
import {
	createDocsKernelSessionSource,
	probeKernelHealth,
	type DocsKernelSessionHandle,
	type DocsKernelSessionSnapshot,
} from "./docs-kernel-session-source";

export interface UseDocsKernelSessionOptions {
	path: string;
	enabled: boolean;
	onSessionEnd: () => void | Promise<void>;
	onDocChanged?: (hash: string) => void | Promise<void>;
	onProposalStaged?: () => void | Promise<void>;
	/** Test seam; production uses the default localhost kernel client. */
	client?: DocsKernelClient;
}

export interface UseDocsKernelSessionResult {
	onApplyQueue?: (annotationIds: string[]) => Promise<void>;
	handle: DocsKernelSessionHandle;
	snapshot: DocsKernelSessionSnapshot;
	agentConnected: boolean;
}

let labConfigPromise: Promise<LabConfig> | null = null;
const loadLabConfig = () => (labConfigPromise ??= fetchLabConfig());

const pendingClient = createDocsKernelClient({
	fetchImpl: (async () => { throw new Error("lab config pending"); }) as unknown as typeof fetch,
});

export function useDocsKernelSession(
	options: UseDocsKernelSessionOptions,
): UseDocsKernelSessionResult {
	const [configured, setConfigured] = useState<
		{ client: DocsKernelClient; corpus: string } | null
	>(null);
	useEffect(() => {
		if (options.client) return;
		let active = true;
		void loadLabConfig().then((config) => {
			if (active) setConfigured({
				client: createDocsKernelClient({ baseUrl: config.kernelUrl }),
				corpus: config.corpus,
			});
		});
		return () => { active = false; };
	}, [options.client]);
	const client = options.client ?? configured?.client ?? pendingClient;
	const corpus = options.client ? undefined : configured?.corpus;
	const callbacksRef = useRef({
		onSessionEnd: options.onSessionEnd,
		onDocChanged: options.onDocChanged,
		onProposalStaged: options.onProposalStaged,
	});
	callbacksRef.current = {
		onSessionEnd: options.onSessionEnd,
		onDocChanged: options.onDocChanged,
		onProposalStaged: options.onProposalStaged,
	};

	const source = useMemo(
		() => createDocsKernelSessionSource({
			client,
			path: options.path,
			corpus,
			onSessionEnd: () => callbacksRef.current.onSessionEnd(),
			onDocChanged: (hash) => callbacksRef.current.onDocChanged?.(hash),
			onProposalStaged: () => callbacksRef.current.onProposalStaged?.(),
		}),
		[client, corpus, options.path],
	);
	const snapshot = useSyncExternalStore(
		source.subscribe,
		source.getSnapshot,
		source.getSnapshot,
	);

	const [healthy, setHealthy] = useState(false);
	useEffect(() => {
		let active = true;
		setHealthy(false);
		if (options.enabled && (options.client || configured)) {
			void probeKernelHealth(client).then((ok) => {
				if (active) setHealthy(ok);
			});
		}
		return () => {
			active = false;
			source.dispose();
		};
	}, [client, configured, options.client, options.enabled, options.path, source]);

	const applyQueue = useCallback(
		(annotationIds: string[]) => source.applyQueue(annotationIds),
		[source],
	);

	return {
		onApplyQueue: healthy && options.enabled ? applyQueue : undefined,
		handle: source,
		snapshot,
		agentConnected: healthy && options.enabled,
	};
}
