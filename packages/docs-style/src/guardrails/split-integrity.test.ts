import { describe, expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { markdownToSpans } from "../text";
import { checkSplitIntegrity } from "./split-integrity";

/** One rewrite of one block, as inline markdown: the original, and the block it became, or a lead and its bullets. */
const split = (before: string, after: string | readonly string[]) =>
  checkSplitIntegrity({ beforeSpans: markdownToSpans(before), afterBlocks: (typeof after === "string" ? [after] : after).map((block) => markdownToSpans(block)) });

/** A reference span as a page stores it: a docs page, or a source file. */
const ref = (label: string, kind: "doc" | "source", path: string): DeltaSpan => ({ insert: label, attributes: { reference: { kind, path } } });
/** Block text from plain runs and reference spans. */
const text = (...parts: (string | DeltaSpan)[]): DeltaSpan[] => parts.map((part) => (typeof part === "string" ? { insert: part } : part));
const cited = (before: DeltaSpan[], after: DeltaSpan[]) => checkSplitIntegrity({ beforeSpans: before, afterBlocks: [after] });

const DOC_MODEL = ref("Document model", "doc", "10-system-design/20-engine/10-document-model");
const ROUTES = ref("routes.ts", "source", "packages/docs-server/src/routes.ts");
const IDENTITY = ref("Identity Model", "doc", "10-system-design/15-identity-model");

// Every case below is a real rewrite from the wave 1 and wave 2 reviews, shortened where the rest
// of the block played no part.
describe("split-integrity rejects a split that cuts a sentence's frame off one of its pieces", () => {
  test.each([
    [
      "a: the closing colon moves to a later piece",
      "Parts of the session arc are excluded for now, each with a reason and a revisit intent, not an oversight:",
      "Parts of the session arc are excluded for now. Each has a reason and a revisit intent, not an oversight:",
      'its closing colon now leads in from "Each has a reason',
    ],
    [
      "a: the closing colon is gone",
      "Agent detail is the largest response, built by `KernelCatalogService.getAgentDetail`:",
      "Agent detail is the largest response. `KernelCatalogService.getAgentDetail` builds the response.",
      "the colon that led into the next block is gone",
    ],
    [
      "c: a scope phrase over a chain of clauses",
      "Among sections, depth sorts ascending, then area sorts descending, then the schema index breaks the tie.",
      "Among sections, depth sorts ascending. Area then sorts descending. The schema index breaks the tie.",
      '"Area then sorts descending." falls outside its opening "Among sections"',
    ],
    [
      "d: the subject the author shared between two clauses",
      "A detail line sets in `detailColor` with a 1.3 line height, 3px under the name block, in Inter 400 or IBM Plex Mono 500.",
      "A detail line sets in `detailColor` with a 1.3 line height and 3px under the name block. A detail line sets in Inter 400 or IBM Plex Mono 500.",
      'the rewrite repeats "A detail line sets in"',
    ],
    [
      "e: a lowercase identifier that now opens a sentence",
      "Clearance warns below the sibling corridor floor; covered-content and unreadable-labels catch collisions.",
      "Clearance warns below the sibling corridor floor. Covered-content and unreadable-labels catch collisions.",
      '"covered-content" became "Covered-content"',
    ],
  ])("%s", (_, before, after, problem) => {
    const result = split(before, after);
    expect(result).toMatchObject({ id: "split-integrity", ok: false });
    expect(result.detail).toContain(problem);
  });

  test("b: a closing citation of a docs page now backs only the last piece", () => {
    const before = text("Nothing in the pipeline mutates the document; every mutation leaves through the reducer (", DOC_MODEL, ").");
    const after = text("Nothing in the pipeline mutates the document. Every mutation leaves through the reducer (", DOC_MODEL, ").");
    const result = cited(before, after);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('its closing citation now backs only "Every mutation leaves');
  });

  test("b: a closing range of decision IDs counts as a citation", () => {
    expect(split("The window is section ③; loaders retire into state as agents adopt the sidecar (D81–D84).", "The window is section ③. Loaders retire into state as agents adopt the sidecar (D81–D84).").ok).toBe(false);
  });

  test("the detail counts the defects after the first", () => {
    const before = "Every glyph picker groups glyphs by category, and searches labels and ids. Source lives in `packages/tui/`; per-module tests are omitted:";
    const after = "Every glyph picker groups glyphs by category. Every glyph picker searches labels and ids. Source lives in `packages/tui/`. Per-module tests are omitted:";
    expect(split(before, after).detail).toEndWith(", and 1 more");
  });
});

// Near misses: shapes that reviewers approved in the calibration rows, or that a rule allows by its
// own definition. The check must let each one through.
describe("split-integrity accepts splits that keep the frame", () => {
  test.each([
    [
      "a sentence the rewrite kept whole",
      "The default variant renders the shared rail note: a 3px rail, the icon, and the body.",
      "The default variant renders the shared rail note with a 3px rail, the icon, and the body.",
    ],
    [
      "a colon inside the sentence, which moves with its own clause",
      "Notes are prose, and notes never have children: a note that wants substructure is a step.",
      "Notes are prose. Notes never have children: a note that wants substructure is a step.",
    ],
    [
      "a closing colon on a piece that names the subject again",
      "The glyph picker groups glyphs by category, and it searches these fields:",
      "The glyph picker groups glyphs by category. The glyph picker searches these fields:",
    ],
    ["a lone decision ID, which backs the claim beside it", "A base agent is `agent.json` plus a prompt; the absence of other sections makes it plain (D83).", "A base agent is `agent.json` plus a prompt. The absence of other sections makes it plain (D83)."],
    ["a scope phrase over two pieces", "In the Mac app, enter the endpoint and token under **This Mac**; tokens are stored in Keychain.", "In the Mac app, enter the endpoint and token under **This Mac**. Tokens are stored in Keychain."],
    [
      "a noun that replaces the author's pronoun",
      "The installed connection is named codecaine-prompts; it is separate from codecaine-docs.",
      "The installed connection is named codecaine-prompts. The installed connection is separate from codecaine-docs.",
    ],
    [
      "repeated words with fewer than two content words",
      "This is a read-only review and a proposed direction, not an implemented change.",
      "This is a read-only review. This is a proposed direction, not an implemented change.",
    ],
    ["a hyphenated modifier capitalized before its noun", "The adapter wraps the shared contract; host-side input handling was rejected.", "The adapter wraps the shared contract. Host-side input handling was rejected."],
    ["a dotted abbreviation that now opens a sentence", "Some rules fire late; e.g., the clearance rule waits for layout.", "Some rules fire late. E.g., the clearance rule waits for layout."],
    ["a closing parenthetical of names that cites nothing", "The reader accepts two encodings; the writer emits one (UTF-8 or UTF-16).", "The reader accepts two encodings. The writer emits one (UTF-8 or UTF-16)."],
    [
      "a scope phrase kept on a lead whose colon introduces the pieces",
      "Among sections, depth sorts ascending, then area sorts descending, then the schema index breaks the tie.",
      ["Among sections:", "Depth sorts ascending.", "Area then sorts descending.", "The schema index breaks the tie."],
    ],
  ])("%s", (_, before, after) => {
    expect(split(before, after)).toEqual({ id: "split-integrity", ok: true, detail: "every split keeps its lead-in, citation, scope, subject, and identifiers" });
  });

  test("a citation that becomes its own sentence still follows the whole statement", () => {
    expect(cited(text("Identity is container-first; see ", IDENTITY, " for the full nesting."), text("Identity is container-first. See ", IDENTITY, " for the full nesting.")).ok).toBe(true);
  });

  test("a closing source file reference backs only the claim beside it", () => {
    const before = text("The route accepts a forwarded action only as a single-op batch; mixing one with doc ops is a 400 (", ROUTES, ").");
    const after = text("The route accepts a forwarded action only as a single-op batch. Mixing one with doc ops is a 400 (", ROUTES, ").");
    expect(cited(before, after).ok).toBe(true);
  });
});

test("split-integrity skips a block too long to align, rather than passing it", () => {
  const words = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
  const result = split(`${words}; the tool reads every page.`, `${words}. The tool reads every page.`);
  expect(result).toEqual({ id: "split-integrity", ok: true, skipped: true, detail: "not run: the block is too long to align" });
});
