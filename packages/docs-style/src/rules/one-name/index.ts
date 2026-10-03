/**
 * ste.one-name: one name per concept, from the Vocabulary naming canon. The rule reads a whole
 * page and flags each use of a name the canon avoids, such as "doc" for a page. It never
 * autofixes, because the right canonical name depends on the sentence.
 *
 * Precision comes before recall:
 * - A short name's plural is a different word, so "doc" never matches "docs". Compounds, paths,
 *   and file names never match either: "doc-renderer", "src/doc", "doc.json".
 * - A phrase the group's note quotes stays allowed ('"New thread" stays as the name of the UI
 *   action'). When the quoted phrase is the avoided name itself, the name has a second sense
 *   ('"Docs framework" is also the name of an older skill'), so the rule skips it. A quoted
 *   single word changes nothing: notes quote a word both to keep it somewhere and to avoid it.
 * - A name right before a noun is part of a compound term with its own meaning, such as
 *   "mutation model" or "element type", so the rule skips it. This is what "(alone)" asks for,
 *   applied to every name.
 * - "(as a noun)" needs a noun. Any other qualifier names a sense the tagger cannot check, so
 *   the rule skips that name.
 * - A name that a replacement row lists, such as "subagent", is left to ste.replacement, so one
 *   word gets one finding.
 */
import { namingCanon, replacements, type NamingGroup, type Replacement } from "../../profile";
import { authoredProse, tag, type Token } from "../../text";
import { pluralOf } from "../../text/inflect";
import type { StyleMatch, StyleRule } from "../../types";
import {
  findWords,
  mentionTables,
  readFind,
  sentenceAt,
  sentenceSpans,
  tokenAt,
  wordIndex,
  type WordIndex,
} from "../replacement/match";

interface Name {
  /** The index of the naming group. */
  group: number;
  canonical: boolean;
  /** "(as a noun)": only a noun use counts. */
  noun?: boolean;
}

interface Compiled {
  names: WordIndex<Name>;
  /** Phrases a note keeps, such as "new thread". */
  kept: RegExp | undefined;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** A plural this short is usually its own word: "docs" is not a plural of "doc" in this corpus. */
const SHORT = 3;

function compile(groups: readonly NamingGroup[], covered: ReadonlySet<string>): Compiled {
  const names = new Map<string, Name>();
  const kept: string[] = [];
  const add = (text: string, name: Name) => {
    if (text && !names.has(text)) names.set(text, name);
  };
  groups.forEach((group, index) => {
    for (const name of group.use.split(/,\s*|\s+or\s+/).map(normalize)) {
      add(name, { group: index, canonical: true });
      add(normalize(pluralOf(name)), { group: index, canonical: true });
    }
    const quoted = [...(group.note ?? "").matchAll(/["\u201c]([^"\u201d]+)["\u201d]/g)]
      .map((m) => normalize(m[1]!))
      .filter((phrase) => phrase.includes(" "));
    for (const avoid of group.avoid) {
      const qualifier = /\(([^)]*)\)/.exec(avoid)?.[1]?.toLowerCase();
      const noun = /\bnoun\b/.test(qualifier ?? "");
      if (qualifier !== undefined && !noun && !/\balone\b/.test(qualifier)) continue;
      const text = normalize(avoid.replace(/\([^)]*\)/, " "));
      if (!text || covered.has(text) || quoted.includes(text)) continue;
      const name: Name = { group: index, canonical: false, noun };
      add(text, name);
      // "edits" is a plural noun or a verb, and the tagger often misreads which, so a word that
      // must be a noun matches only in the singular.
      if (!noun && text.split(" ").at(-1)!.length > SHORT) add(normalize(pluralOf(text)), name);
      for (const phrase of quoted)
        if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(text)}(?![\\p{L}\\p{N}])`, "u").test(phrase)) kept.push(phrase);
    }
  });
  return {
    names: wordIndex([...names].map(([text, value]) => ({ text, value }))),
    kept: kept.length
      ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${kept.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu")
      : undefined,
  };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/ /g, "\\s+");
}

/** "The unit a reader opens" reads as "the unit a reader opens" inside a sentence. "AI actor" stays. */
function lowerFirst(text: string): string {
  return /^\p{Lu}[\p{Lu}\d]/u.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

function quoteNames(use: string): string {
  const names = use.split(/,\s*|\s+or\s+/).filter(Boolean).map((n) => `"${n}"`);
  return names.length < 3 ? names.join(" or ") : `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

/** True when a noun follows the match with only a space between, so the name modifies it ("mutation model"). */
function modifiesNoun(text: string, tokens: readonly Token[], end: number): boolean {
  const next = tokens.find((t) => t.start >= end);
  return !!next && !next.code && /^\s+$/.test(text.slice(end, next.start)) && (next.pos === "NOUN" || next.pos === "PROPN");
}

/**
 * The rule over the given naming groups. `rows` are the replacement rows: a name one of them
 * lists is left to ste.replacement.
 */
export function oneNameRuleFor(groups: readonly NamingGroup[], rows: readonly Replacement[] = []): StyleRule {
  let compiled: Compiled | undefined;
  const covered = () =>
    new Set(
      rows
        .filter((row) => row.origin === "style-guides" || row.origin === "habit")
        .flatMap((row) => readFind(row.find).map((f) => f.words.join(" "))),
    );
  return {
    id: "ste.one-name",
    layer: "vocabulary",
    docsPath: "99-appendix/10-style-guide/40-vocabulary",
    summary: "Flags a name that the naming canon replaces with one name per concept.",
    hint: "Use the canonical name for each concept in prose. Keep code identifiers and quoted UI text as they are.",
    detect(context) {
      const { names, kept } = (compiled ??= compile(groups, covered()));
      const mentions = mentionTables(context);
      const fields = authoredProse(context)
        .filter((field) => !(field.blockId && mentions.has(field.blockId)))
        // The canon avoids acronyms ("AI", "LLM"), so all-caps names still match here.
        .map((field) => ({ field, hits: findWords(field.text, names, { acronyms: true }) }));
      const canonicalUsed = new Set(fields.flatMap(({ hits }) => hits.filter((h) => h.value.canonical).map((h) => h.value.group)));
      const matches: StyleMatch[] = [];
      for (const { field, hits } of fields) {
        const avoided = hits.filter((hit) => !hit.value.canonical);
        if (!avoided.length) continue;
        let tagged: Token[] | undefined;
        const tokens = () => (tagged ??= tag(field.text));
        const keep = kept ? [...field.text.matchAll(kept)].map((m) => [m.index, m.index + m[0].length]) : [];
        const located = sentenceSpans(field.text);
        for (const hit of avoided) {
          const { group, noun } = hit.value;
          if (keep.some(([a, b]) => hit.start >= a! && hit.end <= b!)) continue;
          if (noun && tokenAt(tokens(), hit.start)?.pos !== "NOUN") continue;
          if (modifiesNoun(field.text, tokens(), hit.end)) continue;
          const { use, concept } = groups[group]!;
          matches.push({
            blockId: field.blockId,
            field: field.field,
            message: `Use ${quoteNames(use)} for ${lowerFirst(concept)}.${canonicalUsed.has(group) ? " This page uses both." : ""}`,
            evidence: hit.matched,
            sentence: sentenceAt(located, hit.start),
          });
        }
      }
      return matches;
    },
  };
}

export const oneNameRule: StyleRule = oneNameRuleFor(namingCanon, replacements);
