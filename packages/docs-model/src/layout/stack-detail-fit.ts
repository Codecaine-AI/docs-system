import { fitText, measureWidth, uncoveredChars, type FitResult, type FontSpec } from "@codecaine-ai/text-measure";
import type { DocBlock } from "../doc-schema";
import { readStack, type StackNode } from "../components/stack/state";
import type { LintRule, RuleMatch } from "../lint/types";
import { blockWidthsPx } from "./block-width";
import { monoBreakPieces } from "./chips";
import { approximateNote, excerpt, px, widthVerdict, type LayoutVerdict } from "./fit";
import {
  LANE_PX,
  STACK_DETAIL_MAX_PX,
  STACK_METRICS,
  STACK_PATH_DETAIL_MAX_PX,
  codeFont,
  sansFont,
  stackDetailLayout,
} from "./metrics";

/**
 * Stack details on one line. A leaf card shows its detail under its name:
 * prose segments joined with ", " in the sans face, wrapped at 60ch and
 * anywhere in a word, or path segments one per line in the code face, each
 * wrapped at 60ch of that face only at a space or after `/ . - | ,` with more
 * text after it (docs-viewer mono-breaks.tsx). A detail that needs a second
 * line stretches the card and stops reading as a label. A path run with no
 * break point runs out of the card sideways instead.
 */

const m = STACK_METRICS;
/** A leaf card's frame and padding: 1px border and 12px padding each side (a role card: 3px edge and 10px on the left). */
const CARD_CHROME_PX = 2 * m.boxBorderPx + 2 * m.boxPadXPx;
/** A container's frame and body padding. */
const GROUP_CHROME_PX = 2 * m.groupBorderPx + 2 * m.gapPx;

export interface StackDetailLine {
  /** Path from the block's props to the node, e.g. `props.nodes[0].children[1]`. */
  field: string;
  node: StackNode;
  /** The text one line must hold: the joined prose detail, or one path segment. */
  text: string;
  /** The line as written, with the backticks that mark its code spans. */
  raw: string;
  path: boolean;
  font: FontSpec;
  lineHeightPx: number;
  /** The width the line wraps at: the detail cap, or the card's own width when it is narrower. */
  availablePx: number;
  /** True when the card, not the 60ch cap, sets availablePx. */
  cardBound: boolean;
}

/**
 * Every detail line a stack draws, with the width it wraps at. Cards size to
 * their content up to the lane, so a detail meets its 60ch cap first unless
 * two-column containers leave the card narrower than that.
 */
export function stackDetailLines(block: DocBlock, blockWidthPx: number): StackDetailLine[] {
  const lines: StackDetailLine[] = [];
  const visit = (nodes: readonly StackNode[], widthPx: number, field: string) => {
    nodes.forEach((node, index) => {
      const here = `${field}[${index}]`;
      if (node.children && node.children.length > 0) {
        // Used widths never go below zero: grid tracks are minmax(0, 1fr).
        const body = Math.max(0, widthPx - GROUP_CHROME_PX);
        const column = node.columns === 2 ? Math.max(0, (body - m.gapPx) / 2) : body;
        visit(node.children, column, `${here}.children`);
        return;
      }
      if (!node.detail) return;
      const cardPx = Math.max(0, widthPx - CARD_CHROME_PX);
      const pathCapPx = Math.min(STACK_PATH_DETAIL_MAX_PX, cardPx);
      const layout = stackDetailLayout(node.detail);
      // A path detail's lines share one code-face parent, whose 60ch cap also bounds its body line.
      const capPx = layout.some((line) => line.path) ? STACK_PATH_DETAIL_MAX_PX : STACK_DETAIL_MAX_PX;
      for (const line of layout) {
        lines.push(line.path
          ? {
            field: `${here}.detail`, node, text: line.text, raw: line.raw, path: true,
            font: codeFont(m.pathDetailFontSizePx), lineHeightPx: m.pathDetailFontSizePx * m.pathDetailLineHeight,
            availablePx: pathCapPx, cardBound: cardPx < STACK_PATH_DETAIL_MAX_PX,
          }
          : {
            field: `${here}.detail`, node, text: line.text, raw: line.raw, path: false,
            font: sansFont(m.detailFontSizePx), lineHeightPx: m.detailFontSizePx * m.detailLineHeight,
            availablePx: Math.min(capPx, cardPx), cardBound: cardPx < capPx,
          });
      }
    });
  };
  visit(readStack(block).nodes, blockWidthPx, "props.nodes");
  return lines;
}

/**
 * A layout verdict for one detail line. `overflows` means it wraps to more
 * lines. `overflows-sideways` and `may-overflow-sideways`: a path run with no
 * break point is wider than the line, so it runs out of the card instead of
 * wrapping.
 */
export type StackDetailVerdict = LayoutVerdict | "overflows-sideways" | "may-overflow-sideways";

export interface StackDetailFit {
  /** The one-line fit: natural width, uncovered characters, reliability. */
  fit: FitResult;
  verdict: StackDetailVerdict;
  /** The natural width without the characters the bundled faces lack. */
  coveredWidth: number;
  /** Lines the text takes at the line's width. */
  lineCount: number;
  /** The widest run the renderer cannot break: a path run, a code span or a hyphenated word. */
  widestRun?: { text: string; width: number };
}

/** A path segment's runs as the stack paints them: a mono-break piece, cut again after each space. */
function pathRuns(segment: string): string[] {
  return monoBreakPieces(segment).flatMap((piece) => piece.split(/(?<= )(?=\S)/));
}

/** Lines a path segment takes at `widthPx`: runs fill each line, and a run wider than the line takes one alone. */
function pathLineCount(runs: readonly string[], line: StackDetailLine): number {
  let lines = 1;
  let current = "";
  for (const run of runs) {
    const candidate = current + run;
    if (current === "" || measureWidth(candidate, line.font) <= line.availablePx + 0.005) current = candidate;
    else {
      lines += 1;
      current = run;
    }
  }
  return lines;
}

/**
 * A body line's words as the stack paints them: each backtick span is one word in the code face at
 * `codeSpanFontSizePx`, and the rest splits at spaces in the line's font. A code span and a hyphenated word
 * never break (docs-viewer StackDocsBlock.tsx `codeWords`), so each is an unbreakable run.
 */
function bodyWords(line: StackDetailLine): { words: { text: string; width: number; gap: number; unbreakable: boolean }[]; width: number } {
  const code = codeFont(m.codeSpanFontSizePx);
  const space = measureWidth(" ", line.font);
  const words: { text: string; width: number; gap: number; unbreakable: boolean }[] = [];
  let width = 0;
  let pendingGap = 0;
  line.raw.split(/(`[^`]+`)/).forEach((part, index) => {
    if (index % 2 === 1) {
      const text = part.slice(1, -1);
      const spanWidth = measureWidth(text, code);
      width += spanWidth;
      words.push({ text, width: spanWidth, gap: pendingGap, unbreakable: true });
      pendingGap = 0;
      return;
    }
    const plain = part.replace(/`/g, "");
    width += measureWidth(plain, line.font);
    for (const piece of plain.split(/(\s+)/)) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) { pendingGap = space; continue; }
      words.push({ text: piece, width: measureWidth(piece, line.font), gap: pendingGap, unbreakable: /\w-\w/.test(piece) });
      pendingGap = 0;
    }
  });
  return { words, width };
}

/** Lines the words take at the line's width: words fill each line, and a word wider than the line takes one alone. */
function bodyLineCount(words: ReturnType<typeof bodyWords>["words"], availablePx: number): number {
  let lines = 1;
  let current = 0;
  for (const word of words) {
    if (current === 0) current = word.width;
    else if (current + word.gap + word.width <= availablePx + 0.005) current += word.gap + word.width;
    else {
      lines += 1;
      current = word.width;
    }
  }
  return lines;
}

/** One line's fit, judged on covered text: characters the bundled faces lack are reported, never judged an overflow. */
export function stackDetailFit(line: StackDetailLine): StackDetailFit {
  let fit = fitText(line.text, line.font, { width: line.availablePx, lineHeight: line.lineHeightPx, maxLines: 1 });
  let lineCount = fit.lineCount;
  let widestRun: StackDetailFit["widestRun"];
  if (!line.path) {
    const { words, width } = bodyWords(line);
    if (line.raw.includes("`")) {
      // Code spans draw in another face, so the line's width is the sum of its parts.
      fit = { ...fit, neededWidth: width, verdict: width > line.availablePx + 0.005 ? "overflows" : "fits" };
      lineCount = bodyLineCount(words, line.availablePx);
    }
    for (const word of words) if (word.unbreakable && (!widestRun || word.width > widestRun.width)) widestRun = { text: word.text, width: word.width };
  }
  const uncovered = fit.uncovered.length > 0;
  let coveredWidth = fit.neededWidth;
  if (uncovered) {
    let covered = line.text;
    for (const cluster of uncoveredChars(line.text, line.font.family)) covered = covered.split(cluster).join("");
    coveredWidth = measureWidth(covered, line.font);
  }
  if (line.path) {
    const runs = pathRuns(line.text);
    for (const run of runs) {
      const width = measureWidth(run, line.font);
      if (!widestRun || width > widestRun.width) widestRun = { text: run.trim(), width };
    }
    lineCount = pathLineCount(runs, line);
  }
  const result = { fit, coveredWidth, lineCount, widestRun };
  if (fit.verdict === "fits") return { ...result, verdict: "fits" };
  if (widestRun && uncoveredChars(widestRun.text, line.font.family).length === 0) {
    const sideways = widthVerdict(widestRun.width, widestRun.width, line.availablePx, false);
    if (sideways === "overflows") return { ...result, verdict: "overflows-sideways" };
    if (sideways === "borderline") return { ...result, verdict: "may-overflow-sideways" };
  }
  const verdict = widthVerdict(fit.neededWidth, coveredWidth, line.availablePx, uncovered);
  return { ...result, verdict: verdict === "fits" ? "borderline" : verdict };
}

function finding(block: DocBlock, line: StackDetailLine): RuleMatch | null {
  const { fit, verdict, lineCount, widestRun } = stackDetailFit(line);
  if (verdict === "fits") return null;
  const name = `"${excerpt(line.node.name, 40)}"`;
  const needed = px(fit.neededWidth);
  const available = px(line.availablePx);
  const limit = `at stock theme settings ${line.cardBound ? "its card wraps" : line.path ? "path details wrap" : "stack details wrap"} at ${available}`;
  const subject = line.path ? `The path "${excerpt(line.text, 50)}" in the detail of ${name}` : `The detail of ${name}`;
  const run = widestRun && widestRun.text !== line.text.trim() ? ` ("${excerpt(widestRun.text, 40)}")` : "";
  let message: string;
  if (verdict === "overflows-sideways") {
    message = `${subject} has no break point within ${px(widestRun!.width)}${run}, but ${limit}, so it overflows sideways.`;
  } else if (verdict === "may-overflow-sideways") {
    message = `${subject} has no break point within about ${px(widestRun!.width)}${run} and ${limit}, so it may overflow sideways.`;
  } else if (verdict === "overflows") {
    message = `${subject} needs ${needed} on one line, but ${limit}, so it wraps to ${Math.max(2, lineCount)} lines.`;
  } else if (verdict === "borderline") {
    message = `${subject} needs about ${needed} on one line and ${limit}, so it may wrap to a second line.`;
  } else {
    message = `${subject} may wrap: it needs about ${needed} on one line and ${limit}, and part of that width is text the bundled fonts lack.`;
  }
  return {
    blockId: block.id,
    field: line.field,
    evidence: line.path ? line.text : line.node.detail ?? line.text,
    message: `${message}${approximateNote(fit)}`,
    suggestion: line.path
      ? "Shorten the path, or split it at ` · ` into segments: each segment of a path detail gets its own line, and a line breaks only at a space or after / . - | , with more text after it."
      : "Shorten the detail to one line. Keep the facts that identify the layer, and move the rest into the text near the stack.",
  };
}

export const stackDetailFitRule: LintRule = {
  id: "layout.stack-detail-fit",
  docsPath: "10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack",
  severity: "warning",
  enforcement: [],
  applicability:
    `Each leaf detail of a stack block, measured with the bundled fonts through @codecaine-ai/text-measure: prose segments joined with ", " at ` +
    `${m.detailFontSizePx}px Inter within ${px(STACK_DETAIL_MAX_PX)} (60ch), and each path segment at ${m.pathDetailFontSizePx}px IBM Plex Mono within ` +
    `${px(STACK_PATH_DETAIL_MAX_PX)} (60ch of the code face), or within the card when two-column containers leave it narrower.`,
  exclusions: [
    "Container details, which render only as a hover title",
    "Themes and style-rail picks that change the stack gap, the detail size or fonts (the shared global theme, docs-system-classic): findings describe stock theme settings",
    "Hosts that do not paint with the bundled Inter and IBM Plex Mono: widths shift with the fallback fonts",
    "Characters the bundled fonts lack: their width is estimated and never judged an overflow",
  ],
  suggestion: "Shorten the detail so it fits on one line, or split a path detail into ` · `-separated segments.",
  check({ document, blocks }) {
    const stacks = blocks.filter((block) => block.type === "stack");
    if (stacks.length === 0) return [];
    const widths = blockWidthsPx(document);
    return stacks.flatMap((block) =>
      stackDetailLines(block, widths.get(block.id) ?? LANE_PX.wide).flatMap((line) => finding(block, line) ?? []),
    );
  },
};
