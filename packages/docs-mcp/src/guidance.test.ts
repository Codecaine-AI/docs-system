import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadGuidance, generateSkillReferences } from "./guidance";
import { ALL_COMPONENTS } from "../../docs-model/src/components";
import { AUTHORING_BUNDLES, assembleAuthoringGuidance, componentGuidance } from "../../docs-model/src/authoring-guidance";

const temporary: string[] = [];
const corpus = resolve(import.meta.dir, "../../../docs");
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), "codecaine-guidance-")); temporary.push(path); return path; }

test("external guidance uses the shared renderer and covers every registered component", async () => {
  const snapshot = await loadGuidance();
  expect(snapshot.components.map(component => component.name)).toEqual(ALL_COMPONENTS.map(component => component.manifest.name));
  expect(snapshot.components.flatMap(component => component.ownedTypes)).toEqual(ALL_COMPONENTS.flatMap(component => component.manifest.ownedTypes));
  expect(snapshot.text).toBe(assembleAuthoringGuidance(corpus, await Promise.all(AUTHORING_BUNDLES.map(async bundle => {
    const path = join(corpus, bundle, "doc.json");
    return { path, status: "ok", content: await readFile(path, "utf8") };
  }))));
  expect(snapshot.text).toContain("State Shape");
  expect(snapshot.text).toContain("Interaction Surface");
  for (const component of snapshot.components) {
    expect(component.whenToUse.length).toBeGreaterThan(30);
    expect(component.example.length).toBeGreaterThan(20);
    expect(snapshot.componentReferences[component.name].length).toBeGreaterThan(100);
  }
  expect((await loadGuidance()).snapshotId).toBe(snapshot.snapshotId);
});

test("registered components cannot silently omit selection guidance", () => {
  expect(() => componentGuidance([{ name: "custom", ownedTypes: ["code"], description: "Custom" }])).toThrow("has no authoring guidance");
});

test("canonical edits change the next snapshot while existing snapshots remain unchanged", async () => {
  const target = join(await temp(), "docs");
  await cp(corpus, target, { recursive: true });
  const before = await loadGuidance({ docsRoot: target });
  const path = join(target, AUTHORING_BUNDLES[0]!, "doc.json");
  const document = JSON.parse(await readFile(path, "utf8"));
  document.title = "Revised Structure Standard";
  await writeFile(path, JSON.stringify(document));
  const after = await loadGuidance({ docsRoot: target });
  expect(after.snapshotId).not.toBe(before.snapshotId);
  expect(after.text).toContain("Revised Structure Standard");
  expect(before.text).not.toContain("Revised Structure Standard");
  const changed = after.sources.filter((source, index) => source.sha256 !== before.sources[index]!.sha256);
  expect(changed.map(source => source.path)).toEqual([`docs/${AUTHORING_BUNDLES[0]}/doc.json`]);
  await writeFile(path, "{}");
  await expect(loadGuidance({ docsRoot: target })).rejects.toThrow("structurally invalid");
  await rm(path);
  await expect(loadGuidance({ docsRoot: target })).rejects.toThrow();
});

test("generated references contain maintained content and one matching snapshot", async () => {
  const output = await temp();
  const snapshot = await loadGuidance();
  await generateSkillReferences(output, snapshot);
  expect(await readFile(join(output, "references/standards.md"), "utf8")).toContain(snapshot.text);
  const catalog = await readFile(join(output, "references/components.md"), "utf8");
  for (const component of snapshot.components) {
    expect(catalog).toContain(`components/${component.name}.md`);
    const reference = await readFile(join(output, "references/components", `${component.name}.md`), "utf8");
    expect(reference).toContain(snapshot.snapshotId);
    expect(reference).toContain(snapshot.componentReferences[component.name]!);
  }
  const manifest = JSON.parse(await readFile(join(output, "snapshot.json"), "utf8"));
  expect(manifest.snapshotId).toBe(snapshot.snapshotId);
  expect(manifest.sources).toEqual(snapshot.sources);
});
