import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AgentContextResolver, LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { lintDocument, lintRules } from "@codecaine-ai/docs-model/lint";
import { promptSnapshotFor } from "../../../../agent-kernel/packages/kernel/src/agent-registry/prompt-snapshot";
import type { PromptDocument } from "@codecaine-ai/prompt-kit";
import { context as editor, STANDARDS_BUNDLES as editorStandards, STYLE_GUIDE_BUNDLES as editorStyle } from "../catalog/docs-lab-editor/context";
import { context as writer, STANDARDS_BUNDLES as writerStandards, STYLE_GUIDE_BUNDLES as writerStyle } from "../../../../agent-kernel/catalog/docs-writer/context";

const repo = resolve(import.meta.dir, "../../..");
const corpus = join(repo, "docs");
const authored = [
 "99-appendix/10-style-guide/10-writing-style",
 "99-appendix/10-style-guide/20-structure",
 "10-system-design/10-doc-standards",
 "10-system-design/10-doc-standards/70-document-purpose",
 "10-system-design/10-doc-standards/80-authoring-lints",
];

async function render(context: AgentContextResolver): Promise<string> {
 const loaded: LoadedMap = context.loaders.map(decl => {
  if (typeof decl !== "object" || !("path" in decl)) throw new Error("Expected corpus file loader");
  const content = readFileSync(String(decl.path), "utf8");
  return { decl, content, status: "ok", bytes: content.length, hash: "test", fromCache: false };
 });
 return context.assemble(loaded, {} as SpawnContext);
}

test("both agents load the same expanded corpus with real source paths", async () => {
 expect(editorStandards).toEqual(writerStandards);
 expect(editorStyle).toEqual(writerStyle);
 expect(editorStandards).toContain("10-system-design/10-doc-standards/70-document-purpose");
 expect(editorStandards).toContain("10-system-design/10-doc-standards/80-authoring-lints");
 for (const context of [editor, writer]) {
  const text = await render(context);
  expect(text).toContain("## Remove Ambiguity");
  expect(text).toContain("<docs_visual_components");
  expect(text).toContain('Canvas answers "What connects to what?"');
  expect(text).toContain('Process Outline answers "What should happen, and what should the trace look like?"');
  expect(text).toContain('Sequence answers "Who calls whom, in what order, and what must finish before the next action?"');
  expect(text).toContain("Vertical position shows event order, not measured elapsed time");
  expect(text).toContain("Distinguish intended behavior from an observed trace");
  expect(text).toContain("## Review Checklist");
  expect(text).toContain('title="Document Purpose"');
  expect(text).toContain('title="Authoring Lints"');
  for (const bundle of [...editorStandards, ...editorStyle]) expect(text).toContain(`file="${join(corpus,bundle,"doc.json")}"`);
  expect(text).not.toContain('status="missing"');
 }
});

test("every engine rule resolves to a real corpus document", () => {
 for (const rule of lintRules) {
  const path = join(corpus,rule.docsPath,"doc.json");
  expect(existsSync(path),rule.id).toBe(true);
  expect(validateDocDocument(JSON.parse(readFileSync(path,"utf8"))).ok,rule.id).toBe(true);
 }
});

test("authored guidance passes schema and completion lints and uses typed internal links", () => {
 for (const bundle of authored) {
  const validation = validateDocDocument(JSON.parse(readFileSync(join(corpus,bundle,"doc.json"),"utf8")));
  if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
  expect(serializeDocDocument(validation.document)).toBe(readFileSync(join(corpus,bundle,"doc.json"),"utf8"));
  const golden = join(repo,"packages/docs-model/src/__tests__/goldens/projection", "docs__" + bundle.replaceAll("/","__") + ".md");
  if (existsSync(golden)) expect(projectToMarkdown(validation.document)).toBe(readFileSync(golden,"utf8"));
  expect(lintDocument(validation.document,{phase:"complete"}).findings,bundle).toEqual([]);
  if (bundle === "10-system-design/10-doc-standards") {
   const targets = Object.values(validation.document.blocks).flatMap(block => (block.text ?? []).map(span => span.attributes?.reference?.path));
   expect(targets).toContain("docs/10-system-design/10-doc-standards/70-document-purpose");
   expect(targets).toContain("docs/10-system-design/10-doc-standards/80-authoring-lints");
  }
  for (const block of Object.values(validation.document.blocks)) for (const span of block.text ?? []) {
   expect(typeof span.attributes?.link === "string" && span.attributes.link.startsWith("docs/"),bundle).toBe(false);
   if (span.attributes?.reference?.kind === "doc") expect(existsSync(join(span.attributes.reference.path.startsWith("docs/") ? repo : corpus,span.attributes.reference.path,"doc.json")),span.attributes.reference.path).toBe(true);
   if (span.attributes?.reference?.kind === "source") expect(existsSync(join(repo,span.attributes.reference.path)),span.attributes.reference.path).toBe(true);
  }
 }
});

test("both prompt snapshots derive from sources that require corpus guidance and lint repair", () => {
 for (const bundle of [join(repo,"packages/docs-kernel/catalog/docs-lab-editor"),resolve(repo,"../agent-kernel/catalog/docs-writer")]) {
  const doc = JSON.parse(readFileSync(join(bundle,"prompt/prompt.json"),"utf8")) as PromptDocument;
  const snapshot = readFileSync(join(bundle,"prompt/system.md"),"utf8");
  expect(snapshot).toBe(promptSnapshotFor(doc));
  expect(snapshot).toContain("docs_style_guide");
  expect(snapshot).toContain("warnings are advisory");
  expect(snapshot).toContain("required repair");
  if (bundle.endsWith("docs-lab-editor")) expect(snapshot).not.toContain("check_doc");
 }
});
