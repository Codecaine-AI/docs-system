/**
 * STE 3.2: no progressive and no perfect tenses. "is closing" becomes "closes", and "has closed"
 * becomes "closed". The profile keeps every other -ing word: a gerund ("Before saving, run the
 * check") and an -ing adjective ("the existing rules") stay.
 */
import { sentences, tag, type Token } from "../../text";
import { isQuoted } from "../../text/quotes";
import { sentenceFields } from "../../text/sentence-fields";
import { isAttributive, isBe, isHave, isParticiple, isPresentParticiple, skipModifiers } from "../../text/verbs";
import type { StyleMatch, StyleRule } from "../../types";

export const verbFormsRule: StyleRule = {
  id: "ste.verb-forms",
  layer: "structure",
  // A tense swap can change meaning: "nobody has written" keeps a "not yet" that "nobody wrote"
  // loses. A person fixes these, so the finding never starts a rewrite.
  rewrite: "none",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "Progressive and perfect tenses, such as \"is closing\" and \"has closed\".",
  hint: "Change each progressive or perfect verb to the simple present or simple past, for example \"is closing\" to \"closes\" and \"has closed\" to \"closed\". Keep the meaning and every fact.",
  detect(context) {
    return sentenceFields(context).flatMap((field) =>
      sentences(field.text).flatMap((sentence) =>
        verbForms(tag(sentence))
          .filter(({ start }) => !isQuoted(sentence, start))
          .map(
            ({ tense, start, end }): StyleMatch => ({
              blockId: field.blockId,
              field: field.field,
              message: `${tense === "progressive" ? "Progressive" : "Perfect"} tense: "${sentence.slice(start, end)}".`,
              evidence: sentence.slice(start, end),
              sentence,
            }),
          ),
      ),
    );
  },
};

interface VerbForm {
  tense: "progressive" | "perfect";
  start: number;
  end: number;
}

/** -ing words that read as adjectives after "be": "The title is missing." */
const ING_ADJECTIVES = new Set([
  "according", "confusing", "corresponding", "existing", "interesting", "misleading", "missing",
  "outstanding", "remaining", "surprising", "willing",
]);

const word = (token: Token | undefined) => token?.text.toLowerCase() ?? "";

function verbForms(tokens: readonly Token[]): VerbForm[] {
  const found: VerbForm[] = [];
  let skipUntil = -1;
  tokens.forEach((aux, i) => {
    if (i <= skipUntil) return;
    const at = skipModifiers(tokens, i + 1);
    const verb = tokens[at];
    if (at < 0 || !verb) return;
    if (isHave(aux)) {
      if (word(verb) === "been") {
        // "has been running" and "has been closed" are one perfect phrase.
        const after = skipModifiers(tokens, at + 1);
        const next = after < 0 ? undefined : tokens[after];
        const end = next && (isParticiple(next) || isPresentParticiple(next)) ? next.end : verb.end;
        found.push({ tense: "perfect", start: aux.start, end });
        skipUntil = at;
        return;
      }
      // An -ed word before a noun or an adjective describes it: "has nested children".
      const next = tokens[at + 1];
      if (verb.pos === "VERB" && isParticiple(verb) && !isAttributive(next) && next?.pos !== "ADJ")
        found.push({ tense: "perfect", start: aux.start, end: verb.end });
      return;
    }
    if (!isBe(aux)) return;
    if (word(verb) === "being") {
      // "is being written": the progressive of a passive.
      const next = tokens[at + 1];
      if (next && isParticiple(next)) found.push({ tense: "progressive", start: aux.start, end: next.end });
      return;
    }
    // An -ing word before a noun describes it: "It is working guidance."
    if (isPresentParticiple(verb) && !ING_ADJECTIVES.has(word(verb)) && !isAttributive(tokens[at + 1]))
      found.push({ tense: "progressive", start: aux.start, end: verb.end });
  });
  return found;
}
