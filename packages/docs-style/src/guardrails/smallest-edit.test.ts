import { describe, expect, test } from "bun:test";
import { rewrite } from "./fixtures";
import { checkSmallestEdit } from "./smallest-edit";

const FIRST = "The sweep changes nothing on disk.";
const FLAGGED = "It returns the changes, and a later step stages them as proposals for review.";
const LAST = "Each proposal waits for a person.";
const BEFORE = `${FIRST} ${FLAGGED} ${LAST}`;

const edit = (after: string | string[], before = BEFORE) =>
  checkSmallestEdit(rewrite(before, after, { flaggedSentences: [FLAGGED], wholeBlockFlagged: false }));

describe("smallest-edit accepts a rewrite that changes only flagged sentences", () => {
  test.each([
    ["the flagged sentence split in place", `${FIRST} It returns the changes. A later step stages them as proposals for review. ${LAST}`],
    ["kept sentences moved into bullets", [FIRST, "It returns the changes.", "A later step stages them as proposals for review.", LAST]],
    ["a kept sentence with a lowercase first letter", [`${FIRST} It returns the changes.`, "A later step stages them as proposals for review.", "each proposal waits for a person."]],
    ["a kept sentence with different whitespace", `The sweep  changes\nnothing on disk. It returns the changes. A later step stages them. ${LAST}`],
  ])("%s", (_, after) => {
    expect(edit(after)).toEqual({ id: "smallest-edit", ok: true, detail: "kept 2 unflagged sentences" });
  });
});

describe("smallest-edit rejects a rewrite that changes an unflagged sentence", () => {
  test.each([
    ["a reworded sentence", `The sweep writes nothing to disk. It returns the changes. A later step stages them. ${LAST}`, FIRST],
    ["a lost period", [FIRST, "It returns the changes.", "A later step stages them.", "Each proposal waits for a person"], LAST],
    ["a dropped sentence", `${FIRST} It returns the changes. A later step stages them.`, LAST],
  ])("%s", (_, after, changed) => {
    expect(edit(after)).toEqual({ id: "smallest-edit", ok: false, detail: `changed "${changed}"` });
  });

  test("two code spans swapped in an unflagged sentence", () => {
    const before = `Copy \`config.local.json\` over \`config.json\`. ${FLAGGED}`;
    expect(edit([`Copy \`config.json\` over \`config.local.json\`.`, "It returns the changes.", "A later step stages them as proposals for review."], before)).toEqual({
      id: "smallest-edit",
      ok: false,
      detail: 'changed "Copy `config.local.json` over `config.json`."',
    });
    expect(edit([`Copy \`config.local.json\` over \`config.json\`.`, "It returns the changes.", "A later step stages them as proposals for review."], before).ok).toBe(true);
  });

  test("the detail cuts a long sentence to 80 characters", () => {
    const long = "The verifier compares every sentence that has no finding with the original block and its text.";
    const result = edit(`${FIRST} It returns the changes. ${LAST}`, `${long} ${FLAGGED} ${LAST}`);
    expect(result.ok).toBe(false);
    const quoted = result.detail.slice('changed "'.length, -1);
    expect(Array.from(quoted).length).toBeLessThanOrEqual(80);
    expect(quoted).toEndWith("…");
    expect(long.startsWith(quoted.slice(0, -1))).toBe(true);
  });
});

test("smallest-edit is skipped when a finding covers the whole block", () => {
  const result = checkSmallestEdit(rewrite(BEFORE, "Nothing on disk changes.", { wholeBlockFlagged: true }));
  expect(result).toMatchObject({ ok: true, skipped: true });
});
