import { describe, expect, test } from "bun:test";
import { normalizeDocRefPath, rewriteDocRefPath, sameDocRef } from "../ref-match";

describe("normalizeDocRefPath", () => {
  test("strips docs/ prefix and .md/.mdx extension", () => {
    expect(normalizeDocRefPath("docs/00-foundation/10-purpose.md")).toBe(
      "00-foundation/10-purpose",
    );
    expect(normalizeDocRefPath("docs/00-foundation/10-purpose.mdx")).toBe(
      "00-foundation/10-purpose",
    );
  });

  test("strips docs/ prefix only (no extension present)", () => {
    expect(normalizeDocRefPath("docs/00-foundation/10-purpose")).toBe(
      "00-foundation/10-purpose",
    );
  });

  test("strips a trailing /doc.json bundle suffix", () => {
    expect(normalizeDocRefPath("docs/00-foundation/10-purpose/doc.json")).toBe(
      "00-foundation/10-purpose",
    );
    expect(normalizeDocRefPath("00-foundation/10-purpose/doc.json")).toBe(
      "00-foundation/10-purpose",
    );
  });

  test("is idempotent on already-canonical paths", () => {
    expect(normalizeDocRefPath("00-foundation/10-purpose")).toBe("00-foundation/10-purpose");
  });

  test("normalizes backslashes", () => {
    expect(normalizeDocRefPath("docs\\00-foundation\\10-purpose.md")).toBe(
      "00-foundation/10-purpose",
    );
  });

  test("trims a trailing slash on a bare bundle folder form", () => {
    expect(normalizeDocRefPath("docs/00-foundation/10-purpose/")).toBe(
      "00-foundation/10-purpose",
    );
  });
});

describe("sameDocRef", () => {
  test("matches across every accepted on-disk form", () => {
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
  });

  test("does not match a different bundle", () => {
    expect(sameDocRef("docs/00-foundation/10-purpose.md", "docs/00-foundation/20-principles.md")).toBe(
      false,
    );
  });
});

describe("rewriteDocRefPath", () => {
  test("rewrites a matching path to toPath's canonical form", () => {
    expect(
      rewriteDocRefPath(
        "docs/00-foundation/10-purpose.md",
        "docs/00-foundation/10-purpose.md",
        "docs/00-foundation/15-purpose-renamed/doc.json",
      ),
    ).toBe("00-foundation/15-purpose-renamed");
  });

  test("leaves a non-matching path untouched", () => {
    expect(
      rewriteDocRefPath(
        "docs/00-foundation/20-principles.md",
        "docs/00-foundation/10-purpose.md",
        "docs/00-foundation/15-purpose-renamed/doc.json",
      ),
    ).toBe("docs/00-foundation/20-principles.md");
  });

  test("is tolerant of form mismatch between the stored ref and fromPath", () => {
    // Stored ref is pre-migration .md form; fromPath passed as canonical bundle form.
    expect(
      rewriteDocRefPath(
        "docs/00-foundation/10-purpose.md",
        "00-foundation/10-purpose",
        "00-foundation/15-purpose-renamed",
      ),
    ).toBe("00-foundation/15-purpose-renamed");
  });
});
