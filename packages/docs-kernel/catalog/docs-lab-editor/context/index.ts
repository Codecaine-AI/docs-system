/**
 * Section ② — standing docs-system knowledge for the Docs Lab editor.
 *
 * These references ground proposal quality in the framework skill, structure
 * standards, maintenance cookbook, and writing style. The live document and
 * request queue remain section ③/session-tool data and are not loaded here.
 *
 * There is deliberately no outer <context> envelope: the kernel supplies it.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type {
	AgentContextResolver,
	LoadedMap,
	SpawnContext,
} from "@agent-kernel/kernel/context";

export interface ContextBlock {
	/** XML tag emitted for this section ② block. */
	readonly tag: string;
	/** Source files joined inside the tag, in reading order. */
	readonly files: ReadonlyArray<string>;
}

/**
 * Anchor paths to this bundle so host:"any" evaluation works under Node and
 * from any process working directory.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_SYSTEM_ROOT = resolve(HERE, "..", "..", "..");

const frameworkFile = (...segments: string[]): string =>
	join(DOCS_SYSTEM_ROOT, "packages", "framework", ...segments);

/** The standing context blocks, in rendered reading order. */
export const CONTEXT_BLOCKS: ReadonlyArray<ContextBlock> = [
	{
		tag: "docs_framework_skill",
		files: [frameworkFile("SKILL.md")],
	},
	{
		tag: "docs_structure_standards",
		files: [
			frameworkFile("20-standards", "00-overview.md"),
			frameworkFile("20-standards", "10-hierarchy-layers.md"),
			frameworkFile("20-standards", "20-directory-rules.md"),
			frameworkFile("20-standards", "25-frontmatter-schema.md"),
			frameworkFile("20-standards", "30-numbering-system.md"),
			frameworkFile("20-standards", "40-doc-linking.md"),
			frameworkFile("20-standards", "50-code-linking.md"),
		],
	},
	{
		tag: "docs_cookbook",
		files: [
			frameworkFile("10-cookbook", "10-navigate.md"),
			frameworkFile("10-cookbook", "20-produce.md"),
			frameworkFile("10-cookbook", "30-maintain.md"),
		],
	},
	{
		tag: "docs_writing_style",
		files: [join(DOCS_SYSTEM_ROOT, "writingstyle.md")],
	},
];

/** All source files in kernel-loader order. */
export const CONTEXT_FILES: ReadonlyArray<string> = CONTEXT_BLOCKS.flatMap(
	(entry) => entry.files,
);

const loaders: AgentContextResolver["loaders"] = CONTEXT_FILES.map((path) => ({
	kind: "file",
	path,
}));

function loadedPath(input: LoadedMap[number]): string {
	return typeof input.decl === "object" && "path" in input.decl
		? String(input.decl.path)
		: "";
}

function block(tag: string, body: string): string {
	return [`<${tag}>`, body, `</${tag}>`].join("\n");
}

// Standing knowledge is session-invariant; the session aim belongs to state.
function assemble(loaded: LoadedMap, _ctx: SpawnContext): string {
	const loadedByPath = new Map(loaded.map((input) => [loadedPath(input), input]));

	return CONTEXT_BLOCKS.map((entry) => {
		const inputs = entry.files.map((path) => loadedByPath.get(path));
		const unavailableIndex = inputs.findIndex(
			(input) => input === undefined || input.status !== "ok",
		);
		if (unavailableIndex === -1) {
			const body = inputs.map((input) => input?.content ?? "").join("\n\n");
			return block(entry.tag, body);
		}

		const unavailable = inputs[unavailableIndex];
		const status = unavailable?.status ?? "missing";
		return `<${entry.tag} status="${status}"></${entry.tag}>`;
	}).join("\n");
}

export const context = defineContext({ loaders, assemble });
export default context;
