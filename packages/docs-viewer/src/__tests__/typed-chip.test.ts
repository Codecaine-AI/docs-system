import { describe, expect, it } from "bun:test";
import { chipKind, type ChipKind } from "../components/typed-chip";
import { chipPieces } from "../components/mono-breaks";

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
  // strings: quoted (VS Code string color, like paths)
  ['"info"', "string"],
  ["'decision'", "string"],
  // literals: numbers with units
  ["16px", "literal"],
  ["0.85", "literal"],
  // keyword literals (VS Code keyword blue)
  ["true", "keyword"],
  ["null", "keyword"],
  // props / keys: lowercase names, dotted key paths, custom properties
  ["kind", "prop"],
  ["props.level", "prop"],
  ["carriesText", "prop"],
  ["allow_scripts", "prop"],
  ["--docs-chip-bg", "prop"],
  ["--docs-kind-*", "prop"],
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

describe("chipPieces", () => {
  it.each([
    // a word of 32 characters or fewer never breaks, even at an underscore or a slash
    ["--docs-kind-*", ["--docs-kind-*"]],
    ["editor.setContent", ["editor.setContent"]],
    ["block-layout.ts", ["block-layout.ts"]],
    ["CODECAINE_DOCS_STATE_DIR", ["CODECAINE_DOCS_STATE_DIR"]],
    ["agent-kernel-viewer-core", ["agent-kernel-viewer-core"]],
    ["../canvas/packages/text-measure", ["../canvas/packages/text-measure"]],
    // a spaced chip breaks only at its spaces
    ["docs-cli code-theme import", ["docs-cli", " ", "code-theme", " ", "import"]],
    // a longer path breaks only after its slashes, never inside a hyphenated folder name
    ["packages/docs-viewer/src/render/block-layout.ts", ["packages/", "docs-viewer/", "src/", "render/", "block-layout.ts"]],
    // any other longer word breaks after `.` or `-`; leading hyphens stay attached, and a piece of 3 or fewer joins the one before
    ["--docs-code-annotation-accent-color-dark", ["--docs-", "code-", "annotation-", "accent-", "color-", "dark"]],
    ["SOME_VERY_LONG_ENVIRONMENT_VARIABLE_NAME", ["SOME_VERY_LONG_ENVIRONMENT_VARIABLE_NAME"]],
    ["DocsChangeEvent", ["DocsChangeEvent"]],
    ["./foo", ["./foo"]],
  ])("%p cuts into %p", (text, pieces) => {
    expect(chipPieces(text)).toEqual(pieces);
  });
});
