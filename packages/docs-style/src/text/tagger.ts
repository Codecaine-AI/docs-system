/**
 * Part-of-speech tagging with wink-nlp (Universal POS tags: NOUN, VERB, AUX, ADJ, PROPN, ...).
 * Input is proseText output, so each code or reference span is one "\u0000" character. Each span
 * becomes one token with pos "PROPN" and code: true, which keeps it one noun-like unit.
 *
 * Known quirk: wink tags a participle after "be" as ADJ ("is validated" -> AUX ADJ). Rules that
 * look for the passive must accept ADJ tokens that end in -ed or -en, or that are irregular
 * participles.
 */
import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);
const its = nlp.its;
const CODE = "CODESPAN";

export interface Token {
  text: string;
  /** Universal POS tag. */
  pos: string;
  /** Lowercase base form, such as "be" for "is". */
  lemma: string;
  /** Character offsets into the input text. */
  start: number;
  end: number;
  /** True for a token that stands for a code or reference span. */
  code?: boolean;
}

export function tag(text: string): Token[] {
  const masked = text.replace(/\u0000/g, ` ${CODE} `);
  const doc = nlp.readDoc(masked);
  const values = doc.tokens().out(its.value) as string[];
  const tags = doc.tokens().out(its.pos) as string[];
  // wink's typings do not accept its.lemma in out(), but the lite model supports it.
  const lemmas = doc.tokens().out(its.lemma as never) as unknown as string[];
  const tokens: Token[] = [];
  // Offsets map back to `text`: walk `text` in step with the masked token values.
  let cursor = 0;
  values.forEach((value, i) => {
    if (value === CODE) {
      const at = text.indexOf("\u0000", cursor);
      if (at === -1) return;
      tokens.push({ text: "\u0000", pos: "PROPN", lemma: "\u0000", start: at, end: at + 1, code: true });
      cursor = at + 1;
      return;
    }
    const at = text.indexOf(value, cursor);
    if (at === -1) return;
    tokens.push({ text: value, pos: tags[i] ?? "X", lemma: (lemmas[i] ?? value).toLowerCase(), start: at, end: at + value.length });
    cursor = at + value.length;
  });
  return tokens;
}
