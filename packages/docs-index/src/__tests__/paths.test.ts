import { describe, expect, test } from "bun:test";
import { isSafeRelativePath } from "../paths";

describe("isSafeRelativePath", () => {
  test("accepts normal docs-relative paths", () => {
    expect(isSafeRelativePath("00-foundation/00-overview")).toBe(true);
    expect(isSafeRelativePath("a/b/doc.json")).toBe(true);
  });

  test("rejects traversal, absolute, empty and doubled separators", () => {
    expect(isSafeRelativePath("../etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a/../../b")).toBe(false);
    expect(isSafeRelativePath("/abs/path")).toBe(false);
    expect(isSafeRelativePath("\\\\server\\share")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("a//b")).toBe(false);
  });

  test("rejects null bytes anywhere in the path", () => {
    expect(isSafeRelativePath("a\0b")).toBe(false);
    expect(isSafeRelativePath("a/b\0.json")).toBe(false);
    expect(isSafeRelativePath("\0")).toBe(false);
  });
});
