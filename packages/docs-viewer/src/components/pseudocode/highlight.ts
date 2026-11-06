/**
 * The pseudocode block's highlighter: its own highlight.js core instance with
 * only the pseudo grammar registered, so `pseudo` never becomes a language
 * the code block resolves. Output uses the same `.hljs-*` token classes the
 * code theme (styles/code.css) colours, plus `hljs-control` on control words
 * and `hljs-verb` on the action verb that opens a step.
 */

import hljs from "highlight.js/lib/core";
import { PSEUDO_CONTROL_WORDS, PSEUDO_LANGUAGE, pseudoGrammar, renderPseudoLines, type PseudoLine } from "./pseudo";

const highlighter = hljs.newInstance();
highlighter.registerLanguage(PSEUDO_LANGUAGE, pseudoGrammar);

const CONTROL = new Set(PSEUDO_CONTROL_WORDS);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** A step's opening verb follows the line start, an arrow, or a "then" or "else". */
const VERB_LEAD = /(?:^|-&gt;|=&gt;|(?:^|\s)(?:then|else))$/;
/** A verb is a verb only with a word after it: "set = 1" and "set.size" are names. */
const VERB_TAIL = /^ +(?!=)\S/;

/**
 * Keeps a keyword's color only where it starts a statement: the first word of
 * the line, the word after a `->` or `=>` arrow, or the word right after
 * another kept keyword (`else if`, `for each`). Anywhere else the word is
 * plain English, as in "the count for part.name" or "or 0 if missing", and
 * it stays plain text. Control words gain `hljs-control`.
 *
 * An action verb (`hljs-verb`) keeps its color only where it opens a step: at
 * the line start, after an arrow, or after "then" or "else", with a word after
 * it. So "set parent to …" and "if empty -> remove it" color the verb, and
 * "the set of names" or "set = 1" stay plain.
 */
function statementKeywords(html: string): string {
  let before = "";
  let afterKept = false;
  return html.replace(/<span class="hljs-(keyword|verb)">([^<]*)<\/span>|<[^>]*>|[^<]+/g, (token, kind: string | undefined, word: string | undefined, offset: number) => {
    if (word === undefined) {
      if (!token.startsWith("<")) {
        before += token;
        if (token.trim()) afterKept = false;
      }
      return token;
    }
    const lead = before.trimEnd();
    before += word;
    if (kind === "verb") {
      afterKept = false;
      return VERB_LEAD.test(lead) && VERB_TAIL.test(html.slice(offset + token.length)) ? token : word;
    }
    const keep = afterKept || lead === "" || lead.endsWith("-&gt;") || lead.endsWith("=&gt;");
    afterKept = keep;
    if (!keep) return word;
    return CONTROL.has(word) ? `<span class="hljs-keyword hljs-control">${word}</span>` : token;
  });
}

/** One code fragment to escaped token HTML, with keywords colored only where they start a statement. */
function highlightFragment(fragment: string): string {
  try {
    return statementKeywords(highlighter.highlight(fragment, { language: PSEUDO_LANGUAGE, ignoreIllegals: true }).value);
  } catch {
    return escapeHtml(fragment);
  }
}

/**
 * One rendered line per source line: trailing `// …` comments in one aligned
 * comment column and, with `diff`, the leading +/-/space column as a sign
 * gutter plus a per-line add/del mark (pseudo.ts renderPseudoLines). Each
 * line's code part is highlighted on its own — the grammar has no multi-line
 * tokens.
 */
export function highlightPseudoLines(code: string, diff: boolean): PseudoLine[] {
  return renderPseudoLines(code, { diff, escape: escapeHtml, highlight: highlightFragment });
}
