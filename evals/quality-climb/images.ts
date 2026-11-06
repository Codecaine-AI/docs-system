// Image work on page renders, through the headless Chromium that render.ts already uses: tiles of a tall page
// for a judge CLI that refuses a large image, and HTML compositions such as compare.ts's before/after pairs.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** A rectangle in a page PNG, in PNG pixels. */
export interface Box { x: number; y: number; width: number; height: number }

/** Width and height from a PNG's IHDR chunk. */
export async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const head = Buffer.from(await Bun.file(path).slice(0, 24).arrayBuffer());
  if (head.toString("ascii", 1, 4) !== "PNG") throw new Error(`${path} is not a PNG.`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

export const fileUrl = (path: string) => pathToFileURL(path).href;

/**
 * Renders each job's HTML in one browser and saves a screenshot of the whole page. Each HTML file is written beside
 * its PNG and opened by file URL, so it can load other PNGs by file URL.
 */
export async function renderHtml(jobs: { html: string; png: string; width: number }[]): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      const file = job.png.replace(/\.png$/, ".html");
      await writeFile(file, job.html);
      const page = await browser.newPage({ viewport: { width: job.width, height: 200 }, deviceScaleFactor: 1, colorScheme: "light" });
      await page.goto(fileUrl(file), { waitUntil: "load" });
      await page.screenshot({ path: job.png, fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

/**
 * The PNG as tiles of at most `maxPixels` each, top to bottom, with `overlap` rows repeated across each cut so no
 * line of text is lost. A PNG within the limit is returned as it is.
 */
export async function tilePng(png: string, outDir: string, maxPixels = 4_000_000, overlap = 32): Promise<string[]> {
  const { width, height } = await pngSize(png);
  if (width * height <= maxPixels) return [png];
  const step = Math.floor(maxPixels / width) - overlap;
  if (step <= 0) throw new Error(`${png} is ${width} px wide, too wide to tile under ${maxPixels} pixels.`);
  await mkdir(outDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 200 }, deviceScaleFactor: 1 });
    const html = join(outDir, "tiles.html");
    await writeFile(html, `<!doctype html><body style="margin:0"><img src="${fileUrl(png)}" style="display:block"></body>`);
    await page.goto(fileUrl(html), { waitUntil: "load" });
    const tiles: string[] = [];
    for (let y = 0; y < height; y += step) {
      const tile = join(outDir, `tile-${tiles.length + 1}.png`);
      await page.screenshot({ path: tile, fullPage: true, clip: { x: 0, y, width, height: Math.min(step + overlap, height - y) } });
      tiles.push(tile);
      if (y + step + overlap >= height) break;
    }
    return tiles;
  } finally {
    await browser.close();
  }
}
