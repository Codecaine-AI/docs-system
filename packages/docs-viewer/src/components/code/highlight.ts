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
 * the workbench web bundle for no benefit). Token colors come from the
 * `.hljs-*` theme in styles/code.css, which maps token classes onto the
 * `--syntax-*` role vars (VS Code Dark+ / Light+ semantics) defined per
 * theme in the workbench's theme/semantic.css.
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

/**
 * The curated grammar name a declared language resolves to (`ts` ->
 * `typescript`, `yml` -> `yaml`), for pickers that list only canonical
 * names. Null when no curated grammar matches.
 */
export function canonicalLanguage(language: string | null | undefined): string | null {
  const grammar = language ? hljs.getLanguage(language.trim().toLowerCase()) : undefined;
  if (!grammar) return null;
  return HIGHLIGHT_LANGUAGES.find((name) => hljs.getLanguage(name) === grammar) ?? null;
}

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
 * ROLE TAGGING. hljs's class vocabulary is coarser than the theme's
 * --syntax-* roles (VS Code Dark+ / Light+ semantics), so three token kinds
 * get an extra class the stylesheet (styles/code.css) colors from its own
 * role var:
 *  - `hljs-null` on null-like literals (`null`, python `None`, go `nil`),
 *    otherwise indistinguishable from `true`/`false` (--syntax-null);
 *  - `hljs-control` on control-flow / module keywords (`if`, `return`,
 *    `import`), which hljs classes like `const` (--syntax-control);
 *  - `hljs-type` on type-like built-ins (TS `string`, Python `int`), which
 *    hljs classes like callables such as `setTimeout` (--syntax-type).
 * ONE classifier (hljsRoleClass) decides all three; it is applied to hljs's
 * HTML string (highlightToHtml: read lines + editor token ranges) and to
 * rehype-highlight's hast (rehypeHljsRoles: markdown fenced code), so every
 * code surface tags identically.
 */
const NULL_WORDS = new Set(["null", "None", "nil"]);

/**
 * Control-flow and module keywords — the words VS Code's Dark+/Light+ scope
 * as `keyword.control` (purple) rather than plain `keyword`/`storage`
 * (blue). Case-sensitive on purpose: every curated grammar that has these
 * words writes them lowercase. Declaration/storage words (const, let,
 * function, class, def, fn, new, typeof, in, of, async, ...) stay out.
 */
const CONTROL_KEYWORDS = new Set([
  // shared C-family / JS / TS / Go / Rust / Python
  "if", "else", "return", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "throw", "try", "catch", "finally", "yield", "await",
  "import", "export", "from", "as", "with",
  // Python
  "elif", "except", "raise", "pass",
  // Rust
  "match", "loop",
  // Go
  "go", "defer", "goto", "fallthrough", "select",
  // Bash
  "then", "fi", "esac", "done", "until",
]);

/**
 * Built-ins that name a TYPE (TS primitives, Python's constructor types).
 * Everything else hljs calls `hljs-built_in` is a callable (`setTimeout`,
 * `print`, `len`, `echo`, CSS `var`, SQL `COUNT`, Rust macros), which Dark+
 * colors as a function. PascalCase built-ins (Rust's `Clone`, `Debug`
 * traits) are types too.
 */
const BUILTIN_TYPES = new Set([
  // TypeScript
  "string", "number", "boolean", "any", "unknown", "never", "object", "symbol", "bigint", "void",
  // Python
  "int", "float", "complex", "str", "bool", "bytes", "bytearray", "list", "tuple", "dict", "set",
  "frozenset", "type", "memoryview", "slice",
]);

/** SQL keywords (`FROM`, `CASE`, lowercase `from`) are all plain keywords in Dark+ — no control split. */
function isSql(grammar: string | null): boolean {
  return !!grammar && hljs.getLanguage(grammar) === hljs.getLanguage("sql");
}

/**
 * The extra role class for an hljs token span carrying exactly `tokenClass`
 * around `text`, or null. `grammar` is the language the block was
 * highlighted with (any registered name or alias; null when unknown).
 */
function hljsRoleClass(tokenClass: string, text: string, grammar: string | null): string | null {
  switch (tokenClass) {
    case "hljs-literal":
      return NULL_WORDS.has(text) ? "hljs-null" : null;
    case "hljs-keyword":
      return CONTROL_KEYWORDS.has(text) && !isSql(grammar) ? "hljs-control" : null;
    case "hljs-built_in":
      return BUILTIN_TYPES.has(text) || /^[A-Z][a-z]/.test(text) ? "hljs-type" : null;
    default:
      return null;
  }
}

/**
 * A role-candidate span in hljs HTML: flat text, or (the JSON grammar's
 * literal shape) one nested `hljs-keyword` span. Input is hljs output —
 * text already HTML-escaped — so the match can only ever hit hljs's own
 * spans, never a word inside a string or comment (plain text there).
 */
const HLJS_ROLE_SPAN_RE =
  /<span class="(hljs-literal|hljs-keyword|hljs-built_in)">(<span class="hljs-keyword">([^<]*)<\/span>|([^<]*))<\/span>/g;

function tagRoleClasses(html: string, grammar: string): string {
  return html.replace(
    HLJS_ROLE_SPAN_RE,
    (span, tokenClass: string, body: string, nested: string | undefined, flat: string | undefined) => {
      const extra = hljsRoleClass(tokenClass, nested ?? flat ?? "", grammar);
      return extra ? `<span class="${tokenClass} ${extra}">${body}</span>` : span;
    },
  );
}

/**
 * Runs the grammar and applies the role tagging — the ONE place both
 * surfaces (HTML lines + editor token ranges) get their hljs markup from.
 * Tagging only rewrites the class attribute of hljs's own spans; the text
 * is never touched, so the editor's offsets stay exact.
 */
function highlightToHtml(code: string, grammar: string): string {
  return tagRoleClasses(hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value, grammar);
}

/** The slice of the hast shape rehypeHljsRoles reads (no @types/hast dependency). */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

function hastClasses(node: HastNode): string[] {
  const className = node.properties?.className;
  return Array.isArray(className) ? className.map(String) : [];
}

/** A span's text when it is one text node, or one `hljs-keyword` span around one (the JSON literal shape). */
function hastSoleText(node: HastNode): string | null {
  const only = node.children?.length === 1 ? node.children[0] : undefined;
  if (!only) return null;
  if (only.type === "text") return only.value ?? "";
  const inner = hastClasses(only);
  if (only.tagName === "span" && inner.length === 1 && inner[0] === "hljs-keyword") {
    return hastSoleText(only);
  }
  return null;
}

function tagHastRoles(node: HastNode, grammar: string | null): void {
  let language = grammar;
  if (node.type === "element") {
    const classes = hastClasses(node);
    if (node.tagName === "code") {
      const declared = classes.find((name) => name.startsWith("language-"));
      if (declared) language = declared.slice("language-".length).toLowerCase();
    } else if (node.tagName === "span" && classes.length === 1) {
      const text = hastSoleText(node);
      const extra = text === null ? null : hljsRoleClass(classes[0]!, text, language);
      if (extra) node.properties = { ...node.properties, className: [...classes, extra] };
    }
  }
  for (const child of node.children ?? []) tagHastRoles(child, language);
}

/**
 * Rehype plugin for markdown-projected fenced code: run it AFTER
 * rehype-highlight so its hljs spans get the same role classes as every
 * other code surface. The language comes from the `<code>` element's
 * `language-*` class.
 */
export function rehypeHljsRoles() {
  return (tree: HastNode) => {
    tagHastRoles(tree, null);
  };
}

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
    highlighted = highlightToHtml(code, grammar);
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
    highlighted = highlightToHtml(code, grammar);
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
