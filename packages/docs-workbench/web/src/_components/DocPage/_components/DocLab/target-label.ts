import {
	deltaToPlainTextInline,
	docBlockOrder,
	type DocDocument,
} from "@codecaine-ai/docs-model";
import {
	deriveDocOutline,
	type DocEditTarget,
} from "@codecaine-ai/docs-viewer/lab";
import { getDocBlockDescriptor } from "@codecaine-ai/docs-viewer";

const TARGET_PREVIEW_LENGTH = 42;

function truncatePreview(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length > TARGET_PREVIEW_LENGTH
		? `${normalized.slice(0, TARGET_PREVIEW_LENGTH)}...`
		: normalized;
}

/**
 * Names a request target without leaking block ids into the lab UI.
 *
 * Blocks inherit the closest preceding H1/H2 outline label in document
 * order. Content before the first heading falls back to the registry's block
 * label and the same compact text preview used by DocPage targeting chips.
 */
export function labelForTarget(
	doc: DocDocument,
	target: DocEditTarget,
	openDocPath?: string,
): string {
	const normalizedOpenPath = normalizeDocPath(openDocPath);
	const normalizedTargetPath = normalizeDocPath(target.docPath);
	const crossDoc = Boolean(
		normalizedOpenPath &&
			normalizedTargetPath &&
			normalizedOpenPath !== normalizedTargetPath,
	);
	const label = targetLabel(doc, target, !crossDoc);
	return crossDoc ? `${docDisplayName(target.docPath!)} → ${label}` : label;
}

function normalizeDocPath(path?: string): string | undefined {
	if (!path) return undefined;
	return path.replace(/^\/+/, "").replace(/^docs\//, "").replace(/\/+$/, "");
}

function docDisplayName(path: string): string {
	const normalized = normalizeDocPath(path) ?? "";
	const segment = normalized.split("/").at(-1) ?? normalized;
	return segment.replace(/^\d+-/, "").replace(/-/g, " ");
}

function targetLabel(
	doc: DocDocument,
	target: DocEditTarget,
	allowOutline: boolean,
): string {
	if (target.kind === "doc") return "document";

	const order = docBlockOrder(doc);
	const targetIndex = order.indexOf(target.blockId);
	if (allowOutline && targetIndex >= 0) {
		const orderIndex = new Map(order.map((blockId, index) => [blockId, index]));
		const enclosingSection = deriveDocOutline(doc)
			.filter(
				(section) =>
					(orderIndex.get(section.blockId) ?? Number.POSITIVE_INFINITY) <=
					targetIndex,
			)
			.at(-1);
		if (enclosingSection) return enclosingSection.label;
	}

	const block = doc.blocks[target.blockId];
	if (!block) return "block";
	const typeLabel = getDocBlockDescriptor(block.type)?.label ?? block.type;
	const preview = truncatePreview(deltaToPlainTextInline(block.text));
	return preview ? `${typeLabel}: ${preview}` : typeLabel;
}
