/**
 * Docs kernel boot — docs-system running as a repo-owned kernel.
 *
 * This harness only reads `.agent-kernel/kernel.json`; the manifest is an
 * authoring surface owned by docs-system. The generic docs-writer remains in
 * agent-kernel/catalog and joins this registry unlisted when the sibling repo
 * is present, so it is spawnable without appearing in this kernel's catalog.
 */
import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
	ensureKernelObservabilitySchema,
	kernelDatabasePath,
	openKernelDatabase,
	readKernelManifest,
	type KernelDatabase,
	type ReadKernelManifest,
} from "@agent-kernel/db";
import {
	createKernel,
	type CatalogRootSpec,
	type KernelInstance,
} from "@agent-kernel/kernel";

import { docsEditSharedTools } from "./docs-edit";

export const KERNEL_ID = "docs-system";
export const DISPLAY_NAME = "Docs System";
export const DEFAULT_PORT = 4840;
export const DEFAULT_DOCS_WRITER_MODEL = "codex-lb/gpt-5.6-sol";

/** This file lives at docs-system/packages/docs-kernel/src/kernel.ts. */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
export const PACKAGE_ROOT = resolve(import.meta.dir, "..");
export const KERNEL_ROOT = join(REPO_ROOT, ".agent-kernel");
export const DOCS_CATALOG_ROOT = join(REPO_ROOT, "catalog");
export const DEFAULT_DOCS_ROOT = join(REPO_ROOT, "docs");
export const DEFAULT_PI_AGENT_DIR = join(PACKAGE_ROOT, ".pi-agent");

/** Generic bundle catalog in the sibling agent-kernel repo. */
export const AGENT_KERNEL_CATALOG_DIR = resolve(
	REPO_ROOT,
	"..",
	"agent-kernel",
	"catalog",
);

export interface DocsKernelBootOptions {
	/** Runtime docs-system root containing the repo-owned manifest. */
	rootDir?: string;
	/** Override for tests or nonstandard local layouts. */
	dbPath?: string;
	docsRoot?: string;
	piAgentDir?: string;
	docsWriterModel?: string;
	/** Override the sibling catalog location in isolated tests. */
	agentKernelCatalogDir?: string;
}

export interface DocsKernelBoot {
	rootDir: string;
	kernelRoot: string;
	kernelId: string;
	dbPath: string;
	docsRoot: string;
	piSessionsDir: string;
	piAgentDir: string;
	/** Browseable catalog roots from the manifest (or catalog/ fallback). */
	catalogRoots: string[];
	docsWriterCatalogPresent: boolean;
	docsWriterModel: string;
	db: KernelDatabase;
	kernel: KernelInstance<unknown>;
	closeDatabase: () => void;
}

function resolveAgainst(base: string, path: string): string {
	return isAbsolute(path) ? path : resolve(base, path);
}

async function readDocsManifest(
	rootDir: string,
): Promise<ReadKernelManifest | undefined> {
	const manifest = await readKernelManifest(rootDir);
	if (!manifest) {
		console.error(
			`docs-kernel: kernel manifest not found at ${join(rootDir, ".agent-kernel/kernel.json")}; `
				+ `booting on contract defaults (kernelId ${KERNEL_ID}, catalog root ${join(rootDir, "catalog")}, `
				+ `db ${kernelDatabasePath(rootDir)}). Write the repo-owned manifest to make this kernel discoverable.`,
		);
		return undefined;
	}
	if (manifest.kernelId !== KERNEL_ID) {
		console.warn(
			`docs-kernel: manifest kernelId ${JSON.stringify(manifest.kernelId)} differs from expected `
				+ `${JSON.stringify(KERNEL_ID)}; using the manifest's id.`,
		);
	}
	return manifest;
}

export async function bootDocsKernel(
	options: DocsKernelBootOptions = {},
): Promise<DocsKernelBoot> {
	const rootDir = resolve(options.rootDir ?? REPO_ROOT);
	const manifest = await readDocsManifest(rootDir);
	const kernelRoot = manifest?.kernelRoot
		? resolveAgainst(rootDir, manifest.kernelRoot)
		: join(rootDir, ".agent-kernel");
	const dbPath = resolve(
		options.dbPath
			?? (manifest?.dbPath
				? resolveAgainst(kernelRoot, manifest.dbPath)
				: kernelDatabasePath(rootDir)),
	);
	const piSessionsDir = manifest?.piSessionsDir
		? resolveAgainst(rootDir, manifest.piSessionsDir)
		: join(kernelRoot, "pi-sessions");
	const piAgentDir = resolve(
		options.piAgentDir
			?? Bun.env.DOCS_KERNEL_PI_AGENT_DIR
			?? DEFAULT_PI_AGENT_DIR,
	);
	const docsRoot = resolve(
		options.docsRoot
			?? Bun.env.DOCS_KERNEL_DOCS_ROOT
			?? join(rootDir, "docs"),
	);
	const catalogRoots = (
		manifest?.catalogRoots ?? [join(rootDir, "catalog")]
	).map((root) => resolveAgainst(rootDir, root));
	const docsWriterModel =
		options.docsWriterModel
			?? Bun.env.DOCS_KERNEL_DOCS_WRITER_MODEL
			?? DEFAULT_DOCS_WRITER_MODEL;

	const missingRoots = catalogRoots.filter((root) => !existsSync(root));
	if (missingRoots.length > 0) {
		throw new Error(
			`docs-kernel catalog root${missingRoots.length === 1 ? "" : "s"} not found: ${missingRoots.join(", ")}`,
		);
	}

	const agentKernelCatalogDir = resolve(
		options.agentKernelCatalogDir ?? AGENT_KERNEL_CATALOG_DIR,
	);
	const docsWriterCatalogPresent = existsSync(agentKernelCatalogDir);
	if (!docsWriterCatalogPresent) {
		console.warn(
			`docs-kernel: shared agent catalog not found at ${agentKernelCatalogDir}; `
				+ "docs-edit sessions will not resolve docs-writer "
				+ "(standalone checkout without the sibling agent-kernel repo).",
		);
	}
	const kernelCatalogRoots: CatalogRootSpec[] = docsWriterCatalogPresent
		? [...catalogRoots, { path: agentKernelCatalogDir, listed: false }]
		: [...catalogRoots];

	mkdirSync(piSessionsDir, { recursive: true });

	const database = openKernelDatabase({ path: dbPath });
	let kernel: KernelInstance<unknown> | null = null;
	try {
		await ensureKernelObservabilitySchema(database.db);
		// No manifest write: docs-system owns .agent-kernel/kernel.json.
		kernel = createKernel({
			id: manifest?.kernelId ?? KERNEL_ID,
			db: database.db,
			catalog: { roots: kernelCatalogRoots },
			models: { aliases: { "docs-writer": docsWriterModel } },
			sharedTools: docsEditSharedTools,
			piSessionsDir,
			piAgentDir,
			concurrency: { maxBackgroundAgents: 1 },
			logger: console,
		});

		// Fail boot immediately if a catalog is malformed.
		await kernel.registry();

		return {
			rootDir,
			kernelRoot,
			kernelId: manifest?.kernelId ?? KERNEL_ID,
			dbPath,
			docsRoot,
			piSessionsDir,
			piAgentDir,
			catalogRoots,
			docsWriterCatalogPresent,
			docsWriterModel,
			db: database.db,
			kernel,
			closeDatabase: database.close,
		};
	} catch (error) {
		kernel?.dispose();
		database.close();
		throw error;
	}
}
