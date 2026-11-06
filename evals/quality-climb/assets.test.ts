import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareFolder, compareSection, publishableCompare, publishableRound } from "./assets";
import { loadBriefs, pageProvenance, readProvenance, type PageProvenance, type RoundBrief } from "./briefs";
import type { CompareManifest } from "./compare";

const recorded = (briefId: number, slug: string, local = false): { before: PageProvenance; after: PageProvenance } => {
  const p: PageProvenance = { briefId, slug, set: "climb", local };
  return { before: p, after: p };
};
const manifest: CompareManifest = {
  lane: "state-shape", set: "climb", before: "round-1", after: "round 2",
  pages: [{ page: "01-doc", image: "01-doc.png", regions: 2, provenance: recorded(1, "doc") }, { page: "03-api", image: "03-api.png", regions: 1, provenance: recorded(3, "api") }],
  full: "full-01-doc.png",
};

test("a compare run publishes under its lane and both round labels, with no unsafe path characters", () => {
  expect(compareFolder(manifest)).toBe("lanes/state-shape/round-2-vs-round-1");
});

test("a compare run never publishes a local brief's page, nor the full-page image made from it", () => {
  const brief = { id: 1, slug: "doc", set: "climb" } as RoundBrief;
  expect(publishableCompare(manifest, [brief])).toEqual(manifest);
  const kept = publishableCompare(manifest, [{ ...brief, local: true }]);
  expect(kept.pages.map((p) => p.page)).toEqual(["03-api"]);
  expect(kept.full).toBeNull();
  expect(compareSection(kept, "https://raw.example/x")).not.toContain("01-doc");
});

test("the PR section embeds every page pair and the full-page pair from the folder URL", () => {
  const section = compareSection(manifest, "https://raw.example/branch/lanes/x");
  const images = [...section.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
  expect(images).toEqual(["https://raw.example/branch/lanes/x/01-doc.png", "https://raw.example/branch/lanes/x/03-api.png", "https://raw.example/branch/lanes/x/full-01-doc.png"]);
  expect(section).toContain("**01-doc** (2 block regions)");
  expect(section).toContain("<details><summary>Full page, before and after</summary>");
});

test("with QUALITY_CLIMB_LOCAL_BRIEFS unset, a compare page whose page.json says local is still not published", () => {
  const fromLocalRound = { ...manifest, pages: [{ ...manifest.pages[0]!, provenance: { ...recorded(1, "doc"), after: { briefId: 1, slug: "doc", set: "climb", local: true } } }, manifest.pages[1]!] } as CompareManifest;
  const kept = publishableCompare(fromLocalRound, loadBriefs(""));
  expect(kept.pages.map((p) => p.page)).toEqual(["03-api"]);
  expect(kept.full).toBeNull();
});

test("a compare page with no recorded provenance is refused by name", () => {
  const old = { ...manifest, pages: [manifest.pages[0]!, { page: "03-api", image: "03-api.png", regions: 1 }] } as CompareManifest;
  expect(() => publishableCompare(old, [])).toThrow("Page 03-api has no recorded provenance (page.json)");
});

test("a round publishes a public brief's page only when its page.json says local: false, and refuses one with none", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "qc-assets-")), "round-4", "climb");
  const brief = (id: number, slug: string) => ({ id, slug, set: "climb" }) as RoundBrief;
  const page = async (name: string, local?: boolean) => {
    await mkdir(join(dir, name), { recursive: true });
    if (local !== undefined) await writeFile(join(dir, name, "page.json"), JSON.stringify({ briefId: Number(name.slice(0, 2)), slug: name.slice(3), set: "climb", local }));
  };
  await page("01-doc", false);
  await page("02-secret", true);
  await page("03-api");
  expect(publishableRound(dir, "4", "climb", [brief(1, "doc"), brief(2, "secret")])).toEqual([{ from: join(dir, "01-doc", "page.png"), to: "round-4/01-doc.png" }]);
  expect(() => publishableRound(dir, "4", "climb", [brief(1, "doc"), brief(3, "api")])).toThrow(`Page ${join(dir, "03-api")} has no recorded provenance`);
});

test("a lane round page with no page.json counts as public, and a whole-page round page with none does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-provenance-"));
  const lanePage = join(root, ".tmp/quality-climb/lanes/state-shape/round-2/climb/03-api");
  const roundPage = join(root, ".tmp/quality-climb/round-2/climb/03-api");
  await Promise.all([mkdir(lanePage, { recursive: true }), mkdir(roundPage, { recursive: true })]);
  expect(readProvenance(lanePage)).toEqual({ briefId: 3, slug: "api", set: "climb", local: false });
  expect(readProvenance(roundPage)).toBeNull();
});

test("a frozen copy keeps its source page's local provenance, though the lane brief it is copied for is public", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-provenance-frozen-"));
  const source = join(root, ".tmp/quality-climb/round-9/climb/100-docs-mcp-daily-use");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "page.json"), JSON.stringify({ briefId: 100, slug: "docs-mcp-daily-use", set: "climb", local: true }));
  const laneBrief = { id: 100, slug: "docs-mcp-daily-use", set: "climb", local: false } as unknown as RoundBrief;
  expect(pageProvenance(laneBrief, source).local).toBe(true);
  expect(pageProvenance(laneBrief).local).toBe(false);
  const bare = join(root, ".tmp/quality-climb/round-9/climb/101-bare");
  await mkdir(bare, { recursive: true });
  expect(() => pageProvenance(laneBrief, bare)).toThrow("has no recorded provenance");
});

test("a resumed page keeps the local provenance its folder recorded, though this run has no --frozen-from source", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-provenance-resume-"));
  const page = join(root, ".tmp/quality-climb/lanes/rich-text/round-3/climb/100-docs-mcp-daily-use");
  await mkdir(page, { recursive: true });
  await writeFile(join(page, "page.json"), JSON.stringify({ briefId: 100, slug: "docs-mcp-daily-use", set: "climb", local: true }));
  const laneBrief = { id: 100, slug: "docs-mcp-daily-use", set: "climb", local: false } as unknown as RoundBrief;
  expect(pageProvenance(laneBrief, undefined, page).local).toBe(true);
  await writeFile(join(page, "page.json"), "{");
  expect(() => pageProvenance(laneBrief, undefined, page)).toThrow("records no provenance");
});

test("a page.json that does not parse, or parses to null, records nothing, even in a lane round", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-provenance-bad-"));
  const lanePage = join(root, ".tmp/quality-climb/lanes/state-shape/round-2/climb/03-api");
  await mkdir(lanePage, { recursive: true });
  await writeFile(join(lanePage, "page.json"), '{"briefId": 3, "slug": "ap');
  expect(readProvenance(lanePage)).toBeNull();
  await writeFile(join(lanePage, "page.json"), "null");
  expect(readProvenance(lanePage)).toBeNull();
});
