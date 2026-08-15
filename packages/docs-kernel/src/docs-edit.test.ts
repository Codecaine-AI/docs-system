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

test("docs-edit FIFO binds one launch and narrows only its docs-writer spawn", () => {
	expect([...DOCS_EDIT_TOOL_NAMES]).toEqual([
		...REGISTERED_DOCS_EDIT_TOOL_NAMES,
	]);

	const tools = (() => {}) as LaunchedDocsEditSession["tools"];
	enqueueDocsEditLaunch({ tools } as LaunchedDocsEditSession);

	const unrelated = agentConfig("another-agent");
	expect(docsEditSharedTools(unrelated)).toEqual([]);
	expect(unrelated.tools).toContain("docs_write");

	const sessionSpawn = agentConfig("docs-writer");
	expect(docsEditSharedTools(sessionSpawn)).toEqual([tools]);
	expect(sessionSpawn.tools).toEqual([...DOCS_EDIT_TOOL_NAMES]);
	expect(sessionSpawn.disallowedTools).toEqual(["write", "edit", "docs_write"]);

	const ordinarySpawn = agentConfig("docs-writer");
	expect(docsEditSharedTools(ordinarySpawn)).toEqual([]);
	expect(ordinarySpawn.tools).toContain("docs_write");
});
