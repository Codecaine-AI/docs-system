import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createDocsKernelClient, type DocsKernelClient } from "./docs-kernel-client";
import {
	createDocsKernelSessionSource,
	probeKernelHealth,
	type DocsKernelSessionHandle,
} from "./docs-kernel-session-source";

export interface UseDocsKernelSessionOptions {
	path: string;
	enabled: boolean;
	onSessionEnd: () => void | Promise<void>;
	onDocChanged?: (hash: string) => void | Promise<void>;
	/** Test seam; production uses the default localhost kernel client. */
	client?: DocsKernelClient;
}

export interface UseDocsKernelSessionResult {
	onApplyQueue?: (annotationIds: string[]) => Promise<void>;
	handle: DocsKernelSessionHandle;
	agentConnected: boolean;
}

export function useDocsKernelSession(
	options: UseDocsKernelSessionOptions,
): UseDocsKernelSessionResult {
	const client = useMemo(
		() => options.client ?? createDocsKernelClient(),
		[options.client],
	);
	const callbacksRef = useRef({
		onSessionEnd: options.onSessionEnd,
		onDocChanged: options.onDocChanged,
	});
	callbacksRef.current = {
		onSessionEnd: options.onSessionEnd,
		onDocChanged: options.onDocChanged,
	};

	const source = useMemo(
		() => createDocsKernelSessionSource({
			client,
			path: options.path,
			onSessionEnd: () => callbacksRef.current.onSessionEnd(),
			onDocChanged: (hash) => callbacksRef.current.onDocChanged?.(hash),
		}),
		[client, options.path],
	);
	useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);

	const [healthy, setHealthy] = useState(false);
	useEffect(() => {
		let active = true;
		setHealthy(false);
		if (options.enabled) {
			void probeKernelHealth(client).then((ok) => {
				if (active) setHealthy(ok);
			});
		}
		return () => {
			active = false;
			source.dispose();
		};
	}, [client, options.enabled, options.path, source]);

	const applyQueue = useCallback(
		(annotationIds: string[]) => source.applyQueue(annotationIds),
		[source],
	);

	return {
		onApplyQueue: healthy && options.enabled ? applyQueue : undefined,
		handle: source,
		agentConnected: healthy && options.enabled,
	};
}
