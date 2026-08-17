import { join } from "node:path";

import { createKernelCatalogApi } from "@agent-kernel/kernel/catalog-api";
import { createKernelTraceReadApi } from "@agent-kernel/kernel/read-api";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

import { createDocsKernelDocsEditSessions } from "./docs-edit";
import { createDocsEditSessionApi } from "./docs-edit-session-api";
import { bootDocsKernel, type DocsKernelBootOptions } from "./kernel";
import { CORS_HEADERS } from "./cors";

export async function createDocsKernelHarness(
	options: DocsKernelBootOptions = {},
) {
	const boot = await bootDocsKernel(options);
	const docsEditSessions = createDocsKernelDocsEditSessions(boot.kernel, {
		docsRoot: boot.docsRoot,
		sessionRoot: join(boot.kernelRoot, "docs-edit-sessions"),
		workingDir: boot.rootDir,
	});
	const catalogApi = createKernelCatalogApi(
		boot.kernel.catalogApiService({ allowWrites: true }),
		{
			prefix: "/kernel",
			allowWrites: true,
		},
	);
	const readApi = createKernelTraceReadApi(boot.kernel.readApiService, {
		prefix: "/kernel",
	});
	const docsEditApi = createDocsEditSessionApi(docsEditSessions, {
		prefix: "/kernel",
		allowWrites: true,
	});

	const app = new Elysia()
		.onRequest(({ set }) => {
			Object.assign(set.headers, CORS_HEADERS);
		})
		.options(
			"/kernel/*",
			() => new Response(null, { status: 204, headers: CORS_HEADERS }),
		)
		.use(readApi)
		.use(catalogApi)
		.use(docsEditApi)
		.get("/health", () => {
			boot.db.run(sql`select 1`);
			return { status: "ok", kernel: boot.kernel.id };
		});

	let disposed = false;
	return {
		app,
		boot,
		docsEditSessions,
		async dispose() {
			if (disposed) return;
			disposed = true;
			docsEditSessions.disposeAll();
			boot.kernel.dispose();
			await boot.kernel.traceWriter.flush();
			boot.closeDatabase();
		},
	};
}

export type DocsKernelHarness = Awaited<
	ReturnType<typeof createDocsKernelHarness>
>;
