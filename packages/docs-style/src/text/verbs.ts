/**
 * Verb-phrase helpers over tagger tokens. The passive-voice and verb-forms rules share them, so
 * both rules read an auxiliary and a past participle the same way.
 *
 * wink tags a participle after "be" as VERB or ADJ ("is set" VERB, "is validated" ADJ), and it
 * has no participle tag, so a participle is an -ed word or a word on the irregular list.
 */
import type { Token } from "./tagger";

const BE = new Set(["am", "is", "are", "was", "were", "be", "been", "'s", "’s", "'re", "’re", "'m", "’m"]);
const HAVE = new Set(["has", "have", "had", "'ve", "’ve"]);

/** Past participles that do not end in -ed. */
const IRREGULAR_PARTICIPLES = new Set([
  "arisen", "awoken", "beaten", "become", "begun", "bent", "bet", "bitten", "blown", "bought", "bound",
  "broadcast", "broken", "brought", "built", "burnt", "cast", "caught", "chosen", "come", "cost",
  "crept", "cut", "dealt", "done", "drawn", "dreamt", "driven", "dug", "eaten", "fallen", "fed", "felt",
  "fled", "flown", "forbidden", "forecast", "forgiven", "forgotten", "fought", "found", "frozen",
  "given", "gone", "got", "gotten", "ground", "grown", "held", "hidden", "hit", "hung", "hurt", "input",
  "kept", "known", "laid", "learnt", "led", "left", "lent", "let", "lit", "lost", "made", "meant",
  "met", "mistaken", "offset", "output", "overcome", "overridden", "overrun", "overwritten",
  "paid", "proven", "put", "quit", "read", "rebuilt", "redone", "reread", "rerun", "reset", "rewritten",
  "rid", "ridden", "risen", "run", "said", "seen", "sent", "set", "sewn", "shaken", "shed", "shot",
  "shown", "shut", "slept", "slid", "sold", "sought", "spent", "spilt", "split", "spoken", "spread",
  "sprung", "spun", "stolen", "stood", "struck", "stuck", "sung", "sunk", "swept", "sworn", "swung",
  "taken", "taught", "thought", "thrown", "told", "torn", "understood", "undertaken", "undone",
  "upheld", "upset", "withdrawn", "withheld", "won", "worn", "wound", "written",
]);

/** -ed words that are not participles. */
const NOT_PARTICIPLES = new Set([
  "bed", "bleed", "breed", "embed", "exceed", "feed", "greed", "hundred", "indeed", "kindred",
  "naked", "need", "proceed", "red", "sacred", "seed", "shred", "speed", "succeed", "weed", "wicked",
]);

const lower = (token: Token | undefined) => token?.text.toLowerCase() ?? "";

/** A form of "be" used as a verb, not a possessive "'s". */
export function isBe(token: Token | undefined): boolean {
  return !!token && (token.pos === "AUX" || token.pos === "VERB") && BE.has(lower(token));
}

/** A form of "have". The caller decides between the perfect and the main verb ("has a title"). */
export function isHave(token: Token | undefined): boolean {
  return !!token && (token.pos === "AUX" || token.pos === "VERB") && HAVE.has(lower(token));
}

/** A past participle, as wink tags it after an auxiliary: VERB, or ADJ in the passive. */
export function isParticiple(token: Token | undefined): boolean {
  if (!token || token.code || (token.pos !== "VERB" && token.pos !== "ADJ")) return false;
  const word = lower(token);
  if (IRREGULAR_PARTICIPLES.has(word)) return true;
  return /^[a-z]{2,}ed$/.test(word) && !NOT_PARTICIPLES.has(word);
}

/** An -ing verb form, such as "closing" in "is closing". */
export function isPresentParticiple(token: Token | undefined): boolean {
  return !!token && token.pos === "VERB" && /^[a-z]{2,}ing$/.test(lower(token));
}

/**
 * True for a noun right after a participle, which makes the participle an adjective: "has nested
 * children", "is working guidance". A code span is not a noun here: "is named `x`" stays a verb.
 */
export function isAttributive(next: Token | undefined): boolean {
  return !!next && !next.code && (next.pos === "NOUN" || next.pos === "PROPN");
}

/**
 * The index of the verb after an auxiliary: the first token from `from` on that is not a
 * modifier, past at most two modifiers ("is not always closed"). -1 when the tokens run out.
 */
export function skipModifiers(tokens: readonly Token[], from: number): number {
  let i = from;
  while (i < tokens.length && i - from < 2 && isVerbModifier(tokens[i]!)) i++;
  return i < tokens.length ? i : -1;
}

/** A word that can stand between an auxiliary and its verb: "is not", "has already", "are only". */
function isVerbModifier(token: Token): boolean {
  return token.pos === "ADV" || (token.pos === "PART" && /^(?:not|n't|n’t)$/i.test(token.text));
}
