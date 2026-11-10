import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { componentGuidance } from "../../docs-model/src/authoring-guidance";
import { GUIDANCE_TOPICS, componentReferenceText, loadGuidance, setServedTextHook } from "./guidance";
import { PINNED_SHA256, SCENARIOS, SKILL_ROOT, guidanceManifest, type ManifestUnit } from "./guidance-manifest";
import { createInteractionService } from "./service";
import pkg from "../package.json";

const manifest = await guidanceManifest();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
/** A file's lines without the empty string after its last newline. */
const fileLines = (text: string) => { const lines = text.split("\n"); return lines.at(-1) === "" ? lines.slice(0, -1) : lines; };

/** SKILL.md and every file under references/, read from disk. */
async function skillFiles(): Promise<Record<string, string>> {
  const files = ["SKILL.md", ...await Array.fromAsync(new Bun.Glob("references/**/*").scan({ cwd: SKILL_ROOT, onlyFiles: true }))].sort();
  return Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(join(SKILL_ROOT, file), "utf8")] as const)));
}

/** Every way the units fail to cover the files: a file with no pin or a changed sha256, a non-blank line in no unit or in two, and a unit whose text is not its lines. */
function lineSpanFindings(files: Record<string, string>, units: readonly ManifestUnit[], pins: Readonly<Record<string, string>>): string[] {
  const findings: string[] = [];
  for (const file of new Set([...Object.keys(files), ...Object.keys(pins)])) {
    const text = files[file];
    if (text === undefined) { findings.push(`${file}: pinned but missing`); continue; }
    if (sha256(text) !== pins[file]) findings.push(`${file}: sha256 ${sha256(text)} is not the pinned ${pins[file] ?? "(none)"}`);
    const lines = fileLines(text);
    const owners = lines.map(() => [] as string[]);
    for (const unit of units.filter(unit => unit.file === file)) {
      const [first, last] = unit.lines;
      if (first < 1 || last > lines.length || first > last) { findings.push(`${unit.id}: lines ${first}-${last} are outside ${file} (${lines.length} lines)`); continue; }
      for (let line = first; line <= last; line++) owners[line - 1]!.push(unit.id);
      if (unit.text !== lines.slice(first - 1, last).join("\n")) findings.push(`${unit.id}: text differs from ${file}:${first}-${last}`);
      if (unit.kind === "generated" && (first !== 1 || last !== lines.length)) findings.push(`${unit.id}: a generated unit spans the whole file`);
    }
    lines.forEach((line, index) => {
      if (line.trim() !== "" && owners[index]!.length === 0) findings.push(`${file}:${index + 1} is in no unit`);
      if (owners[index]!.length > 1) findings.push(`${file}:${index + 1} is in ${owners[index]!.join(" and ")}`);
    });
  }
  return findings;
}

describe("coverage", () => {
  test("every unit has a destination topic, a component reference or a named drop", () => {
    const components = new Set(componentGuidance().map(component => component.name));
    const findings = manifest.flatMap(unit => {
      const { destination } = unit;
      if ("topic" in destination) return GUIDANCE_TOPICS.includes(destination.topic) ? [] : [`${unit.id}: unknown topic ${destination.topic}`];
      if ("component" in destination) return components.has(destination.component) ? [] : [`${unit.id}: unknown component ${destination.component}`];
      return destination.drop === "instruments" && destination.reason.trim() !== "" ? [] : [`${unit.id}: a drop names instruments and a reason`];
    });
    expect(findings).toEqual([]);
    expect(new Set(manifest.map(unit => unit.id)).size).toBe(manifest.length);
    expect(manifest.filter(unit => !(unit.scenario in SCENARIOS)).map(unit => unit.id)).toEqual([]);
    // Prose is proved by its anchors. A generated unit is proved by its whole text.
    expect(manifest.filter(unit => (unit.kind === "generated") !== (unit.anchors.length === 0)).map(unit => unit.id)).toEqual([]);
  });

  test("every non-blank line of SKILL.md and of each references/ file sits in one unit, and each file keeps its pinned sha256", async () => {
    expect(lineSpanFindings(await skillFiles(), manifest, PINNED_SHA256)).toEqual([]);
  });

  test("the line-span check fails on an uncovered line, a changed file and a file with no pin", async () => {
    const files = await skillFiles();
    const dropped = manifest.find(unit => unit.id === "skill.html.scripts")!;
    expect(lineSpanFindings(files, manifest.filter(unit => unit !== dropped), PINNED_SHA256)).toEqual([`SKILL.md:${dropped.lines[0]} is in no unit`]);
    expect(lineSpanFindings({ ...files, "SKILL.md": `${files["SKILL.md"]}\n` }, manifest, PINNED_SHA256)[0]).toStartWith("SKILL.md: sha256 ");
    expect(lineSpanFindings({ ...files, "references/new.md": "# New\n" }, manifest, PINNED_SHA256)).toEqual([
      `references/new.md: sha256 ${sha256("# New\n")} is not the pinned (none)`,
      "references/new.md:1 is in no unit",
    ]);
  });
});

const STYLE_GATE = 'Read the style guide before your first edit: call docs_guidance with task_id and topic "style". Required once per task.';
const page: DocDocument = {
  schemaVersion: 1, id: "page", title: "Page", root: "root",
  blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["body"] }, body: { id: "body", type: "paragraph", props: {}, children: [], text: [{ insert: "Original." }] } },
};
/** A workspace whose members.json lists one docs project per name. */
async function workspaceWith(names: string[]) {
  const root = await mkdtemp(join(tmpdir(), "codecaine-capabilities-"));
  await writeFile(join(root, "members.json"), JSON.stringify(names.map(dir => ({ dir }))));
  for (const name of names) {
    await mkdir(join(root, name, "docs/page"), { recursive: true });
    await writeFile(join(root, name, "docs/page/doc.json"), serializeDocDocument(page));
  }
  return root;
}
const INDEX_FIELDS = ["ok", "protocol_version", "server_version", "tool_contract_hash", "guidance_snapshot", "scope", "guidance_tool", "entry_tool", "completion_tools", "operations", "topics", "discovery_tools", "projects", "warnings", "next_cursor", "call_id"];

describe("docs_capabilities", () => {
  let service: ReturnType<typeof createInteractionService>;
  let workspace: string;
  beforeAll(async () => { service = createInteractionService({ judgmentEngine: null }); workspace = await workspaceWith(["alpha", "beta"]); });
  afterAll(async () => { await Bun.sleep(30); service.close(); await rm(workspace, { recursive: true, force: true }); });
  const call = async (name: string, args: Record<string, unknown> = {}, cwd = workspace) => (await service.call(cwd, name, args)).structuredContent as Record<string, any>;

  test("returns the index fields, each topic with its size and gate, and the projects of the workspace", async () => {
    const result = await service.call(tmpdir(), "docs_capabilities", { workspace });
    const { workspace: resolved } = await service.discover(workspace);
    const index = result.structuredContent as Record<string, any>;
    expect(Object.keys(index)).toEqual(INDEX_FIELDS);
    expect(Buffer.byteLength(result.content[0]!.text as string)).toBeLessThanOrEqual(4096);
    const names = service.listTools().map(tool => tool.name);
    expect(index).toMatchObject({
      protocol_version: "1", server_version: pkg.version, guidance_snapshot: (await loadGuidance()).snapshotId, scope: { workspace: resolved },
      guidance_tool: "docs_guidance", entry_tool: "docs_begin", completion_tools: ["docs_check"], warnings: [], next_cursor: null,
    });
    expect(index.tool_contract_hash).toBe(`sha256:${sha256(JSON.stringify(service.listTools()))}`);
    expect([...index.operations, ...index.discovery_tools.map((tool: any) => tool.name)].filter(name => !names.includes(name))).toEqual([]);
    expect(index.discovery_tools.map((tool: any) => tool.name)).toEqual(["docs_tree", "docs_search"]);
    expect(index.topics.map((topic: any) => topic.id)).toEqual([...GUIDANCE_TOPICS]);
    const discovered = (await service.discover(workspace)).projects.map(({ id, name }) => ({ id, name }));
    expect(index.projects).toEqual(discovered);
    // Every other tool accepts a project id that the index returned.
    expect((await call("docs_read", { project: index.projects[0].id, path: "page" })).ok).toBe(true);
    const style = index.topics[0];
    expect(style.bytes).toBe(Buffer.byteLength((await call("docs_guidance", { topic: "style" })).guidance));
    expect(index.topics.slice(1).map((topic: any) => topic.required_for)).toEqual(index.topics.slice(1).map(() => []));
    expect(style.required_for).toEqual(expect.arrayContaining(["docs_write_text", "docs_apply_ops", "docs_insert"]));
  });

  test("required_for lists exactly the writes the service refuses until the task reads the topic", async () => {
    const { topics, projects } = await call("docs_capabilities");
    const { task_id } = await call("docs_begin");
    const gated: string[] = [];
    for (const { name } of service.listTools()) {
      if (["docs_discover", "docs_capabilities", "docs_begin", "docs_guidance", "docs_end"].includes(name)) continue;
      if ((await call(name, { task_id, project: projects[0].id, path: "page" })).detail === STYLE_GATE) gated.push(name);
    }
    expect(gated.sort()).toEqual([...topics[0].required_for].sort());
  });

  test("a workspace with many projects pages the index within 4,096 bytes per page", async () => {
    const many = await workspaceWith(Array.from({ length: 60 }, (_, i) => `project-with-a-longer-name-${String(i).padStart(2, "0")}`));
    try {
      const pages: Record<string, any>[] = [];
      let cursor: string | undefined;
      do {
        const result = await service.call(many, "docs_capabilities", cursor === undefined ? {} : { cursor });
        expect(Buffer.byteLength(result.content[0]!.text as string)).toBeLessThanOrEqual(4096);
        const index = result.structuredContent as Record<string, any>;
        expect(Object.keys(index)).toEqual(INDEX_FIELDS);
        pages.push(index);
        cursor = index.next_cursor ?? undefined;
      } while (cursor !== undefined);
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.flatMap(index => index.topics).map((topic: any) => topic.id)).toEqual([...GUIDANCE_TOPICS]);
      expect(pages.flatMap(index => index.projects)).toEqual((await service.discover(many)).projects.map(({ id, name }) => ({ id, name })));
      expect(await call("docs_capabilities", { cursor: "-1" }, many)).toMatchObject({ ok: false, detail: expect.stringContaining("Unknown cursor") });
    } finally { await rm(many, { recursive: true, force: true }); }
  });
});

/** A generated line in the form the served text holds it: no indent, no install-specific file path, and the catalog's Details line as the served catalog writes it. */
const servedForm = (line: string) => line.trim().replace(/ file="[^"]*"/g, "").replace(/^Details: \[[^\]]+\]\(components\/[^)]+\.md\)\. Canonical document: `([^`]+)`\.$/, "Details: $1");
/** The non-blank lines of a generated file after the generator's title and snapshot stamp, which no topic serves. */
const generatedBody = (text: string) => text.split("\n").slice(4).filter(line => line.trim() !== "");
type Observed = { tools: ReadonlySet<string>; refusal: string };

/** Every way the served text fails to keep a unit. A generated unit needs each of its lines. A prose unit needs each anchor. Recorded behavior needs its tools listed and named, and its exact refusal. */
function contractFindings(unit: ManifestUnit, served: string, observed: Observed): string[] {
  const findings: string[] = [];
  if (unit.kind === "generated") {
    const lines = new Set(served.split("\n").map(servedForm));
    const missing = generatedBody(unit.text).filter(line => !lines.has(servedForm(line)));
    if (missing.length) findings.push(`${unit.id}: the served text lacks ${missing.length} lines, first "${missing[0]!.trim()}"`);
  }
  for (const anchor of unit.anchors) if (!served.includes(anchor)) findings.push(`${unit.id}: the served text lacks "${anchor}"`);
  for (const tool of unit.behavior?.tools ?? []) {
    if (!observed.tools.has(tool)) findings.push(`${unit.id}: ${tool} is not in tools/list`);
    if (!served.includes(tool)) findings.push(`${unit.id}: the served text does not name ${tool}`);
  }
  if (unit.behavior?.refusal !== undefined && unit.behavior.refusal !== observed.refusal) findings.push(`${unit.id}: the service refuses with "${observed.refusal}"`);
  return findings;
}

/** The test hook body: the served text without the unit's lines and anchor phrases. */
const strip = (unit: ManifestUnit) => (text: string) => {
  const lines = new Set(unit.kind === "generated" ? generatedBody(unit.text).map(servedForm) : unit.text.split("\n").filter(line => line.trim() !== "").map(servedForm));
  let out = text.split("\n").filter(line => !lines.has(servedForm(line))).join("\n");
  for (const anchor of unit.anchors) while (out.includes(anchor)) out = out.replaceAll(anchor, "");
  return out;
};

describe("manifest contract", () => {
  let service: ReturnType<typeof createInteractionService>;
  let workspace: string;
  let task_id: string;
  let observed: Observed;
  const call = async (name: string, args: Record<string, unknown> = {}) => (await service.call(workspace, name, args)).structuredContent as Record<string, any>;
  /** The text docs_guidance serves for the unit's destination, from the task's pinned snapshot. A drop has none here: agent-config's instruments test owns it. */
  async function servedFor(unit: ManifestUnit): Promise<string | undefined> {
    const { destination } = unit;
    if ("topic" in destination) return (await call("docs_guidance", { task_id, topic: destination.topic })).guidance;
    if ("component" in destination) {
      const { component, reference } = await call("docs_guidance", { task_id, component: destination.component });
      return componentReferenceText(component, reference);
    }
    return undefined;
  }
  beforeAll(async () => {
    service = createInteractionService({ judgmentEngine: null });
    workspace = await workspaceWith(["alpha"]);
    const { projects } = await call("docs_capabilities");
    ({ task_id } = await call("docs_begin"));
    // A content write in a task that has not read topic style records the refusal text.
    const fresh = await call("docs_begin");
    const read = await call("docs_read", { project: projects[0].id, path: "page" });
    const refused = await call("docs_write_text", { task_id: fresh.task_id, project: projects[0].id, path: "page", blockId: "body", expected_hash: read.hash, markdown: "Refused." });
    observed = { tools: new Set(service.listTools().map(tool => tool.name)), refusal: refused.detail };
  });
  afterAll(async () => { setServedTextHook(); await Bun.sleep(30); service.close(); await rm(workspace, { recursive: true, force: true }); });

  test("each unit's served topic keeps its anchors, its lines and its recorded behavior, with no network call", async () => {
    const findings: string[] = [];
    for (const unit of manifest) {
      const served = await servedFor(unit);
      if (served !== undefined) findings.push(...contractFindings(unit, served, observed));
    }
    expect(findings).toEqual([]);
  });

  test("stripping one unit from the served topic fails that unit's contract, and the manifest stays unchanged", async () => {
    const before = JSON.stringify(manifest);
    const survivors: string[] = [];
    try {
      for (const unit of manifest.filter(unit => !("drop" in unit.destination))) {
        setServedTextHook(strip(unit));
        if (contractFindings(unit, (await servedFor(unit))!, observed).length === 0) survivors.push(unit.id);
      }
    } finally { setServedTextHook(); }
    expect(survivors).toEqual([]);
    expect(JSON.stringify(manifest)).toBe(before);
    expect(JSON.stringify(await guidanceManifest())).toBe(before);
  });
});
