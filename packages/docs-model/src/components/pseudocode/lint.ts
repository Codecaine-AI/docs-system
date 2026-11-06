import type { LintRule } from "../../lint/types";

/**
 * Source-language syntax that a pseudocode line spells out in words instead, each with the words to use.
 * A `->` arrow, a call and `.field` access stay: the viewer highlights them as pseudocode.
 */
const CODE_SYNTAX: readonly { pattern: RegExp; label: string; words: string }[] = [
  { pattern: /[=!]==?/, label: "==, ===, != or !==", words: "is or is not" },
  { pattern: /&&|\|\|/, label: "&& or ||", words: "and or or" },
  { pattern: /\?\?/, label: "??", words: "\"or 0 when it is missing\"" },
  { pattern: /\?\./, label: "?.", words: "\"if there is one\"" },
  { pattern: /[+\-*/]=|\+\+/, label: "+=, -= or ++", words: "\"add 1 to the count\"" },
  { pattern: /\{\s*[A-Za-z_]\w*\s*:/, label: "an object literal", words: "\"a span with the text and the code attribute\"" },
  { pattern: /[\w\]]\[\d+\]/, label: "a numeric index such as [0]", words: "\"the first capture group\"" },
  { pattern: /;\s*$/, label: "a trailing ;", words: "the step alone" },
];

/** A line with its double-quoted strings and its trailing `//` comment removed, so only code is checked. Strings have no escapes, as in the viewer. */
export function pseudocodeCodePart(line: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') { inString = !inString; out += " "; continue; }
    if (inString) { out += " "; continue; }
    if (char === "/" && line[index + 1] === "/") break;
    out += char;
  }
  return out;
}

/** The labels of the source-language syntax that one pseudocode line uses, outside its strings and comment. */
export function pseudocodeSyntaxIn(line: string): string[] {
  const code = pseudocodeCodePart(line);
  return CODE_SYNTAX.filter((s) => s.pattern.test(code)).map((s) => s.label);
}

/**
 * Pseudocode explains logic without the noise of real syntax, so a reader who does not know the source
 * language can follow it. Quality climb round 0 (pseudocode lane): all 4 judges scored plain-language
 * abstraction near 7, because writers copied `?? 0`, `?.`, `===`, `+= 1` and object literals from the source.
 */
export const pseudocodeCodeSyntaxRule: LintRule = {
  id: "pseudocode.code-syntax",
  docsPath: "10-system-design/40-block-vocabulary/20-code/20-pseudocode",
  severity: "warning",
  enforcement: [],
  applicability: "Each line of a pseudocode block, outside its double-quoted strings and its trailing // comment.",
  exclusions: ["Text inside a double-quoted string or a // comment", "Calls, -> arrows and .field access, which the viewer highlights"],
  suggestion: "Say the step in plain words: is and is not for === and !==, and and or for && and ||, \"or 0 when it is missing\" for ??, and \"add 1 to\" for += 1. Name a field or a list in words, not as an object literal or a [0] index.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "pseudocode") return [];
      const diff = block.props.diff === true;
      const text = (block.text ?? []).map((span) => span.insert).join("");
      const hits = text.split("\n").flatMap((raw, index) => {
        const line = diff ? raw.slice(1) : raw;
        const found = pseudocodeSyntaxIn(line);
        return found.length ? [{ number: index + 1, line: line.trim(), found }] : [];
      });
      if (hits.length === 0) return [];
      const labels = [...new Set(hits.flatMap((h) => h.found))];
      const fixes = CODE_SYNTAX.filter((s) => labels.includes(s.label)).map((s) => `Write ${s.label} as ${s.words}.`).join(" ");
      const numbers = hits.map((h) => h.number);
      const where = numbers.length === 1 ? `Line ${numbers[0]} uses` : `Lines ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)} use`;
      return [{
        blockId: block.id,
        field: "text",
        evidence: hits.slice(0, 3).map((h) => `line ${h.number}: ${h.line}`).join(" | "),
        message: `${where} source-language syntax, so a reader must know the source language to follow the steps. ${fixes}`,
      }];
    });
  },
};
