/** Shared standing knowledge for internal and external Docs authors. No kernel runtime. */
import { projectToMarkdown } from "./project-markdown";
import { validateDocDocument } from "./doc-schema";
import { visualComponentGuidance } from "./visual-component-guidance";
import type { ComponentManifest } from "./components/types";
import { ALL_COMPONENTS } from "./components";

export const STANDARDS_BUNDLES: ReadonlyArray<string> = [
	"10-system-design/10-doc-standards/10-structure",
	"10-system-design/10-doc-standards/20-numbering",
	"10-system-design/10-doc-standards/30-cross-doc-linking",
	"10-system-design/10-doc-standards/40-code-linking",
	"10-system-design/10-doc-standards/50-in-code-docs",
	"10-system-design/10-doc-standards/60-implementation-layer",
	"10-system-design/10-doc-standards/70-document-purpose",
	"10-system-design/10-doc-standards/80-authoring-lints",
];

/** The corpus bundles rendered into <docs_style_guide>, in reading order. */
export const STYLE_GUIDE_BUNDLES: ReadonlyArray<string> = [
	"99-appendix/10-style-guide/10-writing-style",
	"99-appendix/10-style-guide/20-structure",
];

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

function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderCorpusDoc(docsRoot: string, bundle: string, raw: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return `<doc path="${bundle}" file="${escapeAttribute(guidanceBundleFile(docsRoot, bundle))}" status="unparseable"></doc>`;
	}
	const validated = validateDocDocument(parsed);
	if (!validated.ok) {
		return `<doc path="${bundle}" file="${escapeAttribute(guidanceBundleFile(docsRoot, bundle))}" status="invalid"></doc>`;
	}
	const title = validated.document.title ?? bundle;
	return block(
		"doc",
		`path="${bundle}" file="${escapeAttribute(guidanceBundleFile(docsRoot, bundle))}" title="${escapeAttribute(title)}"`,
		projectToMarkdown(validated.document),
	);
}


export const AUTHORING_COMPONENT_MANIFESTS: readonly ComponentManifest[] = ALL_COMPONENTS.map(component => component.manifest);
export type ComponentGuidance = {
  name: string;
  ownedTypes: readonly string[];
  description: string;
  whenToUse: string;
  example: string;
  docsPath: string;
};

/** Fails on missing metadata instead of hiding a registered component from agents. */
export function componentGuidance(manifests = AUTHORING_COMPONENT_MANIFESTS): ComponentGuidance[] {
  return manifests.map(manifest => {
    if (!manifest.authoring?.whenToUse || !manifest.authoring.example || !manifest.authoring.docsPath) {
      throw new Error(`Component ${manifest.name} has no authoring guidance.`);
    }
    return { name: manifest.name, ownedTypes: [...manifest.ownedTypes], description: manifest.description, ...manifest.authoring };
  });
}

export function renderComponentCatalog(components = componentGuidance()): string {
  return components.map(component => [
    `### ${component.name}`,
    `Block types: ${component.ownedTypes.join(", ")}`,
    component.whenToUse,
    `Example: ${component.example}`,
    `Details: ${component.docsPath}`,
  ].join("\n\n")).join("\n\n");
}

export const AUTHORING_BUNDLES = [...STANDARDS_BUNDLES, ...STYLE_GUIDE_BUNDLES];
export const guidanceBundleFile = (docsRoot: string, bundle: string): string => `${docsRoot.replace(/[\\/]$/, "")}/${bundle}/doc.json`;
export type AuthoringInput = { path: string; status: string; content?: string };

/** The same renderer is used by kernel loaders and the MCP skill/resource adapter. */
export function assembleAuthoringGuidance(docsRoot: string, inputs: readonly AuthoringInput[]): string {
  const loaded = new Map(inputs.map(input => [input.path, input]));
  const renderBundles = (bundles: readonly string[]) => bundles.map(bundle => {
    const file = guidanceBundleFile(docsRoot, bundle);
    const input = loaded.get(file);
    if (input?.status !== "ok" || input.content === undefined) {
      return `<doc path="${bundle}" file="${escapeAttribute(file)}" status="${escapeAttribute(input?.status ?? "missing")}"></doc>`;
    }
    return renderCorpusDoc(docsRoot, bundle, input.content);
  }).join("\n");
  return [
    block("docs_visual_components", 'source="docs-model component manifests"', visualComponentGuidance()),
    block("docs_component_catalog", 'source="docs-model component manifests"', renderComponentCatalog()),
    block("docs_structure_standards", 'source="docs-system corpus · 10-system-design/10-doc-standards"', renderBundles(STANDARDS_BUNDLES)),
    block("docs_style_guide", 'source="docs-system corpus · 99-appendix/10-style-guide"', renderBundles(STYLE_GUIDE_BUNDLES)),
  ].join("\n");
}
