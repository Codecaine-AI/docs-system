/**
 * Docs-edit session wiring for this harness.
 *
 * The session service owns the request queue and staged proposals. The
 * kernel owns agent spawning. A module-level FIFO bridges each launch's
 * host-side tools to createKernel's per-spawn sharedTools hook. This is a
 * single-operator development harness, so launches are serialized; a
 * multi-user host should replace the FIFO with keyed binding.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { updateContainerStatus } from "@agent-kernel/db";
import {
	type CreateKernelConfig,
	type KernelInstance,
} from "@agent-kernel/kernel";

import {
	createDocsEditSessionService,
	type DocsEditSessionService,
	type LaunchedDocsEditSession,
} from "./docs-edit-session";

export const DOCS_LAB_EDITOR_AGENT_NAME = "docs-lab-editor";

/**
 * The only active tools for session-mode docs-lab-editor spawns. The bundle's
 * docs_write tool is deliberately absent because whole-document rewrites
 * regenerate block ids and detach annotations.
 */
export const DOCS_EDIT_TOOL_NAMES = [
	"read_doc",
	"docs_tree",
	"docs_read",
	"propose_ops",
	"propose_move_blocks",
	"resolve_request",
	"reply_request",
] as const;

const pendingLaunches: LaunchedDocsEditSession[] = [];

/** Queue a launch for the next docs-lab-editor spawn. Exported for focused tests. */
export function enqueueDocsEditLaunch(launch: LaunchedDocsEditSession): void {
	pendingLaunches.push(launch);
}

/** Bind session tools only to docs-lab-editor spawns, consuming the FIFO once. */
export const docsEditSharedTools: NonNullable<
	CreateKernelConfig["sharedTools"]
> = (config) => {
	if (config.name !== DOCS_LAB_EDITOR_AGENT_NAME) return [];
	const launch = pendingLaunches.shift();
	if (!launch) return [];
	// resolveSpawnConfig gives this spawn a shallow config copy. Assigning new
	// arrays narrows only the queued session spawn: host session tools survive
	// kernel allowlist scoping and the private whole-document tool is blocked.
	config.tools = [...DOCS_EDIT_TOOL_NAMES];
	config.disallowedTools = [
		...new Set([...(config.disallowedTools ?? []), "docs_write"]),
	];
	return [launch.tools];
};

export interface DocsKernelDocsEditSessionOptions {
	corpora: readonly { name: string; docsRoot: string }[];
	sessionRoot: string;
	workingDir: string;
}

export function docsEditTraceLabel(corpus: string, path: string): string {
	return `Edit docs: ${corpus} · ${path}`;
}

export function createDocsKernelDocsEditSessions<TToolRuntime>(
	kernel: KernelInstance<TToolRuntime>,
	options: DocsKernelDocsEditSessionOptions,
): DocsEditSessionService {
	return createDocsEditSessionService({
		corpora: options.corpora,
		spawnAgent: async (launch) => {
			const sessionDir = join(options.sessionRoot, launch.session.id);
			mkdirSync(sessionDir, { recursive: true });
			const container = await kernel.container({
				kind: "session",
				key: ["docs-edit", launch.session.id],
				label: docsEditTraceLabel(launch.session.corpus, launch.session.path),
				phase: "docs-edit",
				phaseVocabulary: ["docs-edit"],
				workingDir: options.workingDir,
				metadata: {
					topic: docsEditTraceLabel(
						launch.session.corpus,
						launch.session.path,
					),
					corpus: launch.session.corpus,
					docPath: launch.session.path,
					docsEditSessionId: launch.session.id,
				},
			});
			const startedAt = new Date().toISOString();
			if (kernel.db) {
				await updateContainerStatus(kernel.db, container.id, "active", {
					startedAt,
				});
			}

			try {
				enqueueDocsEditLaunch(launch);
				await kernel.spawnAgent(
					DOCS_LAB_EDITOR_AGENT_NAME,
					launch.spawn.prompt,
					null,
					{
						containerId: container.id,
						workingDir: options.workingDir,
						sessionDir,
						phase: "docs-edit",
						trigger: "operator",
						sessionData: launch.spawn.sessionData,
						// Private sidecar tools are registered before this hook. Replace
						// the active roster so session spawns cannot call docs_write (or
						// docs_check) and all seven host-side session tools are enabled.
						onSessionCreated(session) {
							session.setActiveToolsByName([...DOCS_EDIT_TOOL_NAMES]);
						},
					},
				);
				if (kernel.db) {
					await updateContainerStatus(kernel.db, container.id, "done", {
						endedAt: new Date().toISOString(),
					});
				}
			} catch (error) {
				if (kernel.db) {
					await updateContainerStatus(kernel.db, container.id, "error", {
						endedAt: new Date().toISOString(),
					});
				}
				throw error;
			}
		},
	});
}
