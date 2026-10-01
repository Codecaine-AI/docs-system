import { describe, expect, it } from "bun:test";
import { chipKind, type ChipKind } from "../components/typed-chip";

/**
 * Typed inline code: the chip's text color says what it holds. Each row is a
 * chip a doc in this corpus actually carries, so a regression shows up as a
 * real chip changing color.
 */
const CASES: Array<[string, ChipKind]> = [
  // paths: anything with a slash, or a bare file name with a known extension
  ["components/paragraph.json", "path"],
  ["~/.local/state/codecaine-docs/themes/global/", "path"],
  ["themes/<id>/", "path"],
  ["path/", "path"],
  ["GET /api/blocks", "path"],
  ["lib.ts", "path"],
  ["doc.json", "path"],
  // calls: call expressions and verb-led camelCase names
  ["validateTreePath", "call"],
  ["readFileTreeEntries", "call"],
  ["useEffect", "call"],
  ["renderDeltaSpans()", "call"],
  ["docs.read(path)", "call"],
  ["editor.setContent", "call"],
  // types: PascalCase with lowercase letters
  ["DocBlock", "type"],
  ["CalloutDocsBlock", "type"],
  // literals: quoted strings, numbers with units, keyword literals
  ['"info"', "literal"],
  ["'decision'", "literal"],
  ["16px", "literal"],
  ["0.85", "literal"],
  ["true", "literal"],
  ["null", "literal"],
  // props / keys: lowercase names, dotted key paths, custom properties
  ["kind", "prop"],
  ["props.level", "prop"],
  ["carriesText", "prop"],
  ["allow_scripts", "prop"],
  ["--docs-chip-bg", "prop"],
  // everything else keeps the plain chip color
  ["INFO", "other"],
  ["THEME_TOKEN_REGISTRY", "other"],
  ["carriesText: true", "other"],
  ["{ light, dark }", "other"],
  ["#", "other"],
  ["docs grep '^## '", "other"],
  ["", "other"],
  ["   ", "other"],
];

describe("chipKind", () => {
  it.each(CASES)("%p reads as %p", (text, kind) => {
    expect(chipKind(text)).toBe(kind);
  });

  it("ignores surrounding whitespace", () => {
    expect(chipKind("  props.level ")).toBe("prop");
  });
});
