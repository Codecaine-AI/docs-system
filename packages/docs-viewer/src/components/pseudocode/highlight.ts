/**
 * The pseudocode block's highlighter: its own highlight.js core instance with
 * only the pseudo grammar registered, so `pseudo` never becomes a language
 * the code block resolves. Output uses the same `.hljs-*` token classes the
 * code theme (styles/code.css) colours, plus `hljs-control` on control words.
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

/** One code fragment to escaped token HTML; control words gain `hljs-control`. */
function highlightFragment(fragment: string): string {
  try {
    return highlighter
      .highlight(fragment, { language: PSEUDO_LANGUAGE, ignoreIllegals: true })
      .value.replace(/<span class="hljs-keyword">([^<]*)<\/span>/g, (span, word: string) =>
        CONTROL.has(word) ? `<span class="hljs-keyword hljs-control">${word}</span>` : span,
      );
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
