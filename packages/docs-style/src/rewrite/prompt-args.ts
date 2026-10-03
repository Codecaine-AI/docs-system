/**
 * A RewriteRequest to RewriteBlock arguments. Findings and flagged sentences come in proseText
 * form, where each code or reference span is one "\u0000". The model reads the masked block, so
 * each sentence or phrase is shown as the exact slice of the masked block it came from.
 */
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import type { RewriteContext, RewriteFinding, RewriteToken } from "../../baml_client/types";
import type { ProtectedToken, RewriteRequest } from "../types";

export interface PromptArgs {
  blockType: string;
  markdown: string;
  findings: RewriteFinding[];
  flaggedSentences: string[];
  nearby: RewriteContext;
  tokens: RewriteToken[];
  allowList: boolean;
}

/** A phrase this short is worth quoting in a finding's "where" line. */
const PHRASE_LIMIT = 60;
const CONTEXT_LIMIT = 400;

export function promptArgs(request: RewriteRequest): PromptArgs {
  const locate = locator(request.markdown, request.tokens);
  const flagged = [...new Set(request.flaggedSentences.map((sentence) => locate(sentence) ?? readable(sentence)))];
  const findings = request.findings.map((finding) => ({
    rule_id: finding.ruleId,
    message: readable(finding.message),
    hint: readable(finding.hint),
    target: target(finding, flagged, locate, request.markdown),
  }));
  const { heading, previous, next, parent } = request.context;
  return {
    blockType: request.blockType,
    markdown: request.markdown,
    findings,
    flaggedSentences: flagged,
    nearby: { heading: clip(heading), previous: clip(previous), next: clip(next), parent: clip(parent) },
    tokens: request.tokens.map(({ token, kind, preview }) => ({ token, kind, preview })),
    allowList: request.allowList,
  };
}

/** Where a finding sits: a quoted phrase, a flagged sentence number, both, or the whole block. */
function target(
  finding: RewriteRequest["findings"][number],
  flagged: string[],
  locate: (text: string) => string | undefined,
  markdown: string,
): string {
  const sentence = finding.sentence ? (locate(finding.sentence) ?? readable(finding.sentence)) : undefined;
  const number = sentence ? flagged.indexOf(sentence) + 1 : 0;
  const place = number > 0 ? `flagged sentence ${number}` : sentence ? `the sentence "${sentence}"` : "";
  const evidence = finding.evidence.trim() ? (locate(finding.evidence.trim()) ?? readable(finding.evidence.trim())) : "";
  const phrase = evidence && evidence.length <= PHRASE_LIMIT && evidence !== sentence && evidence !== markdown.trim() ? `"${evidence}"` : "";
  if (phrase && place) return `${phrase} in ${place}`;
  return phrase || place || "the whole block";
}

/**
 * Finds proseText (or already masked) text in the masked block and returns that slice of the
 * block. The masked block is read the way proseText reads spans: a code or reference token is
 * "\u0000", a link or literal token is its text, and markdown marks drop out.
 */
function locator(markdown: string, tokens: readonly ProtectedToken[]): (text: string) => string | undefined {
  const proseOf = new Map(tokens.map((token) => [token.token, tokenProse(token)]));
  let prose = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const emit = (text: string, start: number, end: number) => {
    for (let i = 0; i < text.length; i += 1) {
      prose += text[i];
      starts.push(start);
      ends.push(end);
    }
  };
  const tokenAt = /⟦\d+⟧/y;
  for (let at = 0; at < markdown.length; ) {
    tokenAt.lastIndex = at;
    const token = tokenAt.exec(markdown)?.[0];
    if (token && proseOf.has(token)) {
      emit(proseOf.get(token)!, at, at + token.length);
      at += token.length;
    } else if (markdown.startsWith("**", at) || markdown.startsWith("~~", at)) {
      at += 2;
    } else if (markdown[at] === "*") {
      at += 1;
    } else {
      emit(markdown[at]!, at, at + 1);
      at += 1;
    }
  }

  return (text) => {
    if (!text) return undefined;
    if (markdown.includes(text)) return text;
    const found = prose.indexOf(text);
    if (found === -1) return undefined;
    let start = starts[found]!;
    let end = ends[found + text.length - 1]!;
    // Take the marks that open or close right at the edges, so a bold sentence keeps both "**".
    while (start > 0 && "*~".includes(markdown[start - 1]!)) start -= 1;
    while (end < markdown.length && "*~".includes(markdown[end]!)) end += 1;
    return markdown.slice(start, end);
  };
}

/** A token as proseText sees it: code and reference spans are "\u0000", other spans keep their text. */
function tokenProse(token: ProtectedToken): string {
  const spans = JSON.parse(token.original) as DeltaSpan[];
  return spans.map((span) => (span.attributes?.code || span.attributes?.reference ? "\u0000" : span.insert)).join("");
}

/** Text the model can read: a literal-span marker it cannot map to a token becomes "…". */
function readable(text: string): string {
  return text.replace(/\u0000+/g, "…");
}

function clip(text: string | undefined): string | undefined {
  const value = text ? readable(text).replace(/\s+/g, " ").trim() : "";
  if (!value) return undefined;
  return value.length > CONTEXT_LIMIT ? `${value.slice(0, CONTEXT_LIMIT - 1)}…` : value;
}
