"use client";

import type { DeltaSpan, DeltaSpanAttributes } from "./doc-schema";
import type { SpectreRef } from "./spectre-ref";

/**
 * Inline markdown -> delta span tokenizer (M2, TG4.1 / TG5.2).
 *
 * This is the shared core moved here from `scripts/docs-migrate/inline-to-delta.ts`
 * during the M2 read-surface checkpoint (Checkpoint 5) so the interim block
 * editor (DocBlockRenderer's `editable` mode) can convert a block's edited
 * markdown text back into DeltaSpan[] without depending on Node's `path`
 * module (this file must be safe to run in the browser bundle, unlike the
 * migration script which is a Bun CLI tool).
 * `scripts/docs-migrate/inline-to-delta.ts` now re-exports from here so its
 * existing test suite (and `mdx-to-doc.ts`) keep working unchanged.
 *
 * Converts a single line/run of inline markdown (bold/italic/strike/code/
 * links) into DeltaSpan[] per docs-model's doc-schema. This is a small,
 * purpose-built tokenizer (not a full CommonMark implementation) covering
 * exactly the inline vocabulary the existing MDX corpus (and the editor)
 * uses: bold, italic (asterisk or underscore), strikethrough, inline code,
 * and markdown links.
 * Nested emphasis merges attributes on the overlapping run (e.g. bold text
 * containing an italic sub-run produces a run with both marks set).
 * Whitespace is preserved exactly as written — no trimming, no collapsing.
 *
 * Link classification (D35 + design record):
 *  - href resolving under `docs/` (repo-relative or doc-relative path,
 *    optionally with a `#anchor`) -> `reference` attribute, kind:"doc".
 *  - source-code-looking paths (has a code file extension, optionally with
 *    `#L<line>` or a trailing symbol-looking fragment) -> kind:"source".
 *  - everything else (external URLs, mailto:, ambiguous relative paths that
 *    don't resolve under docs/ or look like source) stays a plain `link`
 *    attribute (D35 — outbound links render plain in v1).
 * Unclassifiable but internal-looking links (relative, no scheme, but we
 * can't confidently resolve them) are still emitted as plain `link`s, and a
 * warning is collected so callers (migration report, editor save path) can
 * surface them for review.
 */

export type InlineToDeltaOptions = {
  /**
   * Repo-relative path of the document currently being parsed (e.g.
   * "docs/00-foundation/00-overview.mdx" or its bundle folder). Used to
   * resolve relative link targets against the repo root and to classify
   * them as doc/source/plain.
   */
  docPath?: string;
  /**
   * Repo root, as a POSIX-style path prefix used only for display/relative
   * math in `classifyLink` — no filesystem access happens here. Defaults to
   * "" (i.e. `docPath` is already treated as repo-relative).
   */
  repoRoot?: string;
};

export type InlineToDeltaResult = {
  spans: DeltaSpan[];
  warnings: string[];
};

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".cs",
  ".php",
  ".swift",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".css",
  ".scss",
]);

const DOC_EXTENSIONS = new Set([".md", ".mdx"]);

/** Minimal POSIX-style path helpers (no `node:path` — this module must be browser-safe). */
function posixDirname(path: string): string {
  const normalized = path.split("\\").join("/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) return ".";
  if (idx === 0) return "/";
  return normalized.slice(0, idx);
}

function posixExtname(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return base.slice(dotIndex);
}

function posixBasename(path: string): string {
  const normalized = path.split("\\").join("/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
}

/** Resolves `relativeTo` + `target` into a normalized path, collapsing `.`/`..` segments (pure string math, no filesystem). */
function posixResolve(...segments: string[]): string {
  let resolved: string[] = [];
  let isAbsolute = false;
  for (const rawSegment of segments) {
    const segment = rawSegment.split("\\").join("/");
    if (segment.startsWith("/")) {
      resolved = [];
      isAbsolute = true;
    }
    for (const part of segment.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (resolved.length > 0 && resolved[resolved.length - 1] !== "..") {
          resolved.pop();
        } else if (!isAbsolute) {
          resolved.push("..");
        }
        continue;
      }
      resolved.push(part);
    }
  }
  return (isAbsolute ? "/" : "") + resolved.join("/");
}

/** Path of `to` relative to directory `from` (both normalized POSIX-style). */
function posixRelative(from: string, to: string): string {
  const fromParts = from.split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.length - common;
  const down = toParts.slice(common);
  return [...Array(up).fill(".."), ...down].join("/");
}

function isExternalOrSpecialLink(href: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true; // scheme, e.g. https:, mailto:
  if (href.startsWith("//")) return true; // protocol-relative
  if (href.startsWith("#")) return true; // in-page anchor only
  return false;
}

/** Splits `path#anchor` into its parts; anchor is undefined if absent. */
function splitAnchor(href: string): { path: string; anchor?: string } {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return { path: href };
  return { path: href.slice(0, hashIndex), anchor: href.slice(hashIndex + 1) };
}

/**
 * Classifies a link href relative to the current doc, returning a SpectreRef
 * when it resolves under the repo as a doc or source path, or null when it
 * should stay a plain link. `ambiguous` is true when the href looked
 * internal (relative path) but couldn't be confidently classified — the
 * caller should emit a warning in that case even though we still fall back
 * to a plain link.
 */
function classifyLink(
  href: string,
  options: InlineToDeltaOptions,
): { ref: SpectreRef | null; ambiguous: boolean } {
  const trimmed = href.trim();
  if (!trimmed || isExternalOrSpecialLink(trimmed)) {
    return { ref: null, ambiguous: false };
  }

  const repoRoot = options.repoRoot ?? "";
  const { path: rawPath, anchor } = splitAnchor(trimmed);
  if (!rawPath) {
    // Anchor-only handled above via isExternalOrSpecialLink, but guard anyway.
    return { ref: null, ambiguous: false };
  }

  // Resolve repo-relative path.
  let repoRelativePath: string;
  if (rawPath.startsWith("/")) {
    // Repo-root-relative (leading slash) — treat as relative to repo root.
    repoRelativePath = rawPath.slice(1);
  } else if (options.docPath) {
    const docDir = posixResolve(repoRoot, posixDirname(options.docPath));
    const absolute = posixResolve(docDir, rawPath);
    repoRelativePath = posixRelative(posixResolve(repoRoot), absolute);
  } else {
    repoRelativePath = rawPath;
  }
  repoRelativePath = repoRelativePath.split("\\").join("/");

  const ext = posixExtname(rawPath.split("#")[0] ?? "").toLowerCase();

  if (repoRelativePath.startsWith("docs/") && DOC_EXTENSIONS.has(ext)) {
    return {
      ref: { kind: "doc", path: repoRelativePath, section: anchor },
      ambiguous: false,
    };
  }

  // Symbol/line fragment on a code-looking path: [text](path/to/file.ts#L42)
  // or [text](path/to/file.ts#symbolName)
  if (SOURCE_EXTENSIONS.has(ext)) {
    let line: number | undefined;
    let symbol: string | undefined;
    if (anchor) {
      const lineMatch = anchor.match(/^L(\d+)$/i);
      if (lineMatch) {
        line = Number.parseInt(lineMatch[1], 10);
      } else {
        symbol = anchor;
      }
    }
    return {
      ref: { kind: "source", path: repoRelativePath, line, symbol },
      ambiguous: false,
    };
  }

  if (DOC_EXTENSIONS.has(ext)) {
    // Doc-looking path but outside docs/ (e.g. relative link that resolved
    // to a session artifact or a doc from a different root). Still a doc
    // ref — repo-relative path is definitionally what SpectreRef wants,
    // regardless of the docs/-prefix; the docs/-prefix check above is only
    // there to prefer the fast path. Treat generically here too.
    return {
      ref: { kind: "doc", path: repoRelativePath, section: anchor },
      ambiguous: false,
    };
  }

  if (!ext && !posixBasename(rawPath).includes(".")) {
    // Extensionless relative path (e.g. a directory link) that looks
    // internal but we can't classify confidently — flag it.
    return { ref: null, ambiguous: true };
  }

  // Has some other extension (image, pdf, etc.) or doesn't parse cleanly —
  // not classified as doc/source; not ambiguous, just plain.
  return { ref: null, ambiguous: false };
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; mark: "bold" | "italic" | "strike"; raw: string }
  | { kind: "close"; mark: "bold" | "italic" | "strike"; raw: string }
  | { kind: "code"; value: string }
  | { kind: "link"; text: string; href: string };

/**
 * Tokenizes inline markdown into a flat token stream. Uses a scanning
 * approach: code spans are highest precedence (no nested marks inside),
 * then links, then emphasis markers which are paired greedily via a stack
 * per-marker-type so nesting resolves naturally (e.g. `**a _b_ c**`).
 */
function tokenize(md: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = md.length;
  let textBuffer = "";

  const flushText = () => {
    if (textBuffer.length > 0) {
      tokens.push({ kind: "text", value: textBuffer });
      textBuffer = "";
    }
  };

  while (i < n) {
    const ch = md[i];

    // Inline code span: `...` (no nested marks, preserve verbatim).
    if (ch === "`") {
      const close = md.indexOf("`", i + 1);
      if (close !== -1) {
        flushText();
        tokens.push({ kind: "code", value: md.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
      textBuffer += ch;
      i += 1;
      continue;
    }

    // Link: [text](url)
    if (ch === "[") {
      const closeBracket = md.indexOf("]", i + 1);
      if (closeBracket !== -1 && md[closeBracket + 1] === "(") {
        const closeParen = md.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = md.slice(i + 1, closeBracket);
          const href = md.slice(closeBracket + 2, closeParen);
          flushText();
          tokens.push({ kind: "link", text: linkText, href });
          i = closeParen + 1;
          continue;
        }
      }
      textBuffer += ch;
      i += 1;
      continue;
    }

    // Strikethrough: ~~...~~
    if (ch === "~" && md[i + 1] === "~") {
      flushText();
      tokens.push({ kind: "open", mark: "strike", raw: "~~" }); // resolved to open/close below
      i += 2;
      continue;
    }

    // Bold: **...**
    if (ch === "*" && md[i + 1] === "*") {
      flushText();
      tokens.push({ kind: "open", mark: "bold", raw: "**" });
      i += 2;
      continue;
    }

    // Italic: *...* or _..._
    if (ch === "*" || ch === "_") {
      flushText();
      tokens.push({ kind: "open", mark: "italic", raw: ch });
      i += 1;
      continue;
    }

    textBuffer += ch;
    i += 1;
  }
  flushText();
  return tokens;
}

/**
 * Resolves the open/open/close ambiguity from tokenize() (which emits every
 * marker occurrence as "open") into real open/close pairs per mark type,
 * using a stack so `**bold**` -> open,text,close and unmatched markers
 * degrade to literal text (graceful fallback rather than throwing).
 */
function pairMarks(tokens: Token[]): Token[] {
  const markerIndices: Record<string, number[]> = { bold: [], italic: [], strike: [] };
  tokens.forEach((token, index) => {
    if (token.kind === "open") markerIndices[token.mark].push(index);
  });

  const resolved: (Token["kind"] | null)[] = tokens.map((t) => t.kind);
  const toLiteral = new Set<number>();

  for (const mark of ["bold", "italic", "strike"] as const) {
    const indices = markerIndices[mark];
    // Pair sequentially: 1st&2nd, 3rd&4th, ... any odd one out becomes literal.
    for (let k = 0; k + 1 < indices.length; k += 2) {
      const openIdx = indices[k];
      const closeIdx = indices[k + 1];
      resolved[openIdx] = "open";
      resolved[closeIdx] = "close";
    }
    if (indices.length % 2 === 1) {
      toLiteral.add(indices[indices.length - 1]);
    }
  }

  return tokens.map((token, index) => {
    if (token.kind !== "open") return token;
    if (toLiteral.has(index)) {
      const raw = (token as { raw: string }).raw;
      return { kind: "text", value: raw } as Token;
    }
    return resolved[index] === "close" ? { ...token, kind: "close" } : token;
  });
}

/**
 * Converts a run of inline markdown into DeltaSpan[]. Pure function, no
 * throw — degrades to plain text on anything it can't confidently parse and
 * reports unclassifiable internal-looking links via `warnings`.
 */
export function inlineToDelta(md: string, options: InlineToDeltaOptions = {}): InlineToDeltaResult {
  const warnings: string[] = [];
  const raw = tokenize(md);
  const tokens = pairMarks(raw);

  const spans: DeltaSpan[] = [];
  const activeMarks = new Set<"bold" | "italic" | "strike">();

  const pushSpan = (insert: string, extra?: DeltaSpanAttributes, includeActiveMarks = true) => {
    if (insert.length === 0) return;
    const attributes: DeltaSpanAttributes = { ...extra };
    if (includeActiveMarks) {
      for (const mark of activeMarks) attributes[mark] = true;
    }
    if (Object.keys(attributes).length === 0) {
      spans.push({ insert });
    } else {
      spans.push({ insert, attributes });
    }
  };

  for (const token of tokens) {
    switch (token.kind) {
      case "text":
        pushSpan(token.value);
        break;
      case "code":
        pushSpan(token.value, { code: true }, false);
        break;
      case "link": {
        const { ref, ambiguous } = classifyLink(token.href, options);
        if (ambiguous) {
          warnings.push(`Unclassifiable internal-looking link target: "${token.href}"`);
        }
        if (ref) {
          // Preserve the author's anchor text as the reference's display
          // label — the markdown projection (project-markdown.ts, D35)
          // renders references as `label ?? path`, so without a label the
          // original link text would be lost on round-trip.
          const refWithLabel = token.text.length > 0 ? { ...ref, label: token.text } : ref;
          pushSpan(token.text, { reference: refWithLabel });
        } else {
          pushSpan(token.text, { link: token.href });
        }
        break;
      }
      case "open":
        activeMarks.add(token.mark);
        break;
      case "close":
        activeMarks.delete(token.mark);
        break;
      default:
        break;
    }
  }

  // Merge adjacent spans with identical attributes (keeps output compact and
  // deterministic; whitespace is still preserved verbatim within inserts).
  const merged: DeltaSpan[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (prev && sameAttributes(prev.attributes, span.attributes)) {
      merged[merged.length - 1] = { ...prev, insert: prev.insert + span.insert };
    } else {
      merged.push(span);
    }
  }

  return { spans: merged, warnings };
}

function sameAttributes(a?: DeltaSpanAttributes, b?: DeltaSpanAttributes): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keys: (keyof DeltaSpanAttributes)[] = ["bold", "italic", "strike", "code", "link"];
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  const refA = a.reference;
  const refB = b.reference;
  if (!refA && !refB) return true;
  if (!refA || !refB) return false;
  return (
    refA.kind === refB.kind &&
    refA.path === refB.path &&
    refA.symbol === refB.symbol &&
    refA.line === refB.line &&
    refA.section === refB.section &&
    refA.label === refB.label
  );
}
