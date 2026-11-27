import { describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docsRootExclude, isExcludedUnderDocsRoot, isSafeRelativePath, resolveDocBundleJsonPath, setDocsRootExclude } from "../paths";

describe("isSafeRelativePath", () => {
  test.each([
    ["accepts normal docs-relative paths", () => {
      expect(isSafeRelativePath("00-foundation/00-overview")).toBe(true);
      expect(isSafeRelativePath("a/b/doc.json")).toBe(true);
    }],
    ["rejects null bytes anywhere in the path", () => {
      expect(isSafeRelativePath("a\0b")).toBe(false);
      expect(isSafeRelativePath("a/b\0.json")).toBe(false);
      expect(isSafeRelativePath("\0")).toBe(false);
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

  test("rejects traversal, absolute, empty and doubled separators", () => {
    expect(isSafeRelativePath("../etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a/../../b")).toBe(false);
    expect(isSafeRelativePath("/abs/path")).toBe(false);
    expect(isSafeRelativePath("\\\\server\\share")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("a//b")).toBe(false);
  });
});

describe("docs-root exclude registry", () => {
  test("resolveDocBundleJsonPath refuses excluded bundles of a registered root only", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "docs-paths-exclude-")));
    try {
      const frozen = "sessions/s1/outputs/inputs/spec-pages/p1";
      expect(resolveDocBundleJsonPath(root, frozen)).toBe(join(root, frozen, "doc.json"));
      setDocsRootExclude(root, ["sessions/*/outputs/inputs/**"]);
      expect(docsRootExclude(root)).toEqual(["sessions/*/outputs/inputs/**"]);
      expect(isExcludedUnderDocsRoot(root, frozen)).toBe(true);
      expect(resolveDocBundleJsonPath(root, frozen)).toBeNull();
      expect(resolveDocBundleJsonPath(root, `${frozen}/doc.json`)).toBeNull();
      expect(resolveDocBundleJsonPath(root, "notes/seed")).toBe(join(root, "notes/seed", "doc.json"));
      setDocsRootExclude(root, []);
      expect(docsRootExclude(root)).toEqual([]);
      expect(resolveDocBundleJsonPath(root, frozen)).toBe(join(root, frozen, "doc.json"));
    } finally {
      setDocsRootExclude(root, undefined);
      await rm(root, { recursive: true, force: true });
    }
  });
});
