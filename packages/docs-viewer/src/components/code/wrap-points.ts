/**
 * Break points for a wrapping READ code line (CodeAnnotations.tsx). A long
 * line wraps like text, so without help the browser breaks at a hyphen
 * (`non-` / `empty`), inside a short string (`", "`), or anywhere inside a
 * long run with no space (`fileURL` / `ToPath`). These rewrites of one line's
 * highlighted HTML steer the break to token boundaries. They add only <wbr>
 * and nowrap spans, so the line's text, and what a reader copies, stay the
 * same.
 */

/** Keeps a hyphenated word (`non-empty`, `--workspace`) or a short string on one row, and keeps its spaces as written. */
const NOWRAP = "whitespace-pre";

/** A string literal this short, quotes and entities included, never splits. */
const SHORT_STRING_CHARS = 16;

/** A hyphenated word this long can still split, so it never overflows the row. */
const HYPHEN_WORD_CHARS = 32;

const SHORT_STRING = new RegExp(`<span class="hljs-string">([^<]{1,${SHORT_STRING_CHARS}})</span>`, "g");
const HYPHEN_WORD = /(?:--?)?[A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*/g;

/** Text outside tags: hyphenated words stay whole, and a break may follow . ( , [ { where no space does. */
function breakText(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(HYPHEN_WORD)) {
    const word = match[0];
    if (!word.includes("-") || word.length > HYPHEN_WORD_CHARS) continue;
    out += addBreaks(text.slice(last, match.index)) + `<span class="${NOWRAP}">${word}</span>`;
    last = match.index + word.length;
  }
  return out + addBreaks(text.slice(last));
}

/** A <wbr> after each . ( , [ { that a non-space character follows. */
function addBreaks(text: string): string {
  return text.replace(/([.(,[{])(?=[^\s.(,[{])/g, "$1<wbr>");
}

/** One highlighted line's HTML with break points at token boundaries. */
export function withWrapPoints(html: string): string {
  return html
    .replace(SHORT_STRING, `<span class="hljs-string ${NOWRAP}">$1</span>`)
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : breakText(part)))
    .join("");
}
