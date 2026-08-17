import { expect, test } from "bun:test";

import type { CreateKernelConfig } from "@agent-kernel/kernel";

import {
	DOCS_EDIT_TOOL_NAMES as REGISTERED_DOCS_EDIT_TOOL_NAMES,
	type LaunchedDocsEditSession,
} from "./docs-edit-session";
import {
	DOCS_EDIT_TOOL_NAMES,
	docsEditSharedTools,
	enqueueDocsEditLaunch,
} from "./docs-edit";

type SharedToolsConfig = Parameters<
	NonNullable<CreateKernelConfig["sharedTools"]>
>[0];

function agentConfig(name: string): SharedToolsConfig {
	return {
		name,
		description: "test agent",
		model: "test/model",
		tools: ["docs_tree", "docs_read", "docs_write", "docs_check"],
		disallowedTools: ["write", "edit"],
		extensions: false,
		variables: {},
	};
}

test("docs-edit FIFO binds one launch and narrows only its docs-lab-editor spawn", () => {
	expect([...DOCS_EDIT_TOOL_NAMES]).toEqual([
		...REGISTERED_DOCS_EDIT_TOOL_NAMES,
	]);

	const tools = (() => {}) as LaunchedDocsEditSession["tools"];
	const launch = {
		tools,
		spawn: { agentName: "docs-lab-editor" },
	} as LaunchedDocsEditSession;
	expect(launch.spawn.agentName).toBe("docs-lab-editor");
	enqueueDocsEditLaunch(launch);

	const unrelated = agentConfig("another-agent");
	expect(docsEditSharedTools(unrelated)).toEqual([]);
	expect(unrelated.tools).toContain("docs_write");

	const sessionSpawn = agentConfig("docs-lab-editor");
	expect(docsEditSharedTools(sessionSpawn)).toEqual([tools]);
	expect(sessionSpawn.tools).toEqual([...DOCS_EDIT_TOOL_NAMES]);
	expect(sessionSpawn.disallowedTools).toEqual(["write", "edit", "docs_write"]);

	const ordinarySpawn = agentConfig("docs-lab-editor");
	expect(docsEditSharedTools(ordinarySpawn)).toEqual([]);
	expect(ordinarySpawn.tools).toContain("docs_write");
});
