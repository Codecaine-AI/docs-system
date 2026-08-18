/**
 * Docs kernel boot — docs-system running as a repo-owned kernel.
 *
 * This harness only reads `.agent-kernel/kernel.json`; the manifest is an
 * authoring surface owned by docs-system. Generic bundles in the sibling
 * agent-kernel catalog remain resolvable for legacy spawns, but are not listed
 * as docs-system agents.
 */
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
export const DEFAULT_DOCS_LAB_EDITOR_MODEL = DEFAULT_DOCS_WRITER_MODEL;

/** This file lives at docs-system/packages/docs-kernel/src/kernel.ts. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(MODULE_DIR, "..", "..", "..");
export const PACKAGE_ROOT = resolve(MODULE_DIR, "..");
export const KERNEL_ROOT = join(REPO_ROOT, ".agent-kernel");
export const DOCS_CATALOG_ROOT = join(REPO_ROOT, "catalog");
export const BUILTIN_DOCS_CATALOG_ROOT = join(PACKAGE_ROOT, "catalog");
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
	corpora?: DocsKernelCorpus[];
	/** Legacy single-corpus override. */
	docsRoot?: string;
	piAgentDir?: string;
	docsWriterModel?: string;
	docsLabEditorModel?: string;
	/** Override the sibling catalog location in isolated tests. */
	agentKernelCatalogDir?: string;
}

export interface DocsKernelCorpus {
	name: string;
	docsRoot: string;
}

export interface DocsKernelBoot {
	rootDir: string;
	kernelRoot: string;
	kernelId: string;
	dbPath: string;
	/** Ordered corpora; the first corpus is the default. */
	corpora: DocsKernelCorpus[];
	/** Compatibility alias for the default corpus root. */
	docsRoot: string;
	piSessionsDir: string;
	piAgentDir: string;
	/** Browseable catalog roots from the manifest (or package + extension defaults). */
	catalogRoots: string[];
	docsWriterCatalogPresent: boolean;
	docsLabEditorCatalogPresent: boolean;
	docsWriterModel: string;
	docsLabEditorModel: string;
	db: KernelDatabase;
	kernel: KernelInstance<unknown>;
	closeDatabase: () => void;
}

function resolveAgainst(base: string, path: string): string {
	return isAbsolute(path) ? path : resolve(base, path);
}

export function resolveDocsCatalogRoots(
	manifestCatalogRoots: string[] | undefined,
	rootDir: string,
): string[] {
	if (manifestCatalogRoots) {
		return manifestCatalogRoots.map((root) => resolveAgainst(rootDir, root));
	}
	const repoCatalogRoot = join(rootDir, "catalog");
	return [
		BUILTIN_DOCS_CATALOG_ROOT,
		...(existsSync(repoCatalogRoot) ? [repoCatalogRoot] : []),
	];
}

interface DocsCorporaEnvironment {
	DOCS_KERNEL_DOCS_ROOTS?: string;
	DOCS_KERNEL_CORPORA_FILE?: string;
	DOCS_KERNEL_DOCS_ROOT?: string;
}

interface ResolveDocsCorporaContext {
	rootDir: string;
	env?: DocsCorporaEnvironment;
	cwd?: string;
	warn?: (message: string) => void;
}

interface CorporaFileShape {
	corpora: DocsKernelCorpus[];
}

function parseCorporaFile(path: string): DocsKernelCorpus[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(
			`docs-kernel corpora file could not be read at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const corpora = (parsed as Partial<CorporaFileShape> | null)?.corpora;
	if (!Array.isArray(corpora)) {
		throw new Error(
			`docs-kernel corpora file at ${path} must contain a corpora array`,
		);
	}
	return corpora.map((entry, index) => {
		if (
			!entry
			|| typeof entry.name !== "string"
			|| entry.name.trim().length === 0
			|| typeof entry.docsRoot !== "string"
			|| entry.docsRoot.trim().length === 0
		) {
			throw new Error(
				`docs-kernel corpora file at ${path} has an invalid entry at index ${index}`,
			);
		}
		return {
			name: entry.name.trim(),
			docsRoot: resolve(dirname(path), entry.docsRoot.trim()),
		};
	});
}

function parseEnvCorpora(value: string, cwd: string): DocsKernelCorpus[] {
	return value.split(",").map((pair, index) => {
		const separator = pair.indexOf("=");
		const name = separator === -1 ? "" : pair.slice(0, separator).trim();
		const docsRoot = separator === -1 ? "" : pair.slice(separator + 1).trim();
		if (!name || !docsRoot) {
			throw new Error(
				`DOCS_KERNEL_DOCS_ROOTS entry ${index + 1} must be a name=path pair`,
			);
		}
		return { name, docsRoot: resolve(cwd, docsRoot) };
	});
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** Resolve, normalize, and validate the ordered docs corpora used at boot. */
export function resolveDocsKernelCorpora(
	options: Pick<DocsKernelBootOptions, "corpora" | "docsRoot">,
	context: ResolveDocsCorporaContext,
): DocsKernelCorpus[] {
	const env = context.env ?? Bun.env;
	const cwd = context.cwd ?? process.cwd();
	const warn = context.warn ?? console.warn;
	let candidates: DocsKernelCorpus[];

	if (options.corpora !== undefined) {
		candidates = options.corpora.map(({ name, docsRoot }) => ({
			name,
			docsRoot: resolve(cwd, docsRoot),
		}));
	} else if (env.DOCS_KERNEL_DOCS_ROOTS) {
		candidates = parseEnvCorpora(env.DOCS_KERNEL_DOCS_ROOTS, cwd);
	} else {
		const configuredCorporaFile = env.DOCS_KERNEL_CORPORA_FILE;
		const corporaFile = configuredCorporaFile
			? resolve(cwd, configuredCorporaFile)
			: join(context.rootDir, "docs-kernel.corpora.json");
		if (configuredCorporaFile || existsSync(corporaFile)) {
			candidates = parseCorporaFile(corporaFile);
		} else {
			const legacyDocsRoot = options.docsRoot ?? env.DOCS_KERNEL_DOCS_ROOT;
			if (legacyDocsRoot) {
				const docsRoot = resolve(cwd, legacyDocsRoot);
				candidates = [{
					name: basename(dirname(docsRoot)),
					docsRoot,
				}];
			} else {
				candidates = [{
					name: "docs-system",
					docsRoot: join(context.rootDir, "docs"),
				}];
			}
		}
	}

	const corpora = candidates.filter((corpus) => {
		if (isDirectory(corpus.docsRoot)) return true;
		warn(
			`docs-kernel: docs root for corpus ${corpus.name} not found at ${corpus.docsRoot}; skipping.`,
		);
		return false;
	});
	if (corpora.length === 0) {
		throw new Error("docs-kernel: no valid docs corpora found");
	}
	return corpora;
}

async function readDocsManifest(
	rootDir: string,
): Promise<ReadKernelManifest | undefined> {
	const manifest = await readKernelManifest(rootDir);
	if (!manifest) {
		console.error(
			`docs-kernel: kernel manifest not found at ${join(rootDir, ".agent-kernel/kernel.json")}; `
				+ `booting on contract defaults (kernelId ${KERNEL_ID}, built-in catalog root ${BUILTIN_DOCS_CATALOG_ROOT}, `
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
	const corpora = resolveDocsKernelCorpora(options, { rootDir });
	const docsRoot = corpora[0]!.docsRoot;
	const resolvedCatalogRoots = resolveDocsCatalogRoots(
		manifest?.catalogRoots,
		rootDir,
	);
	const optionalRepoCatalogRoot = join(rootDir, "catalog");
	const catalogRoots = resolvedCatalogRoots.filter((root) =>
		root !== optionalRepoCatalogRoot || existsSync(root)
	);
	const docsWriterModel =
		options.docsWriterModel
			?? Bun.env.DOCS_KERNEL_DOCS_WRITER_MODEL
			?? DEFAULT_DOCS_WRITER_MODEL;
	const docsLabEditorModel =
		options.docsLabEditorModel
			?? Bun.env.DOCS_KERNEL_DOCS_LAB_EDITOR_MODEL
			?? DEFAULT_DOCS_LAB_EDITOR_MODEL;

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
	const docsLabEditorCatalogPresent = existsSync(
		join(BUILTIN_DOCS_CATALOG_ROOT, "docs-lab-editor"),
	);
	if (!docsLabEditorCatalogPresent) {
		console.warn(
			`docs-kernel: docs-lab-editor catalog bundle not found at ${join(BUILTIN_DOCS_CATALOG_ROOT, "docs-lab-editor")}; `
				+ "docs-edit sessions will not resolve docs-lab-editor.",
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
			models: {
				aliases: {
					"docs-writer": docsWriterModel,
					"docs-lab-editor": docsLabEditorModel,
				},
			},
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
			corpora,
			docsRoot,
			piSessionsDir,
			piAgentDir,
			catalogRoots,
			docsWriterCatalogPresent,
			docsLabEditorCatalogPresent,
			docsWriterModel,
			docsLabEditorModel,
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
