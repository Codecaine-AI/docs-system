import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
	AnnotationsDocument,
	DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument } from "@codecaine-ai/docs-model/doc-schema";

export const FIXTURE_PATH = "guide";
export const OTHER_FIXTURE_PATH = "other";

export function fixtureDoc(
	overrides: Partial<Pick<DocDocument, "id" | "title">> = {},
): DocDocument {
	return {
		schemaVersion: 1,
		id: overrides.id ?? "docs-edit-fixture",
		title: overrides.title ?? "Docs Edit Fixture",
		root: "root",
		blocks: {
			root: {
				id: "root",
				type: "paragraph",
				props: {},
				children: ["h1", "p1", "p2"],
			},
			h1: {
				id: "h1",
				type: "heading",
				props: { level: 1 },
				text: [{ insert: "Fixture title" }],
				children: [],
			},
			p1: {
				id: "p1",
				type: "paragraph",
				props: {},
				text: [{ insert: "First paragraph." }],
				children: [],
			},
			p2: {
				id: "p2",
				type: "paragraph",
				props: {},
				text: [{ insert: "Second paragraph." }],
				children: [],
			},
		},
	};
}

export function fixtureAnnotation(
	overrides: Partial<DocAnnotation> & Pick<DocAnnotation, "id">,
): DocAnnotation {
	return {
		target: { kind: "block", blockId: "p1" },
		body: "Tighten this paragraph.",
		intent: "agent-request",
		author: "ford",
		status: "open",
		createdAt: "2026-08-14T12:00:00.000Z",
		...overrides,
		id: overrides.id,
	};
}

export function fixtureAnnotations(
	annotations: DocAnnotation[] = [
		fixtureAnnotation({ id: "ann-block" }),
		fixtureAnnotation({
			id: "ann-range",
			target: {
				kind: "text-range",
				blockId: "p2",
				start: 0,
				end: 6,
				quote: "Second",
			},
			body: "Make this opening more specific.",
		}),
		fixtureAnnotation({
			id: "ann-doc",
			target: { kind: "block", blockId: "root" },
			body: "Remove repetition across the document.",
		}),
	],
): AnnotationsDocument {
	return { schemaVersion: 1, annotations };
}

export async function writeBundle(
	docsRoot: string,
	path = FIXTURE_PATH,
	options: {
		doc?: DocDocument;
		annotations?: AnnotationsDocument | null;
	} = {},
): Promise<void> {
	const bundleDir = join(docsRoot, path);
	await mkdir(bundleDir, { recursive: true });
	await writeFile(
		join(bundleDir, "doc.json"),
		serializeDocDocument(options.doc ?? fixtureDoc()),
		"utf8",
	);
	if (options.annotations !== null) {
		await writeFile(
			join(bundleDir, "annotations.json"),
			`${JSON.stringify(options.annotations ?? fixtureAnnotations(), null, 2)}\n`,
			"utf8",
		);
	}
}

export async function readDiskDoc(
	docsRoot: string,
	path = FIXTURE_PATH,
): Promise<DocDocument> {
	return JSON.parse(
		await readFile(join(docsRoot, path, "doc.json"), "utf8"),
	) as DocDocument;
}

export async function readDiskAnnotations(
	docsRoot: string,
	path = FIXTURE_PATH,
): Promise<AnnotationsDocument> {
	return JSON.parse(
		await readFile(join(docsRoot, path, "annotations.json"), "utf8"),
	) as AnnotationsDocument;
}

export function updateTextOp(blockId: string, text: string) {
	return {
		type: "updateBlock" as const,
		blockId,
		text: [{ insert: text }],
	};
}
