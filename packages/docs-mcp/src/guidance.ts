import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORING_BUNDLES,
  STANDARDS_BUNDLES,
  assembleAuthoringGuidance,
  componentGuidance,
  guidanceBundleFile,
  renderComponentCatalog,
  type ComponentGuidance,
} from "../../docs-model/src/authoring-guidance";
import { validateDocDocument } from "../../docs-model/src/doc-schema";
import { projectToMarkdown } from "../../docs-model/src/project-markdown";

const PACKAGE_ROOT = process.env.CODECAINE_DOCS_PACKAGE_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");
export const GUIDANCE_SCHEMA_VERSION = 1;
export type GuidanceSource = {
  path: string;
  sha256: string;
  kind: "standard" | "style" | "component-doc" | "component-manifest" | "renderer" | "skill";
};
export type GuidanceSnapshot = {
  text: string;
  snapshotId: string;
  components: ComponentGuidance[];
  sources: GuidanceSource[];
  /** Rendered canonical component chapters, for resources and generated skill references. */
  componentReferences: Record<string, string>;
};
export const hashGuidanceContent = (content: string): string => createHash("sha256").update(content).digest("hex");
const runtimeFiles = [
  "packages/docs-model/src/authoring-guidance.ts",
  "packages/docs-model/src/visual-component-guidance.ts",
  "packages/docs-model/src/project-markdown.ts",
  ...componentGuidance().map(component => `packages/docs-model/src/components/${component.name}/manifest.ts`),
];
// JavaScript metadata is imported once. A service restart is necessary after its sources change.
declare const __DOCS_RUNTIME_SOURCES__: Record<string, string> | undefined;
const initialRuntimeSources = Promise.all(runtimeFiles.map(async path => ({ path, hash: typeof __DOCS_RUNTIME_SOURCES__ !== 'undefined' && __DOCS_RUNTIME_SOURCES__[path] || hashGuidanceContent(await readFile(join(REPO_ROOT, path), "utf8")) })));

function renderChecked(file: string, content: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error(`Authoring guidance is not valid JSON: ${file}`); }
  const validated = validateDocDocument(parsed);
  if (!validated.ok) throw new Error(`Authoring guidance is structurally invalid: ${file}: ${JSON.stringify(validated.issues)}`);
  return projectToMarkdown(validated.document);
}

/** Read canonical guidance each task. No project overrides or cached corpus text. */
export async function loadGuidance(options: { docsRoot?: string } = {}): Promise<GuidanceSnapshot> {
  const docsRoot = resolve(options.docsRoot ?? join(REPO_ROOT, "docs"));
  const components = componentGuidance();
  const sources: GuidanceSource[] = [];
  const inputs = await Promise.all(AUTHORING_BUNDLES.map(async bundle => {
    const file = guidanceBundleFile(docsRoot, bundle);
    const content = await readFile(file, "utf8");
    renderChecked(file, content);
    return { path: file, status: "ok", content, bundle };
  }));
  for (const input of inputs) sources.push({
    path: `docs/${input.bundle}/doc.json`,
    sha256: hashGuidanceContent(input.content),
    kind: STANDARDS_BUNDLES.includes(input.bundle) ? "standard" : "style",
  });
  const componentReferences: Record<string, string> = {};
  for (const component of components) {
    const file = guidanceBundleFile(docsRoot, component.docsPath);
    const content = await readFile(file, "utf8");
    componentReferences[component.name] = renderChecked(file, content);
    sources.push({ path: `docs/${component.docsPath}/doc.json`, sha256: hashGuidanceContent(content), kind: "component-doc" });
  }
  for (const initial of await initialRuntimeSources) {
    const current = hashGuidanceContent(await readFile(join(REPO_ROOT, initial.path), "utf8"));
    if (current !== initial.hash && process.env.CODECAINE_DOCS_MANAGED !== "1") throw new Error(`Authoring runtime changed: ${initial.path}. Restart the Codecaine Docs service before beginning a new task.`);
    sources.push({ path: initial.path, sha256: initial.hash, kind: initial.path.endsWith("manifest.ts") ? "component-manifest" : "renderer" });
  }
  const skillPath = join(PACKAGE_ROOT, "skills/codecaine-docs/SKILL.md");
  sources.push({ path: relative(REPO_ROOT, skillPath), sha256: hashGuidanceContent(await readFile(skillPath, "utf8")), kind: "skill" });
  const text = assembleAuthoringGuidance(docsRoot, inputs);
  // Include the projection itself so a changed projection dependency cannot keep the old identity.
  const snapshotId = `sha256:${hashGuidanceContent(JSON.stringify({ version: GUIDANCE_SCHEMA_VERSION, sources, components, text, componentReferences }))}`;
  return { text, snapshotId, components, sources, componentReferences };
}

/** Render the same maintained sources into a portable Agent Skills directory. */
export async function generateSkillReferences(outputDir: string, guidance?: GuidanceSnapshot): Promise<void> {
  const snapshot = guidance ?? await loadGuidance();
  const references = join(outputDir, "references");
  await mkdir(join(references, "components"), { recursive: true });
  const stamp = `Generated from Codecaine Docs sources. Snapshot: \`${snapshot.snapshotId}\`. Refresh the installation to regenerate these files.\n\n`;
  const catalog = renderComponentCatalog(snapshot.components).replace(/^Details: (.+)$/gm, (_match, docsPath: string) => {
    const component = snapshot.components.find(item => item.docsPath === docsPath)!;
    return `Details: [${component.name}](components/${component.name}.md). Canonical document: \`${docsPath}\`.`;
  });
  await Promise.all([
    writeFile(join(references, "standards.md"), `# Docs Authoring Guidance\n\n${stamp}${snapshot.text}\n`),
    writeFile(join(references, "components.md"), `# Component Selection\n\n${stamp}${catalog}\n`),
    ...snapshot.components.map(component => writeFile(join(references, "components", `${component.name}.md`),
      `# ${component.name}\n\n${stamp}${component.whenToUse}\n\nExample: ${component.example}\n\nCanonical document: \`${component.docsPath}\`.\n\n${snapshot.componentReferences[component.name]}\n`)),
    writeFile(join(outputDir, "snapshot.json"), JSON.stringify({ schemaVersion: GUIDANCE_SCHEMA_VERSION, snapshotId: snapshot.snapshotId, sources: snapshot.sources }, null, 2) + "\n"),
  ]);
}
