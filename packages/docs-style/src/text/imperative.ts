/**
 * Finds instructions: sentences that open with a command, such as "Run the tests" or "Do not
 * push". Judge rules use it to pick the blocks worth a question, so it favors recall. Jev, not
 * this check, decides whether the block has the problem.
 *
 * Its sibling procedural.ts answers the same question for Tier 1 rules and favors precision,
 * because there the answer decides a finding with no model to confirm it.
 */
import { tag } from "./tagger";

/** Adverbs that can come before the verb of a command: "Then run", "Never use", "Only run". */
const LEAD_ADVERBS = new Set(["then", "also", "first", "next", "finally", "always", "never", "only"]);
const NOUNS = new Set(["NOUN", "PROPN"]);
const FINITE = new Set(["VERB", "AUX"]);

/**
 * True when a sentence (proseText form) opens with a command.
 * - wink tags a capitalized first word as a proper noun ("Use", "Copy"), so the first letter is
 *   lowercased, and "you " in front makes the base-form verb reading available.
 * - A base-form verb, then nouns, then a verb is a noun subject, not a command: "Copy payloads
 *   carry data", "Undo is an apply".
 */
export function opensWithCommand(sentence: string): boolean {
  const opening = sentence.replace(/^[^\p{L}\u0000]+/u, "");
  if (!opening || opening.startsWith("\u0000")) return false;
  const tokens = tag(`you ${opening[0]!.toLowerCase()}${opening.slice(1)}`).slice(1);
  let i = 0;
  while (i < tokens.length && (LEAD_ADVERBS.has(tokens[i]!.lemma) || tokens[i]!.pos === "PUNCT")) i++;
  const verb = tokens[i];
  if (!verb) return false;
  if (verb.lemma === "do" && /^(?:not|n't)$/i.test(tokens[i + 1]?.text ?? "")) return true;
  if (verb.pos !== "VERB" || verb.text.toLowerCase() !== verb.lemma) return false;
  let next = i + 1;
  while (next < tokens.length && NOUNS.has(tokens[next]!.pos)) next++;
  return !FINITE.has(tokens[next]?.pos ?? "");
}
