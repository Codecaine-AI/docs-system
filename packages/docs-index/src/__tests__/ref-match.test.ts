import { describe, expect, test } from "bun:test";
import {
  candidateStoredForms,
  normalizeDocRefPath,
  rewriteDocRefPath,
  sameDocRef,
} from "../ref-match";

describe("normalizeDocRefPath", () => {
  test.each([
    ["strips docs/ prefix and .md/.mdx extension", () => {
      expect(normalizeDocRefPath("docs/00-foundation/10-purpose.md")).toBe(
        "00-foundation/10-purpose",
      );
      expect(normalizeDocRefPath("docs/00-foundation/10-purpose.mdx")).toBe(
        "00-foundation/10-purpose",
      );
    }],
    ["strips docs/ prefix only (no extension present)", () => {
      expect(normalizeDocRefPath("docs/00-foundation/10-purpose")).toBe(
        "00-foundation/10-purpose",
      );
    }],
    ["strips a trailing /doc.json bundle suffix", () => {
      expect(normalizeDocRefPath("docs/00-foundation/10-purpose/doc.json")).toBe(
        "00-foundation/10-purpose",
      );
      expect(normalizeDocRefPath("00-foundation/10-purpose/doc.json")).toBe(
        "00-foundation/10-purpose",
      );
    }],
    ["is idempotent on already-canonical paths", () => {
      expect(normalizeDocRefPath("00-foundation/10-purpose")).toBe("00-foundation/10-purpose");
    }],
    ["normalizes backslashes", () => {
      expect(normalizeDocRefPath("docs\\00-foundation\\10-purpose.md")).toBe(
        "00-foundation/10-purpose",
      );
    }],
    ["trims a trailing slash on a bare bundle folder form", () => {
      expect(normalizeDocRefPath("docs/00-foundation/10-purpose/")).toBe(
        "00-foundation/10-purpose",
      );
    }],
    ["collapses a trailing legacy 00-overview segment after normalizing its stored form", () => {
      const forms = [
        "10-system-design/00-overview",
        "docs/10-system-design/00-overview",
        "docs/10-system-design/00-overview.md",
        "docs/10-system-design/00-overview.mdx",
        "docs/10-system-design/00-overview/doc.json",
        "10-system-design/00-overview/",
      ];

      for (const form of forms) {
        expect(normalizeDocRefPath(form)).toBe("10-system-design");
      }
    }],
    ["only collapses trailing 00-overview segments that have a parent", () => {
      expect(normalizeDocRefPath("a/b/00-overview")).toBe("a/b");
      expect(normalizeDocRefPath("a/00-overview/b")).toBe("a/00-overview/b");
      expect(normalizeDocRefPath("a/00-Overview")).toBe("a/00-Overview");
      expect(normalizeDocRefPath("00-overview")).toBe("00-overview");
      expect(normalizeDocRefPath("/00-overview")).toBe("/00-overview");
    }],
    ["repeatedly collapses trailing 00-overview segments and remains idempotent", () => {
      const normalized = normalizeDocRefPath("a/00-overview/00-overview");
      expect(normalized).toBe("a");
      expect(normalizeDocRefPath(normalized)).toBe(normalized);
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("sameDocRef", () => {
  test.each([
    ["matches across every accepted on-disk form", () => {
      const canonical = "00-foundation/10-purpose";
      const forms = [
        "docs/00-foundation/10-purpose.md",
        "docs/00-foundation/10-purpose.mdx",
        "00-foundation/10-purpose.md",
        "docs/00-foundation/10-purpose/doc.json",
        "docs/00-foundation/10-purpose",
        "00-foundation/10-purpose",
      ];
      for (const form of forms) {
        expect(sameDocRef(form, canonical)).toBe(true);
        expect(sameDocRef(canonical, form)).toBe(true);
      }
    }],
    ["does not match a different bundle", () => {
      expect(sameDocRef("docs/00-foundation/10-purpose.md", "docs/00-foundation/20-principles.md")).toBe(
        false,
      );
    }],
    ["matches a legacy 00-overview path to its new section path", () => {
      expect(sameDocRef("docs/x/00-overview.md", "x")).toBe(true);
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("candidateStoredForms", () => {
  test("includes legacy 00-overview aliases after the canonical aliases", () => {
    const forms = candidateStoredForms("x");

    expect(forms.slice(0, 8)).toEqual([
      "x",
      "docs/x",
      "x.md",
      "docs/x.md",
      "x.mdx",
      "docs/x.mdx",
      "x/doc.json",
      "docs/x/doc.json",
    ]);
    expect(forms).toContain("x/00-overview");
    expect(forms).toContain("docs/x/00-overview.md");
    expect(forms).toContain("x/00-overview.mdx");
    expect(forms).toContain("docs/x/00-overview/doc.json");
  });
});

describe("rewriteDocRefPath", () => {
  test.each([
    ["rewrites a matching path to toPath's canonical form", () => {
      expect(
        rewriteDocRefPath(
          "docs/00-foundation/10-purpose.md",
          "docs/00-foundation/10-purpose.md",
          "docs/00-foundation/15-purpose-renamed/doc.json",
        ),
      ).toBe("00-foundation/15-purpose-renamed");
    }],
    ["is tolerant of form mismatch between the stored ref and fromPath", () => {
      // Stored ref is pre-migration .md form; fromPath passed as canonical bundle form.
      expect(
        rewriteDocRefPath(
          "docs/00-foundation/10-purpose.md",
          "00-foundation/10-purpose",
          "00-foundation/15-purpose-renamed",
        ),
      ).toBe("00-foundation/15-purpose-renamed");
    }],
    ["rewrites a stored legacy 00-overview ref when fromPath is the new section path", () => {
      expect(
        rewriteDocRefPath("docs/x/00-overview.md", "x", "renamed-x"),
      ).toBe("renamed-x");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

  test("leaves a non-matching path untouched", () => {
    expect(
      rewriteDocRefPath(
        "docs/00-foundation/20-principles.md",
        "docs/00-foundation/10-purpose.md",
        "docs/00-foundation/15-purpose-renamed/doc.json",
      ),
    ).toBe("docs/00-foundation/20-principles.md");
  });
});
