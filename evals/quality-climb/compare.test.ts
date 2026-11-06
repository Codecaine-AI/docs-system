import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareRounds, laneRegions } from "./compare";
import { fileUrl, pngSize, renderHtml } from "./images";
import type { PageBlock } from "./render";

const block = (id: string, type: string): PageBlock => ({ id, type, group: "rich-text", text: "" });

test("lane regions keep only the lane's blocks, and merge blocks that nest or sit close", () => {
  const blocks = [block("p1", "paragraph"), block("li", "list-item"), block("li-a", "list-item"), block("code", "code"), block("p2", "paragraph"), block("far", "callout")];
  const boxes = {
    p1: { x: 40, y: 100, width: 600, height: 40 }, li: { x: 40, y: 150, width: 600, height: 80 }, "li-a": { x: 60, y: 190, width: 580, height: 30 },
    code: { x: 40, y: 240, width: 600, height: 200 }, p2: { x: 40, y: 450, width: 600, height: 40 }, far: { x: 40, y: 900, width: 600, height: 60 },
  };
  expect(laneRegions(blocks, boxes, "rich-text", { width: 991, height: 950 })).toEqual([
    { ids: ["p1", "li", "li-a"], box: { x: 24, y: 84, width: 632, height: 162 } },
    { ids: ["p2"], box: { x: 24, y: 434, width: 632, height: 72 } },
    { ids: ["far"], box: { x: 24, y: 884, width: 632, height: 66 } },
  ]);
  expect(laneRegions(blocks, boxes, "code", { width: 991, height: 950 }).map((r) => r.ids)).toEqual([["code"]]);
});

/** A round dir with one climb page and one held-out page, each a white PNG with one `color` state-shape block. */
async function round(root: string, name: string, color: string) {
  for (const set of ["climb", "held-out"]) {
    const dir = join(root, name, set, "01-page");
    await mkdir(dir, { recursive: true });
    await renderHtml([{ html: `<body style="margin:0;background:#fff"><div style="height:600px"><div style="position:absolute;left:100px;top:200px;width:300px;height:100px;background:${color}"></div></div></body>`, png: join(dir, "page.png"), width: 500 }]);
    await writeFile(join(dir, "blocks.json"), JSON.stringify([block("shape", "state-shape")]));
    await writeFile(join(dir, "boxes.json"), JSON.stringify({ shape: { x: 100, y: 200, width: 300, height: 100 } }));
    await writeFile(join(dir, "page.json"), JSON.stringify({ briefId: 1, slug: "page", set, local: name === "round-2" }));
  }
  return join(root, name);
}

/** The color of one pixel of a PNG, read back through the browser. */
async function pixel(png: string, x: number, y: number): Promise<number[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(fileUrl(png));
    return await page.evaluate(async ([px, py]) => {
      const img = document.querySelector("img")!;
      await img.decode();
      const canvas = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(px!, py!, 1, 1).data.slice(0, 3)];
    }, [x, y]);
  } finally {
    await browser.close();
  }
}

test("compare puts the before crop on the left and the after crop on the right, for climb pages only, with each side's provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-compare-"));
  const before = await round(root, "round-1", "rgb(255,0,0)");
  const after = await round(root, "round-2", "rgb(0,0,255)");
  const out = join(root, "out");
  const manifest = await compareRounds("state-shape", before, after, out);
  expect(manifest).toEqual({ lane: "state-shape", set: "climb", before: "round-1", after: "round-2", pages: [{
    page: "01-page", image: "01-page.png", regions: 1,
    provenance: { before: { briefId: 1, slug: "page", set: "climb", local: false }, after: { briefId: 1, slug: "page", set: "climb", local: true } },
  }], full: "full-01-page.png" });
  // Each crop is the 300 x 100 block with 16 px of page around it, and the 332 px columns sit 24 px apart after 16 px of padding.
  expect((await pngSize(join(out, "01-page.png"))).width).toBe(332 + 332 + 24 + 32);
  const { height } = await pngSize(join(out, "01-page.png"));
  const row = height - 16 - 16 - 50;
  expect(await pixel(join(out, "01-page.png"), 16 + 166, row)).toEqual([255, 0, 0]);
  expect(await pixel(join(out, "01-page.png"), 16 + 332 + 24 + 166, row)).toEqual([0, 0, 255]);
  expect((await pngSize(join(out, "full-01-page.png"))).width).toBe(250 + 250 + 24 + 32);
});
