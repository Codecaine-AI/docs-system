// STE baseline: heuristic measurement of the current corpus against draft Codecaine STE rules.
// Reuses docs-model sentences()/wordCount(); compromise does POS + verb form (passive, perfect, progressive, imperative).
import { readFileSync, writeFileSync } from "node:fs";
import nlp from "compromise";
const REPO = "/Users/Ford/workspace/codecaine/core/docs-system";
const { sentences, wordCount } = await import(`${REPO}/packages/docs-model/src/writing/prose.ts`);
const RAW = "/tmp/ste-research/raw";
type Field = { blockId?: string; blockType?: string; field: string; text: string; paragraph: boolean };
const pages: { page: string; fields: Field[] }[] = JSON.parse(readFileSync(`${RAW}/corpus-prose.json`, "utf8"));

// Label fields are names, not sentences: length/voice/tense rules skip them; vocabulary and noun clusters still apply.
function isLabel(f: Field): boolean {
  if (f.blockType === "title" || f.blockType === "heading") return true;
  return /^props\.(title|columns\[|images\[\d+\]\.heading)|^props\.steps\[\d+\]\.name$/.test(f.field) && f.blockType !== "process-outline";
}

// Starter unapproved list (STE-style). replacement = approved alternative. kind: ste = STE-dictionary-style swap,
// filler = plain-language filler, latin = Latin abbreviation, vague = hedge/intensifier.
const UNAPPROVED: { term: string; re: RegExp; use: string; kind: string }[] = [
  ["utilize", /\butili[sz](e|es|ed|ing|ation)\b/gi, "use", "ste"],
  ["leverage", /\bleverag(e|es|ed|ing)\b/gi, "use", "ste"],
  ["facilitate", /\bfacilitat(e|es|ed|ing)\b/gi, "help / make possible", "ste"],
  ["ensure", /\bensur(e|es|ed|ing)\b/gi, "make sure", "ste"],
  ["prior to", /\bprior to\b/gi, "before", "ste"],
  ["in order to", /\bin order to\b/gi, "to", "filler"],
  ["approximately", /\bapproximately\b/gi, "about", "ste"],
  ["commence", /\bcommenc(e|es|ed|ing)\b/gi, "start", "ste"],
  ["terminate", /\bterminat(e|es|ed|ing)\b/gi, "stop / end", "ste"],
  ["initiate", /\binitiat(e|es|ed|ing)\b/gi, "start", "ste"],
  ["additional", /\badditional(ly)?\b/gi, "more / other", "ste"],
  ["numerous", /\bnumerous\b/gi, "many", "ste"],
  ["sufficient", /\bsufficient(ly)?\b/gi, "enough", "ste"],
  ["obtain", /\bobtain(s|ed|ing)?\b/gi, "get", "ste"],
  ["subsequently", /\bsubsequent(ly)?\b/gi, "then / after", "ste"],
  ["via", /\bvia\b/gi, "through / with / by", "ste"],
  ["regarding", /\bregarding\b/gi, "about", "ste"],
  ["in addition", /\bin addition( to)?\b/gi, "also / and", "ste"],
  ["thus", /\bthus\b/gi, "so", "ste"],
  ["hence", /\bhence\b/gi, "so", "ste"],
  ["whereas", /\bwhereas\b/gi, "but / while", "ste"],
  ["as well as", /\bas well as\b/gi, "and", "ste"],
  ["a number of", /\ba number of\b/gi, "some / many", "filler"],
  ["due to", /\bdue to\b/gi, "because of", "ste"],
  ["perform", /\bperform(s|ed|ing)?\b/gi, "do", "ste"],
  ["require", /\brequir(e|es|ed|ing)\b/gi, "need / must", "ste"],
  ["provide", /\bprovid(e|es|ed|ing)\b/gi, "give / supply", "ste"],
  ["indicate", /\bindicat(e|es|ed|ing)\b/gi, "show", "ste"],
  ["determine", /\bdetermin(e|es|ed|ing)\b/gi, "find / decide", "ste"],
  ["modify", /\bmodif(y|ies|ied|ying)\b/gi, "change", "ste"],
  ["attempt", /\battempt(s|ed|ing)?\b/gi, "try", "ste"],
  ["enable", /\benabl(e|es|ed|ing)\b/gi, "let / make possible", "ste"],
  ["allow", /\ballow(s|ed|ing)?\b/gi, "let", "ste"],
  ["appropriate", /\bappropriate(ly)?\b/gi, "correct / applicable", "ste"],
  ["various", /\bvarious\b/gi, "different / many", "ste"],
  ["multiple", /\bmultiple\b/gi, "many / more than one", "ste"],
  ["whether", /\bwhether\b/gi, "if", "ste"],
  ["simply / just / easily", /\b(simply|just|easily)\b/gi, "(delete)", "vague"],
  ["really / very / actually / basically", /\b(really|very|actually|basically)\b/gi, "(delete)", "vague"],
  ["e.g. / i.e. / etc.", /\b(e\.g\.|i\.e\.|etc\.)/gi, "for example / that is / (list all)", "latin"],
  ["and/or", /\band\/or\b/gi, "or / and", "ste"],
  ["may / might", /\b(may|might)\b/gi, "can (possibility) / (state the condition)", "ste"],
  ["should", /\bshould\b/gi, "must / (imperative)", "ste"],
].map(([term, re, use, kind]) => ({ term, re, use, kind })) as any;

const BE = "(?:is|are|was|were|be|been|being|am|'s|'re)";
// Regex cross-checks for compromise (it can miss participles after literal spans).
const PASSIVE_RE = new RegExp(`\\b${BE}(?:\\s+(?:not|never|also|only|always|still|then|already|now|usually|often|automatically|explicitly|directly))*\\s+(?:\\w+ed|written|built|given|taken|shown|known|seen|made|done|held|kept|found|set|put|run|read|sent|left|split|bound|drawn|chosen|hidden|broken|driven|frozen|rewritten|overwritten|undone|laid|paid|said|told|thought|brought|caught|led|lost|meant|met|spent|understood|won|cut|let|shut|spread|forbidden|forgotten|begun|stored|owned)\\b(?!\\s+(?:to|that)\\b)`, "gi");

type SentRec = { page: string; field: string; blockType?: string; text: string; words: number; wordsWithLiterals: number; procedural: boolean };
const sentRecs: SentRec[] = [];
type Hit = { page: string; rule: string; field: string; blockType?: string; evidence: string };
const hits: Hit[] = [];
const ruleIds = [
  "sentence>20 (procedural)",
  "sentence>25 (descriptive)",
  "sentence>20 (any)",
  "sentence>25 (any)",
  "sentence>30 (any, current lint)",
  "paragraph>6 sentences",
  "semicolon",
  "passive voice",
  "progressive -ing",
  "perfect tense",
  "noun cluster 4+ (strict)",
  "noun cluster 4+ (permissive)",
  "unapproved word",
  "any -ing verb form (info, STE 3.6)",
];
const perPage: Record<string, Record<string, number> & { sentences: number; words: number }> = {};
const unapprovedCounts: Record<string, { n: number; pages: Set<string>; use: string; kind: string }> = {};
const hit = (h: Hit) => {
  hits.push(h);
  perPage[h.page][h.rule] = (perPage[h.page][h.rule] ?? 0) + 1;
};
const FIRST_CLAUSE = /^(to|if|when|before|after|once|for|in|on|unless|while)\b[^,]{0,80},\s*/i;

for (const p of pages) {
  perPage[p.page] = { sentences: 0, words: 0 } as any;
  for (const f of p.fields) {
    const label = isLabel(f);
    // Unapproved vocabulary: every field.
    for (const u of UNAPPROVED) {
      const m = f.text.match(u.re);
      if (!m) continue;
      const e = (unapprovedCounts[u.term] ??= { n: 0, pages: new Set(), use: u.use, kind: u.kind });
      e.n += m.length;
      e.pages.add(p.page);
      for (const x of m) hit({ page: p.page, rule: "unapproved word", field: f.field, blockType: f.blockType, evidence: `${u.term}: ${x}` });
    }
    if (f.text.includes(";") && !label) hit({ page: p.page, rule: "semicolon", field: f.field, blockType: f.blockType, evidence: f.text.slice(0, 200) });
    const sents = sentences(f.text) as string[];
    if (f.paragraph && sents.length > 6) hit({ page: p.page, rule: "paragraph>6 sentences", field: f.field, blockType: f.blockType, evidence: `${sents.length} sentences: ${f.text.slice(0, 160)}` });
    for (const s of sents) {
      const plain = s.replace(/\u0000+/g, "Xlit");
      const doc = nlp(plain);
      const terms: { text: string; tags: string[] }[] = doc.json().flatMap((x: any) => x.terms.map((t: any) => ({ text: t.text, tags: t.tags, post: t.post })));
      // Noun clusters (labels included): strict = compromise Noun tags; permissive also accepts verb-tagged words sandwiched between nouns.
      const isNoun = (t: any) => t && t.tags.includes("Noun") && !t.tags.includes("Pronoun");
      const breakAfter = (t: any) => /[,;:.!?()\/|&\[\]"]/.test(t.post ?? "");
      const breakBefore = (t: any) => /[,;:.!?()\/|&\[\]"]/.test(t.pre ?? "");
      for (const mode of ["strict", "permissive"] as const) {
        let run: string[] = [];
        const flush = () => {
          if (run.length >= 4) hit({ page: p.page, rule: `noun cluster 4+ (${mode})`, field: f.field, blockType: f.blockType, evidence: run.join(" ") });
          run = [];
        };
        terms.forEach((t, i) => {
          const ok =
            isNoun(t) ||
            (mode === "permissive" && run.length > 0 && t.tags.includes("Verb") && !t.tags.includes("Auxiliary") && !t.tags.includes("Copula") && isNoun(terms[i + 1]) && !breakAfter(t));
          if (ok && breakBefore(t)) flush();
          if (ok) run.push(t.text);
          else flush();
          if (ok && breakAfter(t)) flush();
        });
        flush();
      }
      if (label) continue;
      const words = wordCount(s);
      const wordsWithLiterals = words + (s.match(/\u0000+/g)?.length ?? 0);
      const first = terms[0];
      // Leading verb is a real imperative only if no finite verb follows a noun run ("Code blocks hold ..." is descriptive).
      const imperativeAt = (ts: any[]) => {
        const t0 = ts[0];
        if (!t0 || !t0.tags.includes("Verb") || !(t0.tags.includes("Imperative") || t0.tags.includes("Infinitive"))) return false;
        let i = 1, sawNoun = false;
        while (i < ts.length && i < 10 && ((ts[i].tags.includes("Noun") && !ts[i].tags.includes("Pronoun")) || ts[i].tags.includes("Adjective") || /^(and|or)$/i.test(ts[i].text))) {
          if (ts[i].tags.includes("Noun")) sawNoun = true;
          i++;
        }
        const next = ts[i];
        return !(sawNoun && next && next.tags.includes("Verb") && next.tags.includes("PresentTense") && !next.tags.includes("Gerund"));
      };
      const afterClause = plain.replace(FIRST_CLAUSE, "");
      const afterTerms = afterClause !== plain ? (nlp(afterClause).json()[0]?.terms ?? []) : [];
      const procedural = wordCount(s) >= 3 && (imperativeAt(terms) || imperativeAt(afterTerms));
      sentRecs.push({ page: p.page, field: f.field, blockType: f.blockType, text: s, words, wordsWithLiterals, procedural });
      perPage[p.page].sentences++;
      perPage[p.page].words += words;
      const n = wordsWithLiterals; // STE counts a technical name as one word.
      if (n > 20) hit({ page: p.page, rule: "sentence>20 (any)", field: f.field, blockType: f.blockType, evidence: `${n}w: ${s}` });
      if (n > 25) hit({ page: p.page, rule: "sentence>25 (any)", field: f.field, blockType: f.blockType, evidence: `${n}w: ${s}` });
      if (words > 30) hit({ page: p.page, rule: "sentence>30 (any, current lint)", field: f.field, blockType: f.blockType, evidence: `${words}w: ${s}` });
      if (procedural && n > 20) hit({ page: p.page, rule: "sentence>20 (procedural)", field: f.field, blockType: f.blockType, evidence: `${n}w: ${s}` });
      if (!procedural && n > 25) hit({ page: p.page, rule: "sentence>25 (descriptive)", field: f.field, blockType: f.blockType, evidence: `${n}w: ${s}` });
      const verbs: any[] = doc.verbs().json().map((v: any) => ({ text: v.text, g: v.verb?.grammar ?? {} }));
      const passiveNlp = verbs.filter((v) => v.g.passive || /passive/.test(v.g.form ?? ""));
      const passiveRe = plain.match(PASSIVE_RE) ?? [];
      const passiveN = Math.max(passiveNlp.length, passiveRe.length);
      for (let i = 0; i < passiveN; i++) hit({ page: p.page, rule: "passive voice", field: f.field, blockType: f.blockType, evidence: `${(passiveNlp[i]?.text ?? passiveRe[i] ?? "").trim()} | ${s.slice(0, 160)}` });
      for (const t of terms.filter((t) => t.tags.includes("Gerund")))
        hit({ page: p.page, rule: "any -ing verb form (info, STE 3.6)", field: f.field, blockType: f.blockType, evidence: `${t.text} | ${s.slice(0, 120)}` });
      for (const v of verbs.filter((v) => v.g.progressive || /progressive/.test(v.g.form ?? "")))
        hit({ page: p.page, rule: "progressive -ing", field: f.field, blockType: f.blockType, evidence: `${v.text} | ${s.slice(0, 160)}` });
      for (const v of verbs.filter((v) => /perfect/.test(v.g.form ?? "") && /\b(has|have|had|'ve|'d)\b/i.test(v.text)))
        hit({ page: p.page, rule: "perfect tense", field: f.field, blockType: f.blockType, evidence: `${v.text} | ${s.slice(0, 160)}` });
    }
  }
}

// Totals, rule ranking, length distribution, page ranking.
const pct = (arr: number[], q: number) => {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};
const lens = sentRecs.map((s) => s.wordsWithLiterals);
const proc = sentRecs.filter((s) => s.procedural);
const desc = sentRecs.filter((s) => !s.procedural);
const dist = (arr: SentRec[]) => {
  const l = arr.map((s) => s.wordsWithLiterals);
  return {
    n: l.length,
    mean: +(l.reduce((a, b) => a + b, 0) / Math.max(1, l.length)).toFixed(1),
    p50: pct(l, 0.5), p75: pct(l, 0.75), p90: pct(l, 0.9), p95: pct(l, 0.95), max: Math.max(...l),
    over15: l.filter((n) => n > 15).length, over20: l.filter((n) => n > 20).length, over25: l.filter((n) => n > 25).length, over30: l.filter((n) => n > 30).length,
  };
};
const ruleTotals = Object.fromEntries(ruleIds.map((r) => [r, hits.filter((h) => h.rule === r).length]));
const rulePages = Object.fromEntries(ruleIds.map((r) => [r, new Set(hits.filter((h) => h.rule === r).map((h) => h.page)).size]));
const ruleByBlockType: Record<string, Record<string, number>> = {};
for (const h of hits) (ruleByBlockType[h.rule] ??= {})[h.blockType ?? "?"] = (ruleByBlockType[h.rule]?.[h.blockType ?? "?"] ?? 0) + 1;
// Composite score excludes redundant variants (>20 any, >25 any, >30 lint, permissive cluster).
const SCORED = ["sentence>20 (procedural)", "sentence>25 (descriptive)", "paragraph>6 sentences", "semicolon", "passive voice", "progressive -ing", "perfect tense", "noun cluster 4+ (strict)", "unapproved word"];
const pageRows = Object.entries(perPage).map(([page, r]) => {
  const total = SCORED.reduce((a, k) => a + (r[k] ?? 0), 0);
  return { page, sentences: r.sentences, words: r.words, total, per100Sentences: r.sentences ? +((100 * total) / r.sentences).toFixed(1) : 0, ...Object.fromEntries(SCORED.map((k) => [k, r[k] ?? 0])) };
});
const topAbs = [...pageRows].sort((a, b) => b.total - a.total).slice(0, 10);
const topRate = [...pageRows].filter((r) => r.sentences >= 30).sort((a, b) => b.per100Sentences - a.per100Sentences).slice(0, 10);
const unapproved = Object.entries(unapprovedCounts)
  .map(([term, v]) => ({ term, count: v.n, pages: v.pages.size, use: v.use, kind: v.kind }))
  .sort((a, b) => b.count - a.count);
const examples = Object.fromEntries(ruleIds.map((r) => [r, hits.filter((h) => h.rule === r).slice(0, 12).map((h) => `${h.page} :: ${h.evidence.slice(0, 220)}`)]));
// Most common strict noun clusters.
const clusterFreq = new Map<string, number>();
for (const h of hits.filter((h) => h.rule === "noun cluster 4+ (strict)")) clusterFreq.set(h.evidence.toLowerCase(), (clusterFreq.get(h.evidence.toLowerCase()) ?? 0) + 1);

const out = {
  corpus: { pages: pages.length, sentences: sentRecs.length, procedural: proc.length, descriptive: desc.length, words: sentRecs.reduce((a, s) => a + s.words, 0) },
  lengthDistribution: { all: dist(sentRecs), procedural: dist(proc), descriptive: dist(desc) },
  lengthByBlockType: Object.fromEntries([...new Set(sentRecs.map((s) => s.blockType ?? "?"))].map((bt) => [bt, dist(sentRecs.filter((s) => s.blockType === bt))])),
  paragraphSentenceCounts: (() => {
    const counts = pages.flatMap((p) => p.fields.filter((f) => f.paragraph).map((f) => sentences(f.text).length));
    return { paragraphs: counts.length, p50: pct(counts, 0.5), p90: pct(counts, 0.9), max: Math.max(...counts), over4: counts.filter((n) => n > 4).length, over6: counts.filter((n) => n > 6).length };
  })(),
  ruleTotals,
  rulePages,
  ruleByBlockType,
  unapproved,
  topPagesAbsolute: topAbs,
  topPagesPer100Sentences: topRate,
  topNounClusters: [...clusterFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
  examples,
};
writeFileSync(`${RAW}/corpus-ste-baseline.json`, JSON.stringify(out, null, 1));
writeFileSync(`${RAW}/corpus-ste-hits.json`, JSON.stringify(hits, null, 0));
const cols = ["page", "sentences", "words", "total", "per100Sentences", ...SCORED];
writeFileSync(`${RAW}/corpus-ste-pages.csv`, [cols.join(","), ...pageRows.sort((a, b) => b.total - a.total).map((r: any) => cols.map((c) => JSON.stringify(r[c])).join(","))].join("\n"));
writeFileSync(`${RAW}/corpus-ste-sentences.csv`, ["page,blockType,procedural,words,wordsWithLiterals,text", ...sentRecs.map((s) => [s.page, s.blockType, s.procedural, s.words, s.wordsWithLiterals, JSON.stringify(s.text.replace(/\u0000+/g, "`…`"))].join(","))].join("\n"));
console.log(JSON.stringify({ corpus: out.corpus, ruleTotals, dist: out.lengthDistribution.all }, null, 1));
