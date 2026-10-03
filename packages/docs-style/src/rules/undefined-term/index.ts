/**
 * STE 1.8: define or link each internal term at its first use on a page. Advisory: it never
 * triggers a rewrite. Code finds the candidate terms and keeps those the block uses first on
 * the page. Jev decides whether a new reader would know them and whether the block explains them.
 */
import { docBlockOrder, type DocBlock, type DocDocument } from "@codecaine-ai/docs-model";
import { nearestHeading } from "../../text/context";
import { blockMarkdown, sentences } from "../../text";
import type { StyleRule } from "../../types";

const ACRONYM = /\b[A-Z][A-Z0-9]*[A-Z][A-Z0-9]*s?\b/g;
const CAMEL_CASE = /\b(?:[a-z]+[A-Z]|[A-Z][a-z0-9]+[A-Z])[A-Za-z0-9]*\b/g;
/** Two or more capitalized words in a row, after the first word of the sentence. */
const NAME = /(?<=\S\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
/** Terms every technical reader knows. Asking about them only adds noise. */
const COMMON = new Set([
  "AI", "API", "APIs", "CI", "CLI", "CPU", "CSS", "GPU", "HTML", "HTTP", "HTTPS", "ID", "IDs", "IDE", "JSON", "OK", "OS",
  "PDF", "PDFs", "README", "SDK", "SQL", "UI", "URL", "URLs", "UTF", "XML", "YAML", "GitHub", "JavaScript", "TypeScript", "macOS", "iOS",
]);

/**
 * A block's own prose with code, reference, and link spans masked, because their markup already
 * marks or links them. With `maskBold`, bold spans are masked too: a bold label is Title Case by
 * house style, so its capitalized words are not a name.
 */
function plainProse(block: DocBlock | undefined, maskBold: boolean): string {
  return (block?.text ?? [])
    .map(({ insert, attributes: a }) => (a?.code || a?.reference || a?.link || (maskBold && a?.bold) ? "\u0000" : insert))
    .join("");
}

function candidateTerms(block: DocBlock | undefined): string[] {
  const found = new Set<string>();
  const matches = (text: string, patterns: RegExp[]) => {
    for (const sentence of sentences(text)) for (const pattern of patterns) for (const match of sentence.matchAll(pattern)) found.add(match[0]);
  };
  matches(plainProse(block, false), [ACRONYM, CAMEL_CASE]);
  matches(plainProse(block, true), [NAME]);
  return [...found].filter((term) => !COMMON.has(term));
}

const markdownByDoc = new WeakMap<DocDocument, { order: string[]; markdown: string[] }>();
/**
 * Every block's markdown in document order, cached per document. Headings read as "": a heading
 * names a term, and the prose under it is where the term needs its definition.
 */
function pageMarkdown(doc: DocDocument) {
  let page = markdownByDoc.get(doc);
  if (!page) {
    const order = docBlockOrder(doc);
    page = { order, markdown: order.map((id) => (doc.blocks[id]?.type === "heading" ? "" : blockMarkdown(doc.blocks[id]))) };
    markdownByDoc.set(doc, page);
  }
  return page;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The candidate terms a block uses for the first time on its page. A term an earlier block
 * already uses, even inside a link or code span, was introduced there, so only its first use is
 * worth a question.
 */
function termsAtFirstUse(doc: DocDocument, id: string): string[] {
  const candidates = candidateTerms(doc.blocks[id]);
  if (!candidates.length) return [];
  const { order, markdown } = pageMarkdown(doc);
  const earlier = markdown.slice(0, Math.max(0, order.indexOf(id))).join("\n");
  return candidates.filter((term) => !new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`).test(earlier));
}

export const undefinedTermRule: StyleRule = {
  id: "ste.undefined-term",
  layer: "vocabulary",
  docsPath: "99-appendix/10-style-guide/30-ste-profile",
  summary: "Define or link each internal term at its first use on a page (STE 1.8).",
  hint: "At the term's first use, define it in a few words or link it to the page that defines it.",
  judge: {
    appliesTo: ["paragraph", "list-item"],
    select: (doc, id) => termsAtFirstUse(doc, id).length > 0,
    state: (doc, id) => ({ heading: nearestHeading(doc, id), block: blockMarkdown(doc.blocks[id]), terms: termsAtFirstUse(doc, id) }),
    // Calibrated on 10 pages (38 blocks). Asked whether the page start defines "an internal term",
    // Jev said yes to almost every block (p50 0.86). Naming the candidates and checking first use
    // in code leaves Jev one judgment: would a new reader know the name? Unexpanded acronyms
    // score highest. Internal product names score lower, so this advisory rule misses some.
    question:
      "Is any name in `terms` an unexpanded acronym or an internal project name that a new reader would not know, and that `block` does not define? Common technical words and well-known products are known.",
    threshold: 0.8,
    message: "An internal term is not defined or linked at its first use.",
  },
};
