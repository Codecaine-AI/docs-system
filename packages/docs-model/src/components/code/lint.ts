import { deltaToPlainTextInline } from "../../delta-markdown";
import type { LintRule } from "../../lint/types";
import { readCodeAnnotations } from "./state";

const DOCS_PATH = "10-system-design/40-block-vocabulary/20-code/10-code-block";

/**
 * A code block with no language renders as plain text with no language label
 * (docs-viewer components/code/highlight.ts resolves no grammar), so a reader
 * cannot tell what the listing is and gets no syntax colors.
 */
export const codeLanguageRule: LintRule = {
  id: "code.language",
  docsPath: DOCS_PATH,
  severity: "warning",
  enforcement: [],
  applicability: "Each code block's props.language.",
  exclusions: ["A block whose language is set to any value, such as text for plain output"],
  suggestion: "Set props.language to the file's language, such as typescript, toml or json. For plain output, set it to text.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "code") return [];
      const language = block.props.language;
      if (typeof language === "string" && language.trim()) return [];
      return [{
        blockId: block.id,
        field: "props.language",
        evidence: deltaToPlainTextInline(block.text).split("\n")[0]?.slice(0, 80) ?? "",
        message: "This code block has no language, so the page shows it as plain text with no language label.",
      }];
    });
  },
};

/** The 1-indexed lines a `lines` key covers in a listing of `lineCount` lines: the viewer's expandLineRange rule. */
function coveredLines(lines: string, lineCount: number): number[] {
  const covered: number[] = [];
  for (const part of lines.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let line = Math.max(1, Math.min(start, end)); line <= Math.min(lineCount, Math.max(start, end)); line += 1) covered.push(line);
  }
  return covered;
}

/**
 * An annotation whose `lines` key does not parse, or reaches past the last
 * line, points its note at lines the listing does not show. The viewer draws
 * no bracket for the missing lines, so the reader cannot pair the note.
 */
export const codeAnnotationRangeRule: LintRule = {
  id: "code.annotation-range",
  docsPath: DOCS_PATH,
  severity: "warning",
  enforcement: [],
  applicability: "The lines key of each annotation on a code block, against the block's line count.",
  exclusions: [],
  suggestion: "Count lines from 1 in the listing as written, and give each note the range of the lines it discusses, such as \"4\" or \"4-9\".",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "code") return [];
      const lineCount = deltaToPlainTextInline(block.text).split("\n").length;
      return readCodeAnnotations(block).flatMap((annotation, index) => {
        const covered = coveredLines(annotation.lines, lineCount);
        const parts = annotation.lines.split(",").map((part) => part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/));
        const highest = Math.max(0, ...parts.flatMap((match) => (match ? [Number(match[1]), Number(match[2] ?? match[1])] : [])));
        const problem = parts.some((match) => !match)
          ? `has a part that is not a line number or a range`
          : highest > lineCount
            ? `reaches line ${highest}, but the listing has ${lineCount} line${lineCount === 1 ? "" : "s"}`
            : covered.length === 0
              ? "covers no line"
              : null;
        if (!problem) return [];
        return [{
          blockId: block.id,
          field: `props.annotations[${index}].lines`,
          evidence: annotation.lines,
          message: `The note on lines "${annotation.lines}" ${problem}, so the reader cannot pair it with its code.`,
        }];
      });
    });
  },
};

export const codeLintRules: LintRule[] = [codeLanguageRule, codeAnnotationRangeRule];
