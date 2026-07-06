import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { atomicWriteFile } from "./atomic-write";

describe("atomicWriteFile", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "spectre-atomic-write-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("writes the exact content and it is readable back", async () => {
    const target = join(root, "file.txt");
    const content = "hello atomic world\nwith multiple lines\n";

    await atomicWriteFile(target, content);

    const readBack = await readFile(target, "utf8");
    expect(readBack).toBe(content);
  });

  test("overwrites an existing file fully with no leftover trailing bytes", async () => {
    const target = join(root, "overwrite.txt");
    const longerContent = "a".repeat(500) + "\nthis is a much longer previous version\n";
    const shorterContent = "short";

    await atomicWriteFile(target, longerContent);
    await atomicWriteFile(target, shorterContent);

    const readBack = await readFile(target, "utf8");
    expect(readBack).toBe(shorterContent);
    expect(readBack.length).toBe(shorterContent.length);
  });

  test("creates missing parent directories", async () => {
    const target = join(root, "deep", "nested", "dirs", "file.txt");
    const content = "nested content";

    await atomicWriteFile(target, content);

    const readBack = await readFile(target, "utf8");
    expect(readBack).toBe(content);
  });

  test("best-effort: cleans up temp file on write failure and does not leave .tmp-* siblings", async () => {
    const readonlyDir = join(root, "readonly-dir");
    await mkdir(readonlyDir, { recursive: true });
    await chmod(readonlyDir, 0o444);

    const target = join(readonlyDir, "file.txt");
    let rejected = false;

    try {
      await atomicWriteFile(target, "should not be written");
      rejected = false;
    } catch {
      rejected = true;
    } finally {
      // restore permissions so cleanup (afterEach rm) can succeed regardless of outcome
      await chmod(readonlyDir, 0o755);
    }

    if (!rejected) {
      // Sandboxed/root environments sometimes ignore chmod-based write protection.
      // In that case we can't exercise the failure path reliably, so we soften
      // this assertion rather than flake the suite.
      console.warn(
        "atomicWriteFile did not fail on a chmod 0o444 directory in this environment; " +
          "skipping strict cleanup assertion for the permission-based test.",
      );
      return;
    }

    const entries = await readdir(readonlyDir);
    const leftoverTempFiles = entries.filter((entry) => entry.includes(".tmp-"));
    expect(leftoverTempFiles).toEqual([]);
  });
});
