import { createDocsKernelHarness } from "./app";
import { DEFAULT_PORT } from "./kernel";

const port = Number(Bun.env.DOCS_KERNEL_PORT ?? Bun.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(`DOCS_KERNEL_PORT must be a valid TCP port; got ${port}`);
}

const baseUrl = `http://127.0.0.1:${port}`;
const harness = await createDocsKernelHarness();
let server: ReturnType<typeof harness.app.listen>;
try {
	server = harness.app.listen({ hostname: "127.0.0.1", port });
} catch (error) {
	await harness.dispose();
	throw error;
}

let shuttingDown = false;
async function shutdown(): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	server.stop();
	await harness.dispose();
}

process.once("SIGINT", () => {
	void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
	void shutdown().finally(() => process.exit(0));
});

console.log(`Docs System kernel listening on ${baseUrl}`);
console.log(`Trace database: ${harness.boot.dbPath}`);
for (const corpus of harness.boot.corpora) {
	console.log(`Docs root: ${corpus.name} -> ${corpus.docsRoot}`);
}
console.log(`Catalog roots: ${harness.boot.catalogRoots.join(", ")}`);
