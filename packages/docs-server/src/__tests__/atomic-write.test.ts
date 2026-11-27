import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { atomicWriteFile } from "../atomic-write";

describe("atomicWriteFile", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "spectre-atomic-write-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test.each([
    ["writes the exact content and it is readable back", async () => {
      const target = join(root, "file.txt");
      const content = "hello atomic world\nwith multiple lines\n";

      await atomicWriteFile(target, content);

      const readBack = await readFile(target, "utf8");
      expect(readBack).toBe(content);
    }],
    ["overwrites an existing file fully with no leftover trailing bytes", async () => {
      const target = join(root, "overwrite.txt");
      const longerContent = "a".repeat(500) + "\nthis is a much longer previous version\n";
      const shorterContent = "short";

      await atomicWriteFile(target, longerContent);
      await atomicWriteFile(target, shorterContent);

      const readBack = await readFile(target, "utf8");
      expect(readBack).toBe(shorterContent);
      expect(readBack.length).toBe(shorterContent.length);
    }],
    ["creates missing parent directories", async () => {
      const target = join(root, "deep", "nested", "dirs", "file.txt");
      const content = "nested content";

      await atomicWriteFile(target, content);

      const readBack = await readFile(target, "utf8");
      expect(readBack).toBe(content);
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

  test("leaves the existing entry and no temp file behind when the rename fails", async () => {
    // A directory at the target path makes the rename fail after the temp file is written.
    const target = join(root, "doc.json");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "original", "utf8");

    await expect(atomicWriteFile(target, "replacement")).rejects.toMatchObject({ code: "EISDIR" });

    expect(await readdir(root)).toEqual(["doc.json"]);
    expect(await readdir(target)).toEqual(["keep.txt"]);
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("original");
  });
});
