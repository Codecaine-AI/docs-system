/**
 * Reads the local ASD-STE100 Issue 9 dictionary, for information only: reports and counts can say
 * whether STE approves a word. No rule depends on it, because the dictionary is copyrighted and
 * stays local in proposals/ste-writing-profile-2026-10-02/ste100/, which git ignores. Never copy
 * it into this package.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PartOfSpeech } from "./types";

/** The dictionary's part-of-speech codes. "phrase" marks the two entries the spec prints without one. */
export type StePartOfSpeech = "v" | "n" | "adj" | "adv" | "prep" | "conj" | "pron" | "art" | "phrase" | "prefix";

/** One dictionary entry: a headword with one part of speech. Field names match dictionary.json. */
export interface SteEntry {
  /**
   * As printed: UPPERCASE when approved, lowercase when not. Can hold a parenthetical, such as
   * "least (at least)".
   */
  headword: string;
  part_of_speech: StePartOfSpeech;
  status: "approved" | "unapproved";
  /** Approved entries only: the base form and its printed forms, such as "CLOSE, CLOSES, CLOSED". */
  approved_forms: string;
}

export const STE_DICTIONARY_ENV = "CODECAINE_STE_DICTIONARY";

const DEFAULT_PATH = resolve(import.meta.dir, "../../../../proposals/ste-writing-profile-2026-10-02/ste100/dictionary.json");

const CODES: Record<PartOfSpeech, StePartOfSpeech> = { verb: "v", noun: "n", adjective: "adj", adverb: "adv" };

/**
 * Loads the dictionary entries from `path`, else from $CODECAINE_STE_DICTIONARY, else from the
 * local research folder. Returns undefined when the file is missing, so callers can skip STE counts.
 */
export function loadSteDictionary(path?: string): SteEntry[] | undefined {
  const file = path ?? (process.env[STE_DICTIONARY_ENV] || DEFAULT_PATH);
  if (!existsSync(file)) return undefined;
  const data = JSON.parse(readFileSync(file, "utf8")) as { entries?: SteEntry[] };
  if (!Array.isArray(data.entries)) throw new Error(`${file} has no "entries" array`);
  return data.entries.map(({ headword, part_of_speech, status, approved_forms }) => ({
    headword,
    part_of_speech,
    status,
    approved_forms: approved_forms ?? "",
  }));
}

/**
 * STE's verdict on a word: "approved" when any entry approves it, "unapproved" when entries exist
 * but none approves it, and undefined when the dictionary does not list it. A word matches a
 * headword, a parenthetical phrase ("at least"), or an approved form ("newer"). `pos` narrows the
 * entries to one part of speech, because STE can approve the noun and reject the verb.
 */
export function steStatus(
  entries: readonly SteEntry[],
  word: string,
  pos?: PartOfSpeech | StePartOfSpeech,
): "approved" | "unapproved" | undefined {
  const code = pos === undefined ? undefined : steCode(pos);
  const matches = (wordIndex(entries).get(word.trim().toLowerCase()) ?? []).filter(
    (entry) => code === undefined || entry.part_of_speech === code,
  );
  if (matches.length === 0) return undefined;
  return matches.some((entry) => entry.status === "approved") ? "approved" : "unapproved";
}

function steCode(pos: PartOfSpeech | StePartOfSpeech): StePartOfSpeech {
  return (CODES as Record<string, StePartOfSpeech>)[pos] ?? (pos as StePartOfSpeech);
}

/** One lookup map per entries array, so a corpus-wide count does not rescan 2,000 entries per word. */
const indexes = new WeakMap<readonly SteEntry[], Map<string, SteEntry[]>>();

function wordIndex(entries: readonly SteEntry[]): Map<string, SteEntry[]> {
  let index = indexes.get(entries);
  if (index) return index;
  index = new Map();
  for (const entry of entries)
    for (const key of keysOf(entry)) {
      const list = index.get(key) ?? [];
      if (!list.includes(entry)) list.push(entry);
      index.set(key, list);
    }
  indexes.set(entries, index);
  return index;
}

/**
 * The lowercase words an entry stands for. A parenthetical is a full phrase ("least (at least)"),
 * a spelling ("MATT (or MATTE)"), or a complement ("prevent (from)" gives "prevent from").
 */
function keysOf(entry: SteEntry): string[] {
  const headword = entry.headword.toLowerCase();
  const base = headword.replace(/\s*\(.*?\)/g, "").trim();
  const keys = [base];
  for (const [, inner = ""] of headword.matchAll(/\(([^)]*)\)/g)) {
    const phrase = inner.trim();
    if (phrase.startsWith("or ")) keys.push(phrase.slice(3));
    else if (phrase.includes(base)) keys.push(phrase);
    else keys.push(`${base} ${phrase}`);
  }
  const forms = entry.approved_forms.toLowerCase().replace(/\balso\b/g, ",").split(/[,()]/);
  for (const form of forms) if (form.trim()) keys.push(form.trim());
  return keys;
}
