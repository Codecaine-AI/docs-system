/** Minor words stay lowercase inside a title. Prepositions of four letters or more are capitalized. */
const minor = new Set(
  "a an the and but or nor for so yet as at by in of on to up via per vs versus".split(
    " ",
  ),
);
/** A lowercase-led word with an inner capital, underscore, dot, slash, parenthesis or colon reads as code. */
const identifier = /^\p{Ll}[\p{L}\p{N}]*\p{Lu}|[_./()#:=<>]/u;
export interface TitleCaseOptions {
  /** Leave unmarked code-looking words such as `spawnAgent` alone instead of flagging them. */
  skipIdentifiers?: boolean;
}
/** Literal spans become one placeholder so adjoining prose cannot form a false word. */
const LITERAL = "\u0000";
function breaks(token: string, i: number, count: number, options: TitleCaseOptions): string | undefined {
  if (!/^\p{Ll}/u.test(token) || /^v\d/.test(token)) return undefined;
  const word = token.replace(/[^\p{L}\p{N}]+$/u, "");
  if (options.skipIdentifiers && identifier.test(word)) return undefined;
  const edge = i === 0 || i === count - 1;
  return minor.has(word.split("-")[0]!) && !edge ? undefined : word;
}
/**
 * Words that break Title Case in prose text (code spans already replaced by a
 * placeholder). Code spans, numbers, versions like v2 and words that start with
 * punctuation or a capital (acronyms) are skipped. A hyphenated word checks its first part.
 */
export function titleCaseViolations(text: string, options: TitleCaseOptions = {}): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.flatMap((token, i) => {
    const word = breaks(token, i, tokens.length, options);
    return word === undefined ? [] : [word];
  });
}
/**
 * Raw text rewritten in Title Case: every word titleCaseViolations would flag gets
 * a capital first letter. Backtick spans and whitespace are kept byte for byte.
 */
export function toTitleCase(text: string, options: TitleCaseOptions = {}): string {
  const literals: string[] = [];
  const masked = text.replace(/(`+)[\s\S]*?\1/g, (span) => {
    literals.push(span);
    return LITERAL;
  });
  const parts = masked.split(/(\s+)/);
  const words = parts.flatMap((part, i) => (i % 2 === 0 && part ? [i] : []));
  for (const [n, i] of words.entries())
    if (breaks(parts[i]!, n, words.length, options) !== undefined)
      parts[i] = parts[i]!.charAt(0).toUpperCase() + parts[i]!.slice(1);
  let next = 0;
  return parts.join("").replace(/\u0000/g, () => literals[next++]!);
}
