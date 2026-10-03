// Corpus vocabulary: n-gram technical terms, verb roots, synonym clusters, spelling/case variants.
// Input: raw/corpus-prose.json (from corpus-extract.ts). Output: raw/corpus-vocab.json + CSVs.
import { readFileSync, writeFileSync } from "node:fs";
import nlp from "compromise";
const RAW = "/tmp/ste-research/raw";
type Field = { blockId?: string; blockType?: string; field: string; text: string; paragraph: boolean };
const pages: { page: string; title: string; fields: Field[]; codeLiterals: string[] }[] = JSON.parse(
  readFileSync(`${RAW}/corpus-prose.json`, "utf8"),
);

const STOP = new Set(
  `a an the and or but if then else of to in on at by for with from into onto over under as is are was were be been being am do does did doing done have has had having it its it's this that these those there here which who whom whose what when where why how not no nor so than too very can could may might must shall should will would one ones each every all any some more most other such own same just only also both either neither via per vs e g i eg ie etc we you they he she i me my our your their them us up out about after before again further once off while because until during through between against above below without within across along around upon whether like rather instead yet still even ever never always often already now new use uses used using make makes made way ways get gets thing things two first second next last via s t don doesn isn aren won`.split(
    /\s+/,
  ),
);

function segments(text: string): string[] {
  // n-grams never cross a literal span or punctuation boundary.
  return text.toLowerCase().split(/[\u0000.,;:!?()"“”—–\[\]{}|*/=<>]+|\s-\s/);
}
function tokens(seg: string): string[] {
  return (seg.replace(/['\u2019]s\b/g, "").match(/[a-z][a-z0-9]*(?:['-][a-z0-9]+)*/g) ?? []);
}
const singular = (w: string) =>
  STOP.has(w) ? w : w.length > 3 && /s$/.test(w) && !/(ss|us|is|as|ous|ics|data)$/.test(w) ? w.replace(/ies$/, "y").replace(/(ches|shes|xes|sses)$/, (m) => m.slice(0, -2)).replace(/s$/, "") : w;

const uni = new Map<string, { n: number; pages: Set<string> }>();
const bi = new Map<string, { n: number; pages: Set<string> }>();
const tri = new Map<string, { n: number; pages: Set<string> }>();
const bump = (m: Map<string, { n: number; pages: Set<string> }>, k: string, page: string) => {
  const e = m.get(k) ?? { n: 0, pages: new Set() };
  e.n++;
  e.pages.add(page);
  m.set(k, e);
};
const allTokens: string[] = [];
for (const p of pages)
  for (const f of p.fields)
    for (const seg of segments(f.text)) {
      const t = tokens(seg);
      allTokens.push(...t);
      const s = t.map(singular);
      s.forEach((w) => !STOP.has(w) && w.length > 1 && bump(uni, w, p.page));
      for (let i = 0; i + 1 < s.length; i++)
        if (!STOP.has(s[i]) && !STOP.has(s[i + 1])) bump(bi, `${s[i]} ${s[i + 1]}`, p.page);
      for (let i = 0; i + 2 < s.length; i++)
        if (!STOP.has(s[i]) && !STOP.has(s[i + 1]) && !STOP.has(s[i + 2])) bump(tri, `${s[i]} ${s[i + 1]} ${s[i + 2]}`, p.page);
    }
const top = (m: Map<string, { n: number; pages: Set<string> }>, k: number, minPages = 1) =>
  [...m.entries()]
    .filter(([, v]) => v.pages.size >= minPages)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, k)
    .map(([term, v]) => ({ term, count: v.n, pages: v.pages.size }));

// Vocabulary size and coverage (surface lowercase, singularized).
const freq = new Map<string, number>();
for (const t of allTokens) freq.set(singular(t), (freq.get(singular(t)) ?? 0) + 1);
const sortedFreq = [...freq.values()].sort((a, b) => b - a);
const total = allTokens.length;
const coverage = (pct: number) => {
  let acc = 0;
  for (let i = 0; i < sortedFreq.length; i++) if ((acc += sortedFreq[i]) / total >= pct) return i + 1;
  return sortedFreq.length;
};
const hapax = sortedFreq.filter((n) => n === 1).length;

// Verb roots in use (candidate technical verbs + unapproved-verb discovery).
const verbRoots = new Map<string, { n: number; pages: Set<string> }>();
const nounRoots = new Map<string, { n: number; pages: Set<string> }>();
for (const p of pages)
  for (const f of p.fields) {
    const doc = nlp(f.text.replace(/\u0000+/g, " ; "));
    doc.compute("root");
    for (const s of doc.json()) for (const t of s.terms) {
      const tags: string[] = t.tags ?? [];
      const root = (t.root || t.normal || "").toLowerCase();
      if (!root || !/^[a-z][a-z-]*$/.test(root)) continue;
      if (tags.includes("Verb") && !tags.includes("Auxiliary") && !tags.includes("Copula") && !tags.includes("Modal")) bump(verbRoots, root, p.page);
      else if (tags.includes("Noun") && !tags.includes("Pronoun")) bump(nounRoots, singular(root), p.page);
    }
  }

// Synonym clusters: one concept, several words. Counted on prose only (literal spans already removed).
const CLUSTERS: Record<string, Record<string, RegExp>> = {
  "page unit": {
    page: /\bpages?\b/gi,
    "doc (singular noun)": /\bdoc\b(?![-.])/gi,
    "docs (plural/collective)": /\bdocs\b(?![-.])/gi,
    document: /\bdocuments?\b/gi,
    bundle: /\bbundles?\b/gi,
    article: /\barticles?\b/gi,
  },
  "block unit": {
    block: /\bblocks?\b/gi,
    component: /\bcomponents?\b/gi,
    element: /\belements?\b/gi,
    node: /\bnodes?\b/gi,
    widget: /\bwidgets?\b/gi,
  },
  "side file": {
    sidecar: /\bsidecars?\b/gi,
    asset: /\bassets?\b/gi,
    attachment: /\battachments?\b/gi,
    "companion file": /\bcompanion files?\b/gi,
    payload: /\bpayloads?\b/gi,
  },
  "lint result": {
    lint: /\blints?\b/gi,
    linter: /\blinters?\b/gi,
    rule: /\brules?\b/gi,
    check: /\bchecks?\b/gi,
    finding: /\bfindings?\b/gi,
    violation: /\bviolations?\b/gi,
    warning: /\bwarnings?\b/gi,
    diagnostic: /\bdiagnostics?\b/gi,
    issue: /\bissues?\b/gi,
  },
  "machine actor": {
    agent: /\bagents?\b/gi,
    model: /\bmodels?\b/gi,
    LLM: /\bLLMs?\b/g,
    AI: /\bAI\b/g,
    assistant: /\bassistants?\b/gi,
    worker: /\bworkers?\b/gi,
    Claude: /\bClaude\b/g,
    "sub-agent": /\bsub-?agents?\b/gi,
  },
  "human actor": {
    human: /\bhumans?\b/gi,
    user: /\busers?\b/gi,
    reader: /\breaders?\b/gi,
    author: /\bauthors?\b/gi,
    writer: /\bwriters?\b/gi,
    operator: /\boperators?\b/gi,
    "person/people": /\b(person|people)\b/gi,
    developer: /\bdevelopers?\b/gi,
    maintainer: /\bmaintainers?\b/gi,
  },
  "pending change": {
    proposal: /\bproposals?\b/gi,
    changeset: /\bchangesets?\b/gi,
    "change set": /\bchange[ -]sets?\b/gi,
    patch: /\bpatch(es)?\b/gi,
    diff: /\bdiffs?\b/gi,
    edit: /\bedits?\b/gi,
    op: /\bops?\b/gi,
    operation: /\boperations?\b/gi,
    mutation: /\bmutations?\b/gi,
  },
  "whole collection": {
    corpus: /\bcorpus|corpora\b/gi,
    "docs tree / doc tree": /\bdocs? tree\b/gi,
    "document tree": /\bdocument tree\b/gi,
    "docs root": /\bdocs root\b/gi,
    site: /\bsites?\b/gi,
    project: /\bprojects?\b/gi,
  },
  "grouping": {
    section: /\bsections?\b/gi,
    folder: /\bfolders?\b/gi,
    directory: /\bdirector(y|ies)\b/gi,
    chapter: /\bchapters?\b/gi,
    layer: /\blayers?\b/gi,
    group: /\bgroups?\b/gi,
  },
  "review note": {
    annotation: /\bannotations?\b/gi,
    comment: /\bcomments?\b/gi,
    note: /\bnotes?\b/gi,
    thread: /\bthreads?\b/gi,
    request: /\brequests?\b/gi,
    feedback: /\bfeedback\b/gi,
  },
  "reading UI": {
    viewer: /\bviewers?\b/gi,
    "reading surface": /\breading surface\b/gi,
    renderer: /\brenderers?\b/gi,
    preview: /\bpreviews?\b/gi,
    "human surface": /\bhuman surface\b/gi,
  },
  "editing UI": {
    workbench: /\bworkbench\b/gi,
    editor: /\beditors?\b/gi,
    studio: /\bstudio\b/gi,
    app: /\bapps?\b/gi,
  },
  "agent-facing output": {
    "agent surface": /\bagent surface\b/gi,
    "agent view": /\bagent views?\b/gi,
    "agent adapter": /\bagent adapters?\b/gi,
    "agent renderer": /\bagent renderers?\b/gi,
    projection: /\bprojections?\b/gi,
  },
  "block data": {
    props: /\bprops?\b/gi,
    state: /\bstates?\b/gi,
    data: /\bdata\b/gi,
    attribute: /\battributes?\b/gi,
    field: /\bfields?\b/gi,
    property: /\bpropert(y|ies)\b/gi,
  },
  "version marker": {
    hash: /\bhash(es)?\b/gi,
    revision: /\brevisions?\b/gi,
    version: /\bversions?\b/gi,
    baseline: /\bbaselines?\b/gi,
    snapshot: /\bsnapshots?\b/gi,
  },
  "written words": {
    prose: /\bprose\b/gi,
    text: /\btexts?\b/gi,
    copy: /\bcopy\b/gi,
    content: /\bcontents?\b/gi,
    body: /\bbod(y|ies)\b/gi,
  },
  "diagram": {
    canvas: /\bcanvas(es)?\b/gi,
    diagram: /\bdiagrams?\b/gi,
    board: /\bboards?\b/gi,
    figure: /\bfigures?\b/gi,
  },
  "invocable thing": {
    command: /\bcommands?\b/gi,
    tool: /\btools?\b/gi,
    action: /\bactions?\b/gi,
    endpoint: /\bendpoints?\b/gi,
    API: /\bAPIs?\b/g,
    method: /\bmethods?\b/gi,
  },
  "category word": {
    type: /\btypes?\b/gi,
    kind: /\bkinds?\b/gi,
    variant: /\bvariants?\b/gi,
    category: /\bcategor(y|ies)\b/gi,
    class: /\bclass(es)?\b/gi,
  },
  "label text": {
    heading: /\bheadings?\b/gi,
    title: /\btitles?\b/gi,
    header: /\bheaders?\b/gi,
    label: /\blabels?\b/gi,
    caption: /\bcaptions?\b/gi,
  },
  "pointer": {
    link: /\blinks?\b/gi,
    reference: /\breferences?\b/gi,
    ref: /\brefs?\b/gi,
    backlink: /\bbacklinks?\b/gi,
    "cross-link": /\bcross-?links?\b/gi,
  },
  "rulebook": {
    guidance: /\bguidance\b/gi,
    guide: /\bguides?\b/gi,
    standard: /\bstandards?\b/gi,
    "style guide": /\bstyle guides?\b/gi,
    convention: /\bconventions?\b/gi,
    principle: /\bprinciples?\b/gi,
    policy: /\bpolic(y|ies)\b/gi,
  },
};
const clusters: any[] = [];
const clusterCsv: string[] = ["cluster,variant,page,count"];
for (const [name, variants] of Object.entries(CLUSTERS)) {
  const perVariant: Record<string, { total: number; pages: number }> = {};
  const perPage: Record<string, Record<string, number>> = {};
  for (const [variant, re] of Object.entries(variants)) {
    let totalN = 0;
    let pageN = 0;
    for (const p of pages) {
      const n = p.fields.reduce((a, f) => a + (f.text.match(re)?.length ?? 0), 0);
      if (!n) continue;
      totalN += n;
      pageN++;
      (perPage[p.page] ??= {})[variant] = n;
      clusterCsv.push(`${JSON.stringify(name)},${JSON.stringify(variant)},${p.page},${n}`);
    }
    perVariant[variant] = { total: totalN, pages: pageN };
  }
  const mixed = Object.entries(perPage)
    .map(([page, v]) => ({ page, variants: Object.keys(v).length, counts: v }))
    .filter((x) => x.variants >= 3)
    .sort((a, b) => b.variants - a.variants || Object.values(b.counts).reduce((s, n) => s + n, 0) - Object.values(a.counts).reduce((s, n) => s + n, 0));
  clusters.push({ cluster: name, variants: perVariant, pagesMixing3Plus: mixed.length, topMixedPages: mixed.slice(0, 5) });
}

// Spelling variants: "a b" vs "a-b" vs "ab"; case variants for the same word mid-sentence.
const joinedText = pages.flatMap((p) => p.fields.map((f) => f.text)).join("\n");
const lower = joinedText.toLowerCase();
const spellVariants: any[] = [];
const seen = new Set<string>();
for (const m of lower.matchAll(/\b([a-z]{2,})-([a-z]{2,})\b/g)) {
  const key = `${m[1]} ${m[2]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const count = (re: RegExp) => lower.match(re)?.length ?? 0;
  const hy = count(new RegExp(`\\b${m[1]}-${m[2]}\\b`, "g"));
  const sp = count(new RegExp(`\\b${m[1]} ${m[2]}\\b`, "g"));
  const so = count(new RegExp(`\\b${m[1]}${m[2]}\\b`, "g"));
  if ([hy, sp, so].filter(Boolean).length >= 2) spellVariants.push({ hyphen: `${m[1]}-${m[2]}`, hy, space: sp, solid: so });
}
spellVariants.sort((a, b) => b.hy + b.space + b.solid - (a.hy + a.space + a.solid));
const caseVariants: any[] = [];
const caseMap = new Map<string, Map<string, number>>();
for (const m of joinedText.matchAll(/(?<=[a-z,] )([A-Za-z][a-zA-Z]+)\b/g)) {
  const w = m[1];
  const k = w.toLowerCase();
  const e = caseMap.get(k) ?? new Map();
  e.set(w, (e.get(w) ?? 0) + 1);
  caseMap.set(k, e);
}
for (const [k, forms] of caseMap)
  if (forms.size >= 2) {
    const arr = [...forms.entries()].sort((a, b) => b[1] - a[1]);
    const totalN = arr.reduce((s, [, n]) => s + n, 0);
    if (totalN >= 6 && arr[1][1] >= 2) caseVariants.push({ word: k, forms: Object.fromEntries(arr), total: totalN });
  }
caseVariants.sort((a, b) => b.total - a.total);

// Code literals: technical names that live in backticks.
const lit = new Map<string, { n: number; pages: Set<string> }>();
for (const p of pages) for (const c of p.codeLiterals) bump(lit, c.trim(), p.page);

const out = {
  stats: {
    pages: pages.length,
    tokens: total,
    distinctWords: freq.size,
    hapaxLegomena: hapax,
    wordsCovering80pct: coverage(0.8),
    wordsCovering90pct: coverage(0.9),
    wordsCovering95pct: coverage(0.95),
    distinctVerbRoots: verbRoots.size,
    distinctNounRoots: nounRoots.size,
  },
  unigrams: top(uni, 150),
  bigrams: top(bi, 120, 2),
  trigrams: top(tri, 60, 2),
  verbRoots: top(verbRoots, 150),
  nounRoots: top(nounRoots, 150),
  codeLiterals: top(lit, 80),
  clusters,
  spellVariants: spellVariants.slice(0, 60),
  caseVariants: caseVariants.slice(0, 60),
};
writeFileSync(`${RAW}/corpus-vocab.json`, JSON.stringify(out, null, 1));
writeFileSync(`${RAW}/corpus-synonym-clusters.csv`, clusterCsv.join("\n"));
const csv = (rows: any[], name: string) =>
  writeFileSync(`${RAW}/corpus-${name}.csv`, ["term,count,pages", ...rows.map((r) => `${JSON.stringify(r.term)},${r.count},${r.pages}`)].join("\n"));
csv(out.unigrams, "unigrams");
csv(out.bigrams, "bigrams");
csv(out.trigrams, "trigrams");
csv(out.verbRoots, "verb-roots");
console.log(JSON.stringify(out.stats));
