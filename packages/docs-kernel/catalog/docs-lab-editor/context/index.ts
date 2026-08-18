/**
 * Section ② — standing docs-system knowledge for the Docs Lab editor.
 *
 * Two live sources replace the retired packages/framework markdown copies:
 * structure standards render from the corpus's own doc.json bundles through
 * the sanctioned agent projection (projectToMarkdown), and the editing
 * reference renders from the component registry (buildBlocksDiscovery), so
 * both stay current by construction. Writing style remains the repo-root
 * file. The live document and request queue stay section ③/session-tool data
 * and are not loaded here.
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
import {
	buildBlocksDiscovery,
	projectToMarkdown,
	validateDocDocument,
	type BlocksDiscoveryComponent,
} from "@codecaine-ai/docs-model";

/**
 * Anchor paths to this bundle so host:"any" evaluation works under Node and
 * from any process working directory.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_SYSTEM_ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const DOCS_ROOT = join(DOCS_SYSTEM_ROOT, "docs");

/**
 * The corpus bundles rendered into <docs_structure_standards>, in reading
 * order. Standards live in the docs-system corpus for every session corpus.
 */
export const STANDARDS_BUNDLES: ReadonlyArray<string> = [
	"10-system-design/10-doc-standards",
	"10-system-design/10-doc-standards/10-structure",
	"10-system-design/10-doc-standards/20-numbering",
	"10-system-design/10-doc-standards/30-cross-doc-linking",
	"10-system-design/10-doc-standards/40-code-linking",
	"10-system-design/10-doc-standards/50-in-code-docs",
	"10-system-design/10-doc-standards/60-implementation-layer",
];

const WRITING_STYLE_FILE = join(DOCS_SYSTEM_ROOT, "writingstyle.md");

const standardsFile = (bundle: string): string =>
	join(DOCS_ROOT, bundle, "doc.json");

const loaders: AgentContextResolver["loaders"] = [
	...STANDARDS_BUNDLES.map((bundle) => ({
		kind: "file" as const,
		path: standardsFile(bundle),
	})),
	{ kind: "file" as const, path: WRITING_STYLE_FILE },
];

function loadedPath(input: LoadedMap[number]): string {
	return typeof input.decl === "object" && "path" in input.decl
		? String(input.decl.path)
		: "";
}

const INDENT = "  ";

function indent(body: string): string {
	return body
		.split("\n")
		.map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
		.join("\n");
}

/** Wraps body in a tag, indenting it one level; nested calls accumulate. */
function block(tag: string, attrs: string, body: string): string {
	const open = attrs.length > 0 ? `<${tag} ${attrs}>` : `<${tag}>`;
	return [open, indent(body), `</${tag}>`].join("\n");
}

// ---------------------------------------------------------------------------
// <docs_structure_standards> — corpus doc.json → agent markdown
// ---------------------------------------------------------------------------

function renderStandardsDoc(bundle: string, raw: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return `<doc path="${bundle}" status="unparseable"></doc>`;
	}
	const validated = validateDocDocument(parsed);
	if (!validated.ok) {
		return `<doc path="${bundle}" status="invalid"></doc>`;
	}
	const title = validated.document.title ?? bundle;
	return block(
		"doc",
		`path="${bundle}" title="${title}"`,
		projectToMarkdown(validated.document),
	);
}

// ---------------------------------------------------------------------------
// <docs_editing_reference> — component registry → agent reference
// ---------------------------------------------------------------------------

/**
 * Op argument shapes, kept in sync with the authoritative DocOp union in
 * docs-model doc-ops.ts (same maintenance contract as the discovery op
 * descriptions those lines accompany).
 */
const OP_SIGNATURES: Readonly<Record<string, string>> = {
	insertBlock:
		"{blockId (fresh, non-colliding), parentId, index, blockType, props, text?: DeltaSpan[]}",
	updateBlock: "{blockId, props?: shallow-merge patch, text?: DeltaSpan[] | null}",
	deleteBlock: '{blockId, mode?: "subtree" (default) | "reparent"}',
	moveBlock: "{blockId, toParentId, toIndex}",
	splitBlock: "{blockId, offset}",
	mergeBlocks: "{blockIds: [two or more contiguous siblings, document order]}",
	componentAction: '{blockId, action: "<blockType>.<verb>", params}',
};

/** Hand-held guidance where trace evidence showed agents guessing. */
const USAGE_NOTES: Readonly<Record<string, string>> = {
	"process-outline":
		'Structure lives in steps and their nesting (kind "note" for annotations); never encode arrows or layout in step text — the renderer owns presentation.',
	"interaction-surface":
		"Carries no text at all; content changes only through the operation actions.",
	"structured-table":
		"Prefer the row/column/cell actions over replacing the whole props object.",
	"state-shape": "Prefer the field actions over replacing the whole fields tree.",
	canvas:
		"Forwarded to the canvas authority; a forwarded action must travel alone, not batched with other ops.",
	sequence:
		"Forwarded to the sequence authority; a forwarded action must travel alone, not batched with other ops.",
};

const TEXT_FORMAT = [
	"Block text is always a DeltaSpan array, never a bare string:",
	'  [{insert: "…", attributes?: {bold?: true, italic?: true, strike?: true, code?: true, link?: string}}]',
	"Applies to insertBlock/updateBlock `text` and to splitBlock offsets.",
].join("\n");

type SchemaNode = Record<string, unknown>;

/**
 * Compact structural rendering of a TypeBox JSON Schema. Named ($id) schemas
 * are hoisted into a defs list so recursive shapes (ProcessOutlineStep,
 * Field) print once. Falls back to raw JSON for unrecognized nodes.
 */
function createSchemaPrinter(): {
	print(schema: unknown): string;
	defs(): string[];
} {
	const defs = new Map<string, string>();

	function print(node: unknown): string {
		if (node === null || typeof node !== "object") return "json";
		const schema = node as SchemaNode;

		const ref = schema.$ref;
		if (typeof ref === "string") return ref.replace(/^#\/?/, "");

		const id = typeof schema.$id === "string" ? schema.$id : undefined;
		if (id !== undefined) {
			if (!defs.has(id)) {
				defs.set(id, "…"); // guard recursion before rendering the body
				defs.set(id, printBody(schema));
			}
			return id;
		}
		return printBody(schema);
	}

	function printBody(schema: SchemaNode): string {
		if ("const" in schema) return JSON.stringify(schema.const);
		if (Array.isArray(schema.enum)) {
			return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
		}
		if (Array.isArray(schema.anyOf)) {
			return schema.anyOf.map(print).join(" | ");
		}
		if (Array.isArray(schema.allOf) && schema.allOf.length === 1) {
			return print(schema.allOf[0]);
		}

		switch (schema.type) {
			case "string":
				return "str";
			case "number":
				return "num";
			case "integer":
				return "int";
			case "boolean":
				return "bool";
			case "null":
				return "null";
			case "array": {
				const items = print(schema.items);
				const itemsNode =
					schema.items !== null && typeof schema.items === "object"
						? (schema.items as SchemaNode)
						: undefined;
				const isUnion =
					itemsNode !== undefined &&
					((Array.isArray(itemsNode.anyOf) && itemsNode.anyOf.length > 1) ||
						(Array.isArray(itemsNode.enum) && itemsNode.enum.length > 1));
				return isUnion ? `(${items})[]` : `${items}[]`;
			}
			case "object": {
				const properties =
					schema.properties !== null && typeof schema.properties === "object"
						? (schema.properties as Record<string, unknown>)
						: {};
				const required = new Set(
					Array.isArray(schema.required)
						? schema.required.filter(
								(key): key is string => typeof key === "string",
							)
						: [],
				);
				const entries = Object.entries(properties).map(
					([key, value]) =>
						`${key}${required.has(key) ? "" : "?"}: ${print(value)}`,
				);
				return `{${entries.join(", ")}}`;
			}
			default:
				return JSON.stringify(schema);
		}
	}

	return {
		print,
		defs: () =>
			Array.from(defs.entries()).map(([name, body]) => `${name} = ${body}`),
	};
}

function renderBlockType(
	component: BlocksDiscoveryComponent,
	type: BlocksDiscoveryComponent["types"][number],
	printer: ReturnType<typeof createSchemaPrinter>,
): string {
	const lines: string[] = [`props: ${printer.print(type.state)}`];
	for (const action of component.actions) {
		if (!action.action.startsWith(`${type.type}.`)) continue;
		lines.push(`${action.action} ${printer.print(action.params)}`);
		if (action.description.length > 0) {
			lines.push(`${INDENT.repeat(2)}${action.description}`);
		}
	}
	const note = USAGE_NOTES[type.type];
	if (note !== undefined) lines.push(`note: ${note}`);
	return block(
		"block_type",
		`name="${type.type}" text="${type.carriesText ? "yes" : "no"}"`,
		lines.join("\n"),
	);
}

function renderEditingReference(): string {
	const discovery = buildBlocksDiscovery();
	const printer = createSchemaPrinter();

	const ops = discovery.ops
		.flatMap((entry) => [
			`${entry.op} ${OP_SIGNATURES[entry.op] ?? ""}`.trimEnd(),
			`    ${entry.description}`,
		])
		.join("\n");

	const blockTypes = discovery.components
		.flatMap((component) =>
			component.types.map((type) =>
				renderBlockType(component, type, printer),
			),
		)
		.join("\n");

	const defs = printer.defs();
	const defsBlock =
		defs.length > 0 ? block("shared_shapes", "", defs.join("\n")) : null;

	return block(
		"docs_editing_reference",
		'schemaVersion="2"',
		[
			block("doc_ops", "", ops),
			block("text_format", "", TEXT_FORMAT),
			block("block_types", "", blockTypes),
			...(defsBlock !== null ? [defsBlock] : []),
		].join("\n"),
	);
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

// Standing knowledge is session-invariant; the session aim belongs to state.
function assemble(loaded: LoadedMap, _ctx: SpawnContext): string {
	const loadedByPath = new Map(loaded.map((input) => [loadedPath(input), input]));

	const standards = STANDARDS_BUNDLES.map((bundle) => {
		const input = loadedByPath.get(standardsFile(bundle));
		if (input === undefined || input.status !== "ok") {
			return `<doc path="${bundle}" status="${input?.status ?? "missing"}"></doc>`;
		}
		return renderStandardsDoc(bundle, input.content);
	}).join("\n");

	const style = loadedByPath.get(WRITING_STYLE_FILE);
	const styleBlock =
		style !== undefined && style.status === "ok"
			? block("docs_writing_style", 'source="writingstyle.md"', style.content)
			: `<docs_writing_style status="${style?.status ?? "missing"}"></docs_writing_style>`;

	return [
		block(
			"docs_structure_standards",
			'source="docs-system corpus · 10-system-design/10-doc-standards"',
			standards,
		),
		styleBlock,
		renderEditingReference(),
	].join("\n");
}

export const context = defineContext({ loaders, assemble });
export default context;
