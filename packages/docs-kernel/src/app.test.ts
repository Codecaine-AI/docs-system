import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocsKernelHarness } from "./app";

const tempRoot = mkdtempSync(join(tmpdir(), "docs-kernel-cors-"));
const harness = await createDocsKernelHarness({
	dbPath: join(tempRoot, "kernel.sqlite"),
	piAgentDir: join(tempRoot, "pi-agent"),
});

afterAll(async () => {
	await harness.dispose();
	rmSync(tempRoot, { recursive: true, force: true });
});

describe("docs kernel CORS", () => {
	test("health reports ordered corpora", async () => {
		const response = await harness.app.handle(
			new Request("http://localhost/health"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ok",
			kernel: harness.boot.kernel.id,
			corpora: harness.boot.corpora.map(({ name, docsRoot }) => ({
				name,
				docsRoot,
			})),
		});
	});

	test.each([
		["health", new Request("http://localhost/health"), 200],
		[
			"kernel route",
			new Request("http://localhost/kernel/docs-edit-sessions"),
			200,
		],
		[
			"OPTIONS preflight",
			new Request("http://localhost/kernel/docs-edit-sessions", {
				method: "OPTIONS",
			}),
			204,
		],
	] as const)("adds CORS headers to %s", async (_name, request, status) => {
		const response = await harness.app.handle(request);

		expect(response.status).toBe(status);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});
});

test("catalog listing includes only docs-system catalog bundles", async () => {
	const root = mkdtempSync(join(tmpdir(), "docs-kernel-catalog-listing-"));
	mkdirSync(join(root, "docs"), { recursive: true });
	const genericAgentDir = join(root, "agent-kernel-catalog", "generic-fixture");
	const prompt = JSON.stringify({
		kind: "prompt",
		schemaVersion: "prompt-kit/v1",
		id: "catalogListingFixture",
		nodes: [{
			type: "section",
			tag: "task",
			children: [{ type: "paragraph", content: ["Fixture prompt."] }],
		}],
	});
	for (const [agentDir, name, model] of [
		[genericAgentDir, "generic-fixture", "docs-writer"],
	] as const) {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "agent.json"), JSON.stringify({
			$schema: "agent-kernel/agent-v1",
			name,
			description: `${name} listing fixture`,
			model,
		}));
		writeFileSync(join(agentDir, "prompt.json"), prompt);
	}

	const fixtureHarness = await createDocsKernelHarness({
		rootDir: root,
		dbPath: join(root, "kernel.sqlite"),
		piAgentDir: join(root, "pi-agent"),
		agentKernelCatalogDir: join(root, "agent-kernel-catalog"),
	});
	try {
		const response = await fixtureHarness.app.handle(
			new Request("http://localhost/kernel/catalog/agents"),
		);
		expect(response.status).toBe(200);
		const body = await response.json() as {
			agents: Array<{ name: string; valid: boolean }>;
		};
		expect(body.agents.map(({ name }) => name)).toEqual(["docs-lab-editor"]);
		expect(body.agents[0]?.valid).toBe(true);
	} finally {
		await fixtureHarness.dispose();
		rmSync(root, { recursive: true, force: true });
	}
});
