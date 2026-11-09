import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { componentGuidance } from "../../docs-model/src/authoring-guidance";
import { GUIDANCE_TOPICS } from "./guidance";
import { PINNED_SHA256, SCENARIOS, SKILL_ROOT, guidanceManifest, type ManifestUnit } from "./guidance-manifest";

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
