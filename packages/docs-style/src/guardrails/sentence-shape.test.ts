import { describe, expect, test } from "bun:test";
import { rewrite } from "./fixtures";
import { checkSentenceShape } from "./sentence-shape";

const BEFORE = "The sweep stages proposals because a person must review them, and the run stops when Jev fails.";
const shape = (after: string[], before = BEFORE) => checkSentenceShape(rewrite(before, after));
/** The cross-doc-linking intro, where "typed reference spans" and "the backlinks index" sit in prepositional phrases. */
const LINKS = "Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose.";
const FAST_FORWARD = "Commit the corpus changes on your docs branch, push it, then fast-forward `main`.";

describe("sentence-shape rejects a new sentence that cannot stand alone", () => {
  test.each([
    ["a bullet that starts with So", ["The sweep stages proposals.", "So a person reviews them."], '"So a person reviews them." starts with "So"'],
    ["a bullet that starts with And", ["The sweep stages proposals.", "And the run stops when Jev fails."], '"And the run stops when Jev fails." starts with "And"'],
    ["a bullet that starts with a lowercase word", ["The sweep stages proposals.", "a person must review them."], '"a person must review them." starts with a lowercase word'],
    [
      "a question-word fragment",
      ["Structural decisions for the workspace package cut.", "How the docs system's code divides into packages and why the walls sit where they do."],
      `"How the docs system's code divides into packages and why th…" is a "How" fragment, not a sentence`,
    ],
  ])("%s", (_, after, detail) => {
    expect(shape(after)).toEqual({ id: "sentence-shape", ok: false, detail });
  });

  test.each([
    ["a noun phrase cut loose by a dash split", "Applies to: `docs-cli` and every future command and flag.", ["Applies to: `docs-cli`.", "Every future command and flag."], '"Every future command and flag." has no verb'],
    ["a gloss kept as a fragment", "framework — the runtime-optional methodology and agent skill.", ["framework, the runtime-optional methodology and agent skill."], '"framework, the runtime-optional methodology and agent skill." has no verb'],
    // wink tags "held" a verb, and compromise reads "backlinks index" as a subject and its verb.
    ["a noun and the participle phrase that describes it", BEFORE, ["The sweep stages proposals.", "The backlinks index, held at zero stale."], '"The backlinks index, held at zero stale." has no verb'],
    // Both taggers read "Typed" and "spans" as verbs. The author wrote them after "with", as a noun phrase.
    ["a noun phrase from the author's prepositional phrase", LINKS, ["Docs never link with raw paths in prose.", "Typed reference spans for every link."], '"Typed reference spans for every link." has no verb'],
    ["a hyphenated word with a noun after it, not an object", BEFORE, ["The sweep stages proposals.", "Real-time sync."], '"Real-time sync." has no verb'],
    ["a hyphenated noun before a code span", BEFORE, ["The sweep stages proposals.", "Client-side `fetch`."], '"Client-side `fetch`." has no verb'],
  ])("a new sentence with no verb: %s", (_, before, after, detail) => {
    expect(checkSentenceShape(rewrite(before, after))).toEqual({ id: "sentence-shape", ok: false, detail });
  });

  test.each([
    [
      "a bullet that opens with a pronoun the author never wrote there",
      "Use `chip` for a component on the page, which picks Light+ or Dark+.",
      ["Use `chip` for a component on the page.", "It picks Light+ or Dark+."],
      '"It picks Light+ or Dark+." opens a bullet with "It", which points back',
    ],
    [
      "two colons with no verb between them",
      "Applies to: `src/index.ts` — every future command and flag.",
      ["Applies to: `src/index.ts`: every future command and flag."],
      '"Applies to: `src/index.ts`: every future command and flag." stacks two colons',
    ],
    [
      "a colon before including",
      "The component a human reads — including the in-place node view.",
      ["The component a human reads: including the in-place node view."],
      '"The component a human reads: including the in-place node vi…" has a colon before "including"',
    ],
  ])("%s", (_, before, after, detail) => {
    expect(checkSentenceShape(rewrite(before, after))).toEqual({ id: "sentence-shape", ok: false, detail });
  });

  test("a kept sentence that the rewrite lowercased counts as new", () => {
    expect(shape(["The sweep stages proposals.", "each proposal waits for a person."], "The sweep stages proposals. Each proposal waits for a person.").ok).toBe(false);
  });

  test("the detail counts the problems after the first", () => {
    expect(shape(["The sweep stages proposals.", "So a person reviews them.", "And the run stops."]).detail).toEndWith(", and 1 more");
  });
});

describe("sentence-shape accepts sentences that stand alone", () => {
  test.each([
    ["a sentence that starts with a code span", ["`docs_check` runs last.", "The sweep stages proposals."]],
    ["a condition before its instruction", ["Where a test exists, run it.", "The sweep stages proposals."]],
    ["a question word that opens a full sentence", ["What crosses a boundary is referenced at the boundary.", "The sweep stages proposals."]],
    ["a name that starts lowercase", ["iOS shows the page.", "The sweep stages proposals."]],
    ["an identifier that starts lowercase", ["docs-cli lazy-loads the viewer.", "The sweep stages proposals."]],
    ["a label such as Why:", ["Why: One authority serves every host.", "The sweep stages proposals."]],
    // wink reads "checks" as a noun, and both taggers read "stages" as one.
    ["verbs that the taggers miss", ["The server checks the page.", "The sweep stages proposals."]],
    ["a bullet that lists only code spans", ["The package has two entry points:", "`./backlinks` and `./paths`."]],
  ])("%s", (_, after) => {
    expect(shape(after)).toEqual({ id: "sentence-shape", ok: true, detail: "every new sentence stands alone" });
  });

  test("a sentence the author wrote stays, even when it starts with So", () => {
    expect(shape(["So the run stops.", "Jev fails."], "So the run stops. Jev fails, which ends it.").ok).toBe(true);
  });

  test.each([
    // The reader finds "It" in the sentence before, in the same block.
    ["a pronoun that opens a new sentence inside the lead", "The index derives lookup and never writes a document.", ["The index derives lookup. It never writes a document."]],
    // The author's own clause: "it never writes a document" was already there.
    ["a bullet that keeps the author's pronoun clause", "The index derives lookup; it never writes a document.", ["The index derives lookup.", "It never writes a document."]],
    ["a bullet that opens with This and a noun", "The package is versioned content and carries no standard copies.", ["The package is versioned content.", "This package carries no standard copies."]],
    ["two colons with a clause between them", "Why: The package is versioned content — a delivery unit, not a runtime wall.", ["Why: The package is versioned content: a delivery unit, not a runtime wall."]],
    // Both taggers read "page move" as one noun. The plural subject "Entries" makes "move" its verb.
    [
      "a plural subject and a verb the taggers read as a noun",
      "Sub-pages tracking the source tree file by file go stale with every move; entries on an area page move with the page.",
      ["Sub-pages tracking the source tree file by file go stale with every move. Entries on an area page move with the page."],
    ],
    ["nouns joined by and, then their verb", "The Docs reader and editor preview share one renderer, so neither can drift.", ["The Docs reader and editor preview share one renderer. Neither can drift."]],
    // wink splits "fast-forward" into two adverbs, and compromise reads "forward `main`" as a noun.
    ["an imperative with a hyphenated verb after an adverb", FAST_FORWARD, ["Commit the corpus changes on your docs branch and push it. Then fast-forward `main`."]],
    ["a bullet that opens with a hyphenated verb", FAST_FORWARD, ["Commit the corpus changes on your docs branch and push it.", "Fast-forward `main`."]],
    ["the author's noun phrase as the subject of a new verb", LINKS, ["Typed reference spans link docs to docs.", "Raw paths in prose never do."]],
    // The author's phrases name no verb here: "on an area page" sits in the subject, and "after" opens a clause.
    ["a verb after a prepositional phrase in the author's subject", "An entry on an area page moves with the page; a sub-page goes stale.", ["An entry on an area page moves with the page. A sub-page goes stale."]],
    ["a clause the author opened with after", "The cache clears after the job finishes.", ["The job finishes. Then the cache clears."]],
    ["a past-tense verb after an aside in commas", BEFORE, ["The sweep stages proposals.", "Each block, checked by Jev, passed."]],
  ])("%s", (_, before, after) => {
    expect(checkSentenceShape(rewrite(before, after)).ok).toBe(true);
  });

  test("a verbless sentence the author wrote stays", () => {
    expect(shape(["Source: `packages/docs-model`.", "The sweep stages proposals."], "Source: `packages/docs-model`. The sweep stages proposals for review.").ok).toBe(true);
  });

  test("a lowercase first word the author also started a sentence with stays", () => {
    expect(shape(["framework holds the methodology.", "The package ships no code."], "framework holds the methodology; the package ships no code.").ok).toBe(true);
  });
});
