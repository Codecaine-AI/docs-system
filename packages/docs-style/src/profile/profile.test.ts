import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exemptionsFor,
  loadSteDictionary,
  modals,
  namingCanon,
  profileFor,
  replacements,
  STE_DICTIONARY_ENV,
  steStatus,
  technicalNouns,
  technicalVerbs,
  thresholds,
} from "./index";

const finds = replacements.map((row) => row.find);

describe("replacements", () => {
  test("each word has one source: a find appears once, and modal verbs stay in modals", () => {
    expect(finds.filter((find, i) => finds.indexOf(find) !== i)).toEqual([]);
    expect(finds.filter((find) => modals.some((modal) => modal.word === find))).toEqual([]);
  });

  test("rows follow the tier conventions", () => {
    const broken = replacements.filter(
      (row) =>
        row.find !== row.find.toLowerCase() ||
        (row.tier === "pos" && !row.pos) ||
        (row.tier === "autofix" && row.replace.includes(" | ")) ||
        (row.tier === "autofix" && row.replace === "" && row.category !== "filler"),
    );
    expect(broken).toEqual([]);
  });

  test("allowed vocabulary is never on the deny list", () => {
    const allowed = new Set(
      [...technicalVerbs, ...technicalNouns].map((term) => term.term).concat(namingCanon.map((group) => group.use.toLowerCase())),
    );
    expect(finds.filter((find) => allowed.has(find))).toEqual([]);
  });

  test("no fix writes a word that a row flags, so a fix never adds a finding", () => {
    const denied = new Set(finds);
    // "needs", "needed", and "required" are inflections of the finds "need" and "require".
    const isDenied = (phrase: string) => [phrase, ...["s", "d", "ed"].map((end) => phrase.replace(new RegExp(`${end}$`), ""))].some((p) => denied.has(p));
    const phrasesOf = (option: string) => {
      const words = option.toLowerCase().split(/\s+/).filter(Boolean);
      return words.flatMap((_, start) => words.slice(start).map((_, length) => words.slice(start, start + length + 1).join(" ")));
    };
    const offenders = replacements.flatMap((row) =>
      row.replace.split(" | ").flatMap(phrasesOf).filter(isDenied).map((phrase) => `${row.find} -> ${phrase}`),
    );
    expect(offenders).toEqual([]);
  });
});

test("naming groups never list their own name as a name to avoid", () => {
  const broken = namingCanon.filter(
    (group) => group.avoid.includes(group.use.toLowerCase()) || group.avoid.some((name) => name !== name.toLowerCase()),
  );
  expect(broken).toEqual([]);
});

test("thresholds match the STE Profile and Style Enforcement pages", () => {
  expect(thresholds).toEqual({
    proceduralSentenceWords: 20,
    descriptiveSentenceWords: 25,
    paragraphSentences: 4,
    nounClusterNouns: 3,
    shrinkLimit: 0.2,
    rewriteRejectLimit: 0.1,
  });
});

describe("corpus scope", () => {
  test("every habit row, filler row, and naming group declares the corpora it applies to", () => {
    const unscoped = [
      ...replacements.filter((row) => row.origin !== "style-guides" && !row.scope).map((row) => row.find),
      ...namingCanon.filter((group) => !group.scope).map((group) => group.use),
    ];
    expect(unscoped).toEqual([]);
  });

  test("profileFor keeps docs-system vocabulary in docs-system, under its name or its registry ID", () => {
    for (const corpus of ["docs-system", "docs-system-a4e68acd"]) {
      expect(profileFor(corpus).replacements).toHaveLength(replacements.length);
      expect(profileFor(corpus).namingCanon).toHaveLength(namingCanon.length);
    }
    for (const corpus of ["canvas", "agent-kernel-c2f971d5", undefined]) {
      const finds = new Set(profileFor(corpus).replacements.map((row) => row.find));
      // Style-guide and house rows apply everywhere. Elsewhere, "thread" names a Discord thread.
      expect([finds.has("in order to"), finds.has("sub agent"), finds.has("subagent"), finds.has("thread")]).toEqual([true, true, false, false]);
      expect(profileFor(corpus).namingCanon.filter((group) => group.scope === "docs-system")).toEqual([]);
    }
  });

  test("a row skips each corpus that keeps its word as a term, under the corpus name or ID", () => {
    const keepsPurchase = (corpus?: string) => profileFor(corpus).replacements.some((row) => row.find === "purchase");
    expect(["network-setup", "Network Setup", "network-setup-1a2b3c4d", "canvas", "docs-system"].map(keepsPurchase)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  test("exemptionsFor protects a corpus under its name or ID, and every section when the corpus is unknown", () => {
    const pagesFor = (corpus?: string) => exemptionsFor(corpus).sections.map((section) => section.page);
    expect(exemptionsFor("Personal Site Writing").corpus?.tiers).toBe("all");
    expect(exemptionsFor("personal-site-writing-38daf15d").corpus?.tiers).toBe("all");
    expect(exemptionsFor("docs-system").corpus).toBeUndefined();
    expect(pagesFor("docs-system")).toContain("00-foundation/00-manifesto");
    expect(pagesFor("canvas")).not.toContain("00-foundation/00-manifesto");
    expect(pagesFor(undefined)).toContain("00-foundation/00-manifesto");
    expect(pagesFor(" ")).toContain("00-foundation/00-manifesto");
  });
});

describe("local STE dictionary", () => {
  let dir = "";
  let file = "";
  const entry = (headword: string, part_of_speech: string, approved_forms = "") => ({
    headword,
    part_of_speech,
    status: headword === headword.toUpperCase() ? "approved" : "unapproved",
    approved_forms,
    senses: [{ sense: 1, row_type: "meaning", meaning: "", alternatives: "" }],
  });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ste-dictionary-"));
    file = join(dir, "dictionary.json");
    const entries = [
      entry("NEW", "adj", "NEW, NEWER, NEWEST"),
      entry("DISPLAY", "n"),
      entry("display", "v"),
      entry("least (at least)", "adv"),
      entry("utilize", "v"),
    ];
    writeFileSync(file, JSON.stringify({ title: "fixture", entries }));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("loadSteDictionary reads the path, then the env var, and is undefined for a missing file", () => {
    expect(loadSteDictionary(file)?.map((e) => `${e.headword}/${e.part_of_speech}/${e.status}`)).toEqual([
      "NEW/adj/approved",
      "DISPLAY/n/approved",
      "display/v/unapproved",
      "least (at least)/adv/unapproved",
      "utilize/v/unapproved",
    ]);
    const previous = process.env[STE_DICTIONARY_ENV];
    process.env[STE_DICTIONARY_ENV] = file;
    try {
      expect(loadSteDictionary()).toHaveLength(5);
    } finally {
      if (previous === undefined) delete process.env[STE_DICTIONARY_ENV];
      else process.env[STE_DICTIONARY_ENV] = previous;
    }
    expect(loadSteDictionary(join(dir, "missing.json"))).toBeUndefined();
  });

  test("steStatus matches headwords, phrases, and approved forms by part of speech", () => {
    const entries = loadSteDictionary(file) ?? [];
    expect(steStatus(entries, "newer")).toBe("approved");
    expect(steStatus(entries, "Display")).toBe("approved");
    expect(steStatus(entries, "display", "verb")).toBe("unapproved");
    expect(steStatus(entries, "display", "n")).toBe("approved");
    expect(steStatus(entries, "at least")).toBe("unapproved");
    expect(steStatus(entries, "utilize", "noun")).toBeUndefined();
    expect(steStatus(entries, "render")).toBeUndefined();
  });
});
