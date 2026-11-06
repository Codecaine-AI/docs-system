import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pngSize, renderHtml, tilePng } from "./images";

test("a tall PNG splits into tiles under the pixel limit that cover every row, and a small one stays whole", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qc-tiles-"));
  const png = join(dir, "tall.png");
  await renderHtml([{ html: '<body style="margin:0"><div style="width:100px;height:2500px;background:linear-gradient(red,blue)"></div></body>', png, width: 100 }]);
  expect(await pngSize(png)).toEqual({ width: 100, height: 2500 });
  const tiles = await tilePng(png, join(dir, "tiles"), 100_000, 32);
  const sizes = await Promise.all(tiles.map(pngSize));
  // 1000 rows fit under 100 000 pixels: tiles start every 968 rows and repeat 32 rows across each cut.
  expect(sizes).toEqual([{ width: 100, height: 1000 }, { width: 100, height: 1000 }, { width: 100, height: 564 }]);
  expect(await tilePng(png, join(dir, "whole"), 250_000)).toEqual([png]);
});
