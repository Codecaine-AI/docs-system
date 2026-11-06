import { expect, test } from "bun:test";
import { existsSync, readlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import briefs from "./briefs.json";
import type { Brief } from "./schema";
import { REPO, copyWrittenPage, pagePath } from "./write";

const brief = (briefs as Brief[])[0]!;

test("a frozen page copies the written corpus and metrics, points themes at this checkout, and leaves the render to redo", async () => {
  const root = await mkdtemp(join(tmpdir(), "qc-frozen-"));
  const from = join(root, "old");
  await mkdir(join(pagePath(from, brief), ".."), { recursive: true });
  await writeFile(pagePath(from, brief), '{"page":1}');
  await symlink("/old/checkout/themes", join(from, "corpus/themes"));
  await writeFile(join(from, "metrics.json"), '{"briefId":1}');
  await writeFile(join(from, "page.png"), "old render");
  const to = join(root, "new");
  await mkdir(to);
  await copyWrittenPage(brief, from, to);
  expect(await readFile(pagePath(to, brief), "utf8")).toBe('{"page":1}');
  expect(readlinkSync(join(to, "corpus/themes"))).toBe(join(REPO, "themes"));
  expect(await readFile(join(to, "metrics.json"), "utf8")).toBe('{"briefId":1}');
  expect(existsSync(join(to, "page.png"))).toBe(false);
});

test("a page whose write did not finish is refused", async () => {
  const from = await mkdtemp(join(tmpdir(), "qc-frozen-"));
  await mkdir(join(pagePath(from, brief), ".."), { recursive: true });
  await writeFile(pagePath(from, brief), "{}");
  await expect(copyWrittenPage(brief, from, await mkdtemp(join(tmpdir(), "qc-frozen-to-")))).rejects.toThrow(`No finished page for brief ${brief.id}`);
});
