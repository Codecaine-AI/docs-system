// Side-by-side images of one lane's blocks before and after a change, for a lane PR body.
//   bun evals/quality-climb/compare.ts --lane <type> --before <round dir> --after <round dir> [--out <dir>]
//     [--before-label <text>] [--after-label <text>]
// For each climb page that both rounds rendered, writes <out>/<NN>-<slug>.png: the before render's lane blocks on
// the left and the after render's on the right, one labeled row per block region in reading order. The first page
// also gets full-<NN>-<slug>.png, both whole pages at half size. compare.json lists the images for assets.ts --compare.
// Held-out pages are never compared, because a PR body is builder-facing. A round dir needs boxes.json beside each
// page, so a round rendered before boxes.json existed needs a --frozen-from re-render first. Each page in compare.json
// carries the page.json provenance of its before and after folders, so assets.ts can refuse a local brief's page.
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readProvenance, type PageProvenance } from "./briefs";
import { fileUrl, pngSize, renderHtml, type Box } from "./images";
import type { PageBlock } from "./render";
import { isLane, laneBlockTypes, LANES, type Lane } from "./schema";

/** Blocks closer than this many px apart share one region. */
export const REGION_GAP = 24;
/** The margin of page kept around each region, in px. */
export const REGION_PAD = 16;

/** One part of a page PNG that holds one or more of the lane's blocks. */
export interface Region { ids: string[]; box: Box }

/**
 * The lane's blocks on a page as regions of its PNG, top to bottom. Blocks that nest or sit within REGION_GAP of
 * each other merge into one region, so a list and its items, or a run of paragraphs, show as one crop.
 */
export function laneRegions(blocks: PageBlock[], boxes: Record<string, Box>, lane: Lane, image: { width: number; height: number }): Region[] {
  const types = laneBlockTypes(lane);
  const placed = blocks.filter((b) => types.includes(b.type) && boxes[b.id]).map((b) => ({ id: b.id, box: boxes[b.id]! })).sort((a, b) => a.box.y - b.box.y);
  const regions: { ids: string[]; top: number; bottom: number; left: number; right: number }[] = [];
  for (const { id, box } of placed) {
    const last = regions.at(-1);
    if (last && box.y <= last.bottom + REGION_GAP) {
      last.ids.push(id);
      last.bottom = Math.max(last.bottom, box.y + box.height);
      last.left = Math.min(last.left, box.x);
      last.right = Math.max(last.right, box.x + box.width);
    } else regions.push({ ids: [id], top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width });
  }
  return regions.map((r) => {
    const x = Math.max(0, Math.floor(r.left - REGION_PAD));
    const y = Math.max(0, Math.floor(r.top - REGION_PAD));
    return { ids: r.ids, box: { x, y, width: Math.min(image.width, Math.ceil(r.right + REGION_PAD)) - x, height: Math.min(image.height, Math.ceil(r.bottom + REGION_PAD)) - y } };
  });
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const STYLE = `body{margin:0;background:#fff;color:#1f2328;font:14px/1.4 -apple-system,system-ui,sans-serif}
.grid{display:grid;grid-template-columns:max-content max-content;gap:12px 24px;padding:16px;width:max-content}
.head{font-weight:600;font-size:16px;padding-bottom:4px;border-bottom:2px solid #d0d7de}
.cap{font:12px ui-monospace,monospace;color:#57606a;margin-bottom:4px}
.crop{position:relative;overflow:hidden;outline:1px solid #d0d7de}
.crop img{position:absolute;display:block;max-width:none}
.none{color:#8c959f;font-style:italic;padding:8px}`;

const cropHtml = (png: string, region: Region | undefined) => region
  ? `<div><div class="cap">${escape(region.ids.join(", "))}</div><div class="crop" style="width:${region.box.width}px;height:${region.box.height}px"><img src="${fileUrl(png)}" style="left:-${region.box.x}px;top:-${region.box.y}px"></div></div>`
  : `<div class="none">No block in this row.</div>`;

const head = (labels: { before: string; after: string }) => `<div class="head">Before: ${escape(labels.before)}</div><div class="head">After: ${escape(labels.after)}</div>`;
const page = (body: string) => `<!doctype html><meta charset="utf-8"><style>${STYLE}</style><div class="grid">${body}</div>`;
/** The page width that fits two columns of these widths, with the grid's gap and padding. */
const twoColumns = (left: number, right: number) => left + right + 24 + 32;

/** The HTML of one page's pairs: a header row, then the i-th before region beside the i-th after region. */
export function pairHtml(labels: { before: string; after: string }, before: { png: string; regions: Region[] }, after: { png: string; regions: Region[] }): { html: string; width: number } {
  const rows = Math.max(before.regions.length, after.regions.length);
  const col = (regions: Region[]) => Math.max(240, ...regions.map((r) => r.box.width));
  const cells = Array.from({ length: rows }, (_, i) => cropHtml(before.png, before.regions[i]) + cropHtml(after.png, after.regions[i])).join("");
  return { html: page(head(labels) + cells), width: twoColumns(col(before.regions), col(after.regions)) };
}

export interface CompareManifest {
  lane: Lane;
  set: "climb";
  before: string;
  after: string;
  /** provenance is each side's page.json, or null when that folder recorded none. */
  pages: { page: string; image: string; regions: number; provenance: { before: PageProvenance | null; after: PageProvenance | null } }[];
  full: string | null;
}

/** Writes the side-by-side PNGs and compare.json for the climb pages both rounds rendered, and returns the manifest. */
export async function compareRounds(lane: Lane, beforeDir: string, afterDir: string, outDir: string, labels = { before: basename(beforeDir), after: basename(afterDir) }): Promise<CompareManifest> {
  const pagesOf = (round: string) => existsSync(join(round, "climb")) ? readdirSync(join(round, "climb")).filter((p) => existsSync(join(round, "climb", p, "page.png"))) : [];
  const names = pagesOf(beforeDir).filter((p) => pagesOf(afterDir).includes(p)).sort();
  if (names.length === 0) throw new Error(`No climb page is rendered in both ${beforeDir} and ${afterDir}.`);
  await mkdir(outDir, { recursive: true });
  const side = async (round: string, name: string) => {
    const dir = join(round, "climb", name);
    if (!existsSync(join(dir, "boxes.json"))) throw new Error(`${dir} has no boxes.json. Re-render the round with --frozen-from ${round} first.`);
    const png = join(dir, "page.png");
    const size = await pngSize(png);
    const blocks = JSON.parse(await readFile(join(dir, "blocks.json"), "utf8")) as PageBlock[];
    const boxes = JSON.parse(await readFile(join(dir, "boxes.json"), "utf8")) as Record<string, Box>;
    return { png, size, regions: laneRegions(blocks, boxes, lane, size), provenance: readProvenance(dir) };
  };
  const jobs: { html: string; png: string; width: number }[] = [];
  const manifest: CompareManifest = { lane, set: "climb", before: labels.before, after: labels.after, pages: [], full: null };
  for (const name of names) {
    const [before, after] = await Promise.all([side(beforeDir, name), side(afterDir, name)]);
    const image = `${name}.png`;
    jobs.push({ ...pairHtml(labels, before, after), png: join(outDir, image) });
    manifest.pages.push({ page: name, image, regions: Math.max(before.regions.length, after.regions.length), provenance: { before: before.provenance, after: after.provenance } });
    if (!manifest.full) {
      manifest.full = `full-${name}.png`;
      const half = (s: { size: { width: number } }) => Math.round(s.size.width / 2);
      const img = (s: { png: string; size: { width: number } }) => `<img src="${fileUrl(s.png)}" style="display:block;width:${half(s)}px;outline:1px solid #d0d7de">`;
      jobs.push({ html: page(head(labels) + img(before) + img(after)), png: join(outDir, manifest.full), width: twoColumns(half(before), half(after)) });
    }
  }
  await renderHtml(jobs);
  await writeFile(join(outDir, "compare.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (import.meta.main) {
  const { values: opt } = parseArgs({ options: {
    lane: { type: "string" }, before: { type: "string" }, after: { type: "string" }, out: { type: "string" },
    "before-label": { type: "string" }, "after-label": { type: "string" },
  } });
  if (!opt.lane || !isLane(opt.lane)) throw new Error(`Pass --lane, one of: ${LANES.join(", ")}.`);
  if (!opt.before || !opt.after) throw new Error("Pass --before <round dir> and --after <round dir>.");
  const before = resolve(opt.before);
  const after = resolve(opt.after);
  const labels = { before: opt["before-label"] ?? basename(before), after: opt["after-label"] ?? basename(after) };
  const out = resolve(opt.out ?? join(after, `compare-${labels.before}`));
  const manifest = await compareRounds(opt.lane, before, after, out, labels);
  console.log(`Wrote ${manifest.pages.length} page pair(s) and ${manifest.full} to ${out}`);
}
