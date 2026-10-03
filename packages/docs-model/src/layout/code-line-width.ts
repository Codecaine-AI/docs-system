import { activeBackend, measureWidth, uncoveredChars } from "@codecaine-ai/text-measure";
import { deltaToPlainTextInline } from "../delta-markdown";
import type { LintRule, RuleMatch } from "../lint/types";
import { blockWidthsPx } from "./block-width";
import { codeLinePaintText, monoColumns } from "./columns";
import { FIT_TOLERANCE_PX, approximateNote, px, widthVerdict } from "./fit";
import {
  CODE_METRICS,
  CODE_VISIBLE_COLUMNS,
  CODE_VISIBLE_COLUMNS_WITH_NOTES,
  LANE_PX,
  NESTED_INSET_PX,
  codeFont,
  codeTextWidthPx,
  codeVisibleColumns,
  monoColumnPx,
} from "./metrics";

/**
 * The text a code block's read surface shows. The viewer pretty-prints JSON
 * before it splits lines (docs-viewer components/code/highlight.ts
 * prettyPrintIfJson): a block declared json or jsonc, or an undeclared block
 * whose text starts with `{` or `[`, renders `JSON.stringify(value, null, 2)`
 * when it parses.
 */
export function codeDisplayText(code: string, language?: string): string {
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

/**
 * True when a code block renders a notes column: some annotation has a
 * non-blank `lines` and `note` string (docs-viewer components/code/
 * annotations.ts parseCodeAnnotations returns non-null).
 */
export function codeHasNotes(annotations: unknown): boolean {
  if (!Array.isArray(annotations)) return false;
  return annotations.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const { lines, note } = entry as Record<string, unknown>;
    return typeof lines === "string" && lines.trim() !== "" && typeof note === "string" && note.trim() !== "";
  });
}

/** Evidence keeps at most this many characters of a line, so a minified line cannot bloat lint reports. */
const EVIDENCE_CHARS = 200;

function evidenceOf(line: string): string {
  const chars = Array.from(line);
  return chars.length <= EVIDENCE_CHARS ? line : `${chars.slice(0, EVIDENCE_CHARS).join("")}… (${chars.length} characters)`;
}

/** A code line measured as the panel paints it, in the bundled IBM Plex Mono. */
export interface CodeLineWidth {
  width: number;
  /** The width without the characters the bundled face lacks. */
  coveredWidth: number;
  uncovered: string[];
  reliable: boolean;
}

const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

/** One line's painted width: tabs expanded to their stops, every space kept, through text-measure. */
export function codeLineWidth(line: string): CodeLineWidth {
  const font = codeFont(CODE_METRICS.fontSizePx);
  const text = codeLinePaintText(line, CODE_METRICS.tabSize);
  const width = measureWidth(text, font);
  const uncovered = uncoveredChars(text, font.family);
  let coveredWidth = width;
  for (const cluster of uncovered) coveredWidth -= (text.split(cluster).length - 1) * measureWidth(cluster, font);
  return { width, coveredWidth: Math.max(0, coveredWidth), uncovered, reliable: activeBackend().exact && uncovered.length === 0 };
}

/**
 * Code never wraps on screen: a line wider than the code column scrolls the
 * whole panel sideways. PDF export sets code to `pre-wrap`, so this is an
 * on-screen check only.
 */
export const codeLineWidthRule: LintRule = {
  id: "layout.code-line-width",
  docsPath: "10-system-design/40-block-vocabulary/20-code/10-code-block",
  severity: "warning",
  enforcement: [],
  applicability:
    `Each line of a code block as the read surface shows it (JSON pretty-printed), measured in the bundled IBM Plex Mono at ` +
    `${CODE_METRICS.fontSizePx}px through @codecaine-ai/text-measure, against the width the panel gives code at stock settings: ` +
    `${CODE_VISIBLE_COLUMNS} columns, ${CODE_VISIBLE_COLUMNS_WITH_NOTES} beside a notes column, and fewer when nested in a text-lane block ` +
    `(${codeVisibleColumns(LANE_PX.text, false)} under a paragraph, ` +
    `${codeVisibleColumns(LANE_PX.text - (NESTED_INSET_PX["list-item"] ?? 0), false)} in a list item). Within 1px of the edge it may scroll.`,
  exclusions: [
    "PDF export, which wraps code (pre-wrap) instead of scrolling",
    "Pseudocode, file trees, file explorers and code panes inside other blocks",
    "Themes and style-rail picks that change the code lane, code text size, notes width or code font (the shared global theme, docs-system-classic): findings describe stock theme settings",
    "Windows narrower than the code lane, and classic scrollbars that take width from an annotated panel past 20 lines",
    "Characters the bundled IBM Plex Mono lacks (CJK, emoji): their width is estimated and never judged an overflow",
  ],
  suggestion:
    "Wrap or shorten the line to fit the code panel, or accept horizontal scrolling for this block. " +
    "This is an on-screen check: PDF export wraps code instead of scrolling.",
  check({ document, blocks }) {
    let widths: Map<string, number> | undefined;
    const column = monoColumnPx(CODE_METRICS.fontSizePx);
    return blocks.flatMap((block) => {
      if (block.type !== "code") return [];
      widths ??= blockWidthsPx(document);
      const width = widths.get(block.id) ?? LANE_PX.code;
      const hasNotes = codeHasNotes(block.props.annotations);
      const codePx = codeTextWidthPx(width, hasNotes);
      const visible = codeVisibleColumns(width, hasNotes);
      const notes = hasNotes && width >= CODE_METRICS.notesBesideMinWidthPx ? " beside its notes column" : "";
      const language = typeof block.props.language === "string" ? block.props.language : undefined;
      const lines = codeDisplayText(deltaToPlainTextInline(block.text), language).split("\n");
      return lines.flatMap((raw, index): RuleMatch[] => {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const columns = monoColumns(line, CODE_METRICS.tabSize);
        // Plain ASCII in a monospace face is exactly one column per character: no need to shape a line that clearly fits.
        if (PRINTABLE_ASCII.test(line) && columns * column <= codePx - 2 * FIT_TOLERANCE_PX) return [];
        const measured = codeLineWidth(line);
        const verdict = widthVerdict(measured.width, measured.coveredWidth, codePx, measured.uncovered.length > 0);
        if (verdict === "fits") return [];
        const number = index + 1;
        const over = Math.max(1, columns - visible);
        const lead =
          verdict === "overflows"
            ? `Line ${number} is ${columns} columns wide, but at stock theme settings the code panel fits ${visible}${notes} before it scrolls sideways.`
            : verdict === "borderline"
              ? `Line ${number} is ${columns} columns wide and at stock theme settings the code panel fits about ${visible}${notes}, so it may scroll sideways.`
              : `Line ${number} may scroll sideways: it needs about ${px(measured.width)} and at stock theme settings the code panel shows ${px(codePx)}${notes}, and part of that width is text the bundled fonts lack.`;
        return [{
          blockId: block.id,
          field: "text",
          evidence: evidenceOf(line),
          message: `${lead}${approximateNote(measured)}`,
          suggestion:
            `Wrap line ${number} or shorten it by ${over} column${over === 1 ? "" : "s"}, or accept horizontal ` +
            `scrolling for this block. This is an on-screen check: PDF export wraps code instead of scrolling.`,
        }];
      });
    });
  },
};
