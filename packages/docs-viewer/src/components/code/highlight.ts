/**
 * Shared syntax-highlighting utility for ALL code content — the READ
 * surface's core `code` block descriptor (block-registry.ts) and annotated
 * code component (CodeAnnotations.tsx) render through highlightCode's
 * per-line HTML, and the EDITOR's live-highlight decorations
 * (editor-highlight.ts) come from highlightCodeTokens' offset ranges, so
 * both surfaces tokenize identically. Markdown-projected fenced code
 * highlights via rehype-highlight in DocBlockRenderer's renderMarkdown.
 *
 * Uses highlight.js CORE plus an explicitly registered, curated common set of
 * grammars — never the all-languages bundle (hundreds of grammars would bloat
 * the workbench web bundle for no benefit). Token colors come from the host
 * stylesheet's `.hljs-*` theme (packages/docs-workbench/web/src/index.css),
 * which maps token classes to the Spectre `--syntax-*` vars for light AND
 * dark themes.
 *
 * XSS safety: highlight.js escapes the code text itself when a grammar runs
 * (`hljs.highlight` HTML-escapes every non-token character); when no grammar
 * applies we escape the raw text ourselves. No caller-provided string is ever
 * interpolated unescaped.
 */

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Curated grammar set. Each grammar registers its own aliases (typescript:
 * ts/tsx, javascript: js/jsx/mjs/cjs, bash: sh, xml: html/xhtml/svg, yaml:
 * yml, markdown: md, python: py, diff: patch, go: golang, rust: rs), so the
 * common `props.language` spellings all resolve. Registration is idempotent
 * and module-load-time only.
 */
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
// A couple of extra aliases the grammars don't self-register but doc authors
// plausibly write. `shell` -> bash, `jsonc` -> json (comments will simply not
// tokenize as comments — acceptable for a display hint).
hljs.registerAliases(["shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["jsonc"], { languageName: "json" });

/** The curated grammar names, for language-picker UIs (each also accepts its hljs aliases). */
export const HIGHLIGHT_LANGUAGES = [
  "bash",
  "css",
  "diff",
  "go",
  "javascript",
  "json",
  "markdown",
  "python",
  "rust",
  "sql",
  "typescript",
  "xml",
  "yaml",
] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * hljs emits only `<span class="...">` and `</span>` tags with all text
 * HTML-escaped, so this regex fully tokenizes its tag structure.
 */
const HLJS_TAG_RE = /<span[^>]*>|<\/span>/g;

/**
 * Split highlighted HTML into per-line strings while keeping token spans
 * balanced on every line. hljs token spans can cross newlines (template
 * strings, block comments, multi-line YAML scalars): a naive `split("\n")`
 * would leave a line with an unclosed `<span>` and the next line with a stray
 * `</span>`. Track the stack of open span tags; each emitted line re-opens
 * the spans still open from previous lines and closes every span still open
 * at its end, so every line is independently valid HTML with the same token
 * classes the multi-line token had.
 */
function splitHighlightedHtml(html: string): string[] {
  const rawLines = html.split("\n");
  const openTags: string[] = [];
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const reopened = openTags.join("");
    HLJS_TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HLJS_TAG_RE.exec(rawLine)) !== null) {
      if (match[0] === "</span>") openTags.pop();
      else openTags.push(match[0]);
    }
    lines.push(reopened + rawLine + "</span>".repeat(openTags.length));
  }
  return lines;
}

/**
 * True when the trimmed text is a JSON object/array literal. The `{`/`[`
 * guard keeps bare scalars ("42", quoted strings) from being classified as
 * JSON when no language is declared.
 */
function looksLikeJson(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the grammar to highlight with: the declared language when a
 * registered grammar (or alias) matches it; otherwise a cheap JSON sniff for
 * undeclared-language blocks (a single JSON.parse — deterministic and far
 * cheaper than hljs auto-detection, which we deliberately skip); otherwise
 * null -> escape-only plain lines.
 */
function resolveLanguage(code: string, language?: string): string | null {
  const normalized = language?.trim().toLowerCase();
  if (normalized && hljs.getLanguage(normalized)) return normalized;
  if (!normalized && looksLikeJson(code)) return "json";
  return null;
}

/**
 * The language a surface should DISPLAY for a code block (header badge text):
 * the same resolution highlighting uses — the declared language when a
 * registered grammar (or alias) matches, else the JSON sniff (so sniffed JSON
 * shows "json"), else null (no badge). Kept as a thin export over the
 * internal resolution so badges can never disagree with tokenization.
 */
export function resolveDisplayLanguage(code: string, language?: string): string | null {
  return resolveLanguage(code, language);
}

/**
 * Highlight `code` and return ONE HTML string per input line (always exactly
 * `code.split("\n").length` entries, so callers' 1-indexed line numbering is
 * unaffected by highlighting). Each line contains hljs token `<span>`s styled
 * by the host's `.hljs-*` theme; spans that cross newlines are re-opened per
 * line. Unknown/missing languages degrade to escaped plain-text lines.
 */
export function highlightCode(code: string, language?: string): string[] {
  const grammar = resolveLanguage(code, language);
  if (!grammar) return code.split("\n").map(escapeHtml);
  let highlighted: string;
  try {
    highlighted = hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value;
  } catch {
    // A grammar bug must never take down a doc page — fall back to plain.
    return code.split("\n").map(escapeHtml);
  }
  return splitHighlightedHtml(highlighted);
}

/** Reverses escapeHtml — used only to recover original-text lengths when mapping hljs output back to source offsets. `&amp;` must go last so it never double-unescapes. */
function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

export type HighlightToken = {
  /** Start offset in the ORIGINAL code string (0-based, inclusive). */
  from: number;
  /** End offset in the original code string (exclusive). */
  to: number;
  /** Space-joined hljs class list (outer-to-inner for nested tokens). */
  className: string;
};

/**
 * Highlight `code` and return token CLASS RANGES as offsets into the
 * original string — the shape ProseMirror inline decorations need (the
 * editor's live-highlight plugin, editor-highlight.ts). Same grammar
 * resolution as highlightCode (declared language, else JSON sniff, else
 * none); unknown/missing languages return no tokens. Offsets are recovered
 * by walking hljs's span-tagged HTML and unescaping the text runs, so they
 * are exact for any input.
 */
export function highlightCodeTokens(code: string, language?: string): HighlightToken[] {
  const grammar = resolveLanguage(code, language);
  if (!grammar) return [];
  let highlighted: string;
  try {
    highlighted = hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value;
  } catch {
    return [];
  }
  const tokens: HighlightToken[] = [];
  const classStack: string[] = [];
  let offset = 0;
  let lastIndex = 0;
  const pushText = (chunk: string) => {
    if (!chunk) return;
    const length = unescapeHtml(chunk).length;
    if (classStack.length > 0) {
      tokens.push({ from: offset, to: offset + length, className: classStack.join(" ") });
    }
    offset += length;
  };
  HLJS_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HLJS_TAG_RE.exec(highlighted)) !== null) {
    pushText(highlighted.slice(lastIndex, match.index));
    if (match[0] === "</span>") {
      classStack.pop();
    } else {
      classStack.push(/class="([^"]*)"/.exec(match[0])?.[1] ?? "");
    }
    lastIndex = match.index + match[0].length;
  }
  pushText(highlighted.slice(lastIndex));
  return tokens;
}

/**
 * DISPLAY-ONLY pretty-printer for JSON code blocks — never mutates stored
 * block text. When the language is json/jsonc (or undeclared but the trimmed
 * text is a JSON object/array), returns the nested 2-space-indented form so
 * JSON is never rendered as an unreadable one-liner; anything unparseable
 * (including jsonc that actually uses comments) passes through unchanged.
 */
export function prettyPrintIfJson(code: string, language?: string): string {
  const normalized = language?.trim().toLowerCase();
  const declared = normalized === "json" || normalized === "jsonc";
  if (!declared && normalized) return code;
  const trimmed = code.trim();
  if (!trimmed) return code;
  if (!declared && !trimmed.startsWith("{") && !trimmed.startsWith("[")) return code;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return code;
  }
}
