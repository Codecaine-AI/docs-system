import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
