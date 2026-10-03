import { expect, test } from "bun:test";
import { profileFor } from "../../profile";
import { detect, fix, fixOnPage, heading, pageOf, paragraph, row, table } from "./fixtures";
import { replacementRule, replacementRuleFor } from "./index";

const code = { insert: "utilize", attributes: { code: true as const } };

test("reports each deny-list use with the swap in its form, and skips code and quoted mentions", () => {
  const found = detect(
    replacementRule,
    paragraph("p", [{ insert: "In order to save, the tool utilizes " }, code, { insert: ' caches via the "utilize" flag.' }]),
  );
  expect(found.map((m) => [m.evidence, m.autofixable])).toEqual([
    ["In order to", true],
    ["utilizes", true],
    ["via", false],
  ]);
  expect(found[1]).toMatchObject({
    blockId: "p",
    field: "text",
    message: 'Write "uses" instead of "utilizes".',
    sentence: 'In order to save, the tool utilizes \u0000 caches via the "utilize" flag.',
  });
  expect(found[2]!.message).toStartWith('Write "through", "by using", or "with" instead of "via".');
});

test("autofix applies the safe swaps and leaves code, links, and suggestions alone", () => {
  const link = { insert: "utilize the guide", attributes: { link: "https://example.com/utilize" } };
  const block = paragraph("p", [
    { insert: "In order to save, it utilizes " },
    code,
    { insert: " and " },
    link,
    { insert: ". They leverage caches via the CLI." },
  ]);
  expect(replacementRule.autofix!(block.text!, block)).toEqual([
    { insert: "To save, it uses " },
    code,
    { insert: " and " },
    link,
    { insert: ". They use caches via the CLI." },
  ]);
});

const guarded = replacementRuleFor([
  row("in order to", "to", { category: "wordy phrase" }),
  row("utilize", "use"),
  row("ensure", "make sure"),
  row("begin", "start"),
  row("execute", "run"),
  row("pull request", "PR", { category: "naming", origin: "habit" }),
  row("sufficient number of", "enough", { category: "wordy phrase" }),
  row("choose", "select"),
  row("remain", "stay", { tier: "pos", pos: "verb" }),
  row("retain", "keep"),
  row("happen", "occur"),
]);

test.each([
  ["Run the build in order to test it.", "Run the build to test it."],
  ["It ensures that tests pass.", "It makes sure that tests pass."],
  ["The script was executed.", "The script was run."],
  ["Before beginning, run it.", "Before starting, run it."],
  ["Merge the pull requests.", "Merge the PRs."],
  ["The tests remain green.", "The tests stay green."],
  // Each swap below would change meaning or grammar, so it stays a suggestion.
  ["It ensures coverage.", undefined], // "makes sure coverage"
  ["At the beginning of the page, read on.", undefined], // a gerund used as a noun
  ["The command executed the script.", undefined], // "ran" or "run": only a passive auxiliary decides
  ["Use a sufficient number of retries.", undefined], // "a enough"
  ["A reader chooses to explore.", undefined], // "selects to explore"
  ["It refuses remaining references.", undefined], // an adjective, not the verb
  ["The suite executes the boundary checks.", "The suite runs the boundary checks."],
  ["So every run executes the boundary checks.", undefined], // "every run runs" repeats a word
  ["The cache retains each page and its links while keeping the index warm.", undefined], // "keeps ... keeping" in one sentence
  ["It happens before the write.", "It occurs before the write."],
  ["The ids happened to be constructed in order.", undefined], // "happened to be" means "by chance"
  ["What happens to the cache after a split?", undefined], // "occurs to" means "comes to mind"
  ["The parser begins to load.", undefined], // no swap before "to" and a verb
  ["The reader chooses to be brief.", undefined], // wink tags "be" AUX, not VERB
  ["It remains to be seen.", undefined],
  ["It ensures every write is atomic.", "It makes sure every write is atomic."],
  ["Splitting ensures stable block ids and keeps undo exact.", undefined], // "make sure" needs a clause, not a noun phrase
  ["The cache retains each page. Keeping the index warm is cheap.", "The cache keeps each page. Keeping the index warm is cheap."],
])("autofix %p", (text, expected) => {
  expect(fix(guarded, text)).toBe(expected);
  // Detect calls a match autofixable exactly when autofix changes the text.
  expect(detect(guarded, paragraph("p", text)).some((m) => m.autofixable)).toBe(expected !== undefined);
});

const plainCode = replacementRuleFor([
  row("alter", "change"),
  row("retain", "keep"),
  row("subagent", "sub-agent", { category: "naming", origin: "habit" }),
]);

test.each([
  ["an all-caps word", "Run ALTER TABLE, then alter the schema.", "Run ALTER TABLE, then change the schema.", "alter"],
  ["a call or a member", "Call retain() or cache.retain to retain the cache.", "Call retain() or cache.retain to keep the cache.", "retain"],
  ["an identifier", "Set retain_count, then spawn a subAgent or a subagent.", "Set retain_count, then spawn a subAgent or a sub-agent.", "subagent"],
  [
    "a path or a URL",
    "See src/retain/index.ts and https://x.dev/?mode=retain, then retain it.",
    "See src/retain/index.ts and https://x.dev/?mode=retain, then keep it.",
    "retain",
  ],
])("code written as plain text is neither flagged nor rewritten: %s", (_, text, expected, use) => {
  expect(fix(plainCode, text)).toBe(expected);
  // Detect reports the one use that autofix rewrites, so the counts match.
  expect(detect(plainCode, paragraph("p", text)).map((m) => [m.evidence, m.autofixable])).toEqual([[use, true]]);
});

// Reviewers rejected the swaps that stay undefined below, from real wave 3 pages. The swaps beside
// them are the uses that must keep working.
const narrowed = replacementRuleFor([
  row("attempt", "try", { tier: "pos", pos: "verb" }),
  row("purchase", "buy", { tier: "pos", pos: "verb" }),
  row("initiate", "start"),
  row("execute", "run", { tier: "pos", pos: "verb" }),
]);

test.each([
  // "attempt" swaps only as a verb before "to" and a verb. The noun keeps it.
  ["The parser attempts to parse each page.", "The parser tries to parse each page."],
  ["It attempted to reconnect twice.", "It tried to reconnect twice."],
  ["Do not attempt to parse the file.", "Do not try to parse the file."],
  ["Prior attempts are recorded in the ledger.", undefined],
  ["The scheduler checks evidence for the same epoch and attempt.", undefined],
  ["The worker reads that source and prior attempts, then validates it.", undefined],
  ["Metadata-only attempts are skipped.", undefined],
  ["Earlier attempts to connect failed.", undefined],
  ["An attempt to parse failed.", undefined],
  ["Retry attempts to reach the registry are capped.", undefined],
  ["Repeat the checks before attempting the VLAN again.", undefined], // no "to"
  // "purchase" swaps as a verb, never as a noun or a noun modifier.
  ["We purchased a router.", "We bought a router."],
  ["You can purchase a license.", "You can buy a license."],
  ["Do not add it to purchase costs.", undefined],
  ["The purchase price is fixed.", undefined],
  ["Record the purchase.", undefined],
  ["Grant execute permission to the file.", undefined], // the same noun modifier
  // "initiate" keeps its networking sense: which side opens a link.
  ["Initiate the build after the merge.", "Start the build after the merge."],
  ["The UI can initiate setup and show connection health.", "The UI can start setup and show connection health."],
  ["Who initiates the connection?", undefined],
  ["Open-Claw cannot initiate access to the NAS.", undefined],
  ["The client initiates a new TLS session.", undefined],
  ["Connections are initiated by the client.", undefined],
  // "execute" keeps "run" free in a block that names a runner or a run.
  ["The suite executes the script.", "The suite runs the script."],
  ["Only an EBB board executes them.", "Only an EBB board runs them."],
  ["Only an EBB board executes them. The DrawCore runner ignores them.", undefined],
  ["Each run writes a log. The scheduler executes each job.", undefined],
])("autofix after the wave 3 rejects %p", (text, expected) => {
  expect(fix(narrowed, text)).toBe(expected);
  expect(detect(narrowed, paragraph("p", text)).some((m) => m.autofixable)).toBe(expected !== undefined);
});

test.each([
  ["The run owns the composition.", undefined],
  ["The main flow is Sync, Run, and resume.", undefined], // "Run" names a step
  ["The DrawCore runner sends the moves.", undefined],
  ["Run the tests first.", "The scheduler runs each job."], // the verb that opens an instruction
  ["The tool runs nightly.", "The scheduler runs each job."],
])("execute in one block, on a page with %p", (other, expected) => {
  const page = pageOf(paragraph("other", other), paragraph("work", "The scheduler executes each job."));
  expect(fixOnPage(narrowed, page, "work")).toBe(expected);
  // Detect reads the same page, so it calls the match autofixable exactly when autofix applies it.
  expect(detect(narrowed, page.blocks.other!, page.blocks.work!).some((m) => m.autofixable)).toBe(expected !== undefined);
});

const retain = replacementRuleFor([row("retain", "keep")]);

test.each([
  ["a heading", heading("h", "Current State and Retained History"), undefined],
  ["a capitalized name", paragraph("see", "See Retained History for the timeline."), undefined],
  ["neither: a capital that opens a sentence", paragraph("see", "Retain Sync records for a week."), "Save points keep measured evidence."],
])("a word the page uses in %s is a term there, in any form", (_, other, expected) => {
  const page = pageOf(other, paragraph("p", "Save points retain measured evidence."));
  expect(fixOnPage(retain, page, "p")).toBe(expected);
  const found = detect(retain, other, page.blocks.p!).filter((m) => m.blockId === "p");
  expect(found.map((m) => m.autofixable)).toEqual([expected !== undefined]);
});

test("network-setup keeps \"purchased\", its equipment status, and other corpora swap it", () => {
  const inCorpus = (corpus: string) => replacementRuleFor(profileFor(corpus).replacements);
  expect(fix(inCorpus("network-setup"), "We purchased a router.")).toBeUndefined();
  expect(detect(inCorpus("network-setup"), paragraph("p", "The NAS, drives, and card are purchased."))).toEqual([]);
  expect(fix(inCorpus("canvas"), "We purchased a router.")).toBe("We bought a router.");
});

test("a quote with a contraction is a mention, and sorted keys are not a wordy phrase", () => {
  for (const text of [
    "Never write 'don't utilize the cache.' in a page.",
    "The keys are in order to allow binary search.",
    "Keep the keys in order to allow binary search.",
  ])
    expect(detect(guarded, paragraph("p", text))).toEqual([]);
});

test("word lists in tables are mentions, and other table cells are prose that autofix never sees", () => {
  const found = detect(
    replacementRule,
    table("list", ["Do Not Write", "Write"], [["utilize", "use"]]),
    table("prose", ["Step", "Detail"], [["Build", "The build utilizes a cache."]]),
  );
  expect(found.map((m) => [m.blockId, m.field, m.evidence, m.autofixable])).toEqual([
    ["prose", "props.rows[0][1]", "utilizes", false],
  ]);
});
