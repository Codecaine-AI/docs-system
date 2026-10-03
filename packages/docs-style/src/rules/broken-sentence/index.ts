/**
 * An earlier em-dash cleanup turned "X — y" into "X. y": "the editor. the save loop". The
 * sentence splitter then splits there, and a model rewrite cements the damage. So this rule
 * finds a period followed by a lowercase word, and the sweep holds the block for a person.
 */
import { authoredProse } from "../../text";
import type { StyleMatch, StyleRule } from "../../types";

export const brokenSentenceRule: StyleRule = {
  id: "ste.broken-sentence",
  layer: "structure",
  docsPath: "99-appendix/10-style-guide/10-writing-style",
  summary: "A period followed by a lowercase word, often an em dash that a cleanup turned into a period.",
  hint: "Do not rewrite. A person repairs this text.",
  rewrite: "hold",
  detect(context) {
    return authoredProse(context).flatMap((field) => {
      const block = field.blockId ? context.document.blocks[field.blockId] : undefined;
      const listItem = block?.type === "list-item" && field.field === "text";
      return breaks(field.text, listItem).map(
        ({ start, end }): StyleMatch => ({
          blockId: field.blockId,
          field: field.field,
          message: "Broken sentence: a period is followed by a lowercase word. A person must repair it.",
          evidence: field.text.slice(start, end),
        }),
      );
    });
  },
};

/** A period after a word, then space, then a lowercase letter. "plus . plus" has no word before it. */
const BREAK = /(?<=\S)\.\s+(?=\p{Ll})/gu;
/** Abbreviations that end in a period mid-sentence. */
const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|cf)$/i;
/**
 * A code-ish word, which may open a sentence in lowercase: a path, a file name, snake_case,
 * camelCase, a word with a digit, or a hyphenated package name such as "docs-model".
 */
const CODE_WORD = /[_./\d-]|\p{Ll}\p{Lu}/u;
/** A list-item label of up to three capitalized words or numbers: "B.", "Option A.", "Step 2." */
const LABEL = /^[\p{Lu}\d][\p{L}\d]*(?:\s+[\p{Lu}\d][\p{L}\d]*){0,2}$/u;

/** Each break in a proseText field, as the word before the period through the word after it. */
function breaks(text: string, listItem: boolean): { start: number; end: number }[] {
  return [...text.matchAll(BREAK)].flatMap((match) => {
    const period = match.index!;
    const before = text.slice(0, period);
    const word = /^\S+/.exec(text.slice(period + match[0].length))![0].replace(/[,;:.!?)\]"'”’]+$/, "");
    if (text[period - 1] === "." || ABBREVIATION.test(before) || CODE_WORD.test(word)) return [];
    if (listItem && LABEL.test(before.trim())) return [];
    const start = before.search(/\S+$/);
    return [{ start, end: period + match[0].length + word.length }];
  });
}
