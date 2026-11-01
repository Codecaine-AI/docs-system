/**
 * Feedback for Canvas and Sequence sidecars: the canvas package's board lints,
 * the sequence package's program and document diagnostics, and a rendered SVG
 * of a sequence an agent can open as an image. Edits and `docs_check` report
 * them in one finding shape.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FINISHING_RULES, LAYOUT_RULES, runDiagnostics, type Severity } from "@codecaine-ai/canvas/lints";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { renderSequenceSvgString, serializeSequenceProgram } from "@codecaine-ai/sequence";
import type { SequenceDocument } from "@codecaine-ai/sequence/schema";

/** One Canvas or Sequence finding as an edit result or `docs_check` reports it. */
export interface ComponentFinding {
  rule: string;
  severity: Severity;
  /** Canvas object or connection IDs the finding names. */
  at?: string[];
  problem: string;
  fix?: string;
}

/**
 * The board lints over a canvas sidecar. Edits run the always-on rules and
 * `docs_check` adds the finishing rules, as canvas edits and `canvas_check` do.
 * `baseline` is the board the task started from: the text rules judge only
 * names and details written since it, and stay silent without one.
 */
export function canvasFindings(
  canvas: InteractiveCanvasDocument,
  options: { baseline?: InteractiveCanvasDocument; finishing?: boolean } = {},
): ComponentFinding[] {
  const rules = options.finishing ? FINISHING_RULES : LAYOUT_RULES;
  return runDiagnostics(canvas, rules, options.baseline ? { baseline: options.baseline } : {})
    .map(({ rule, severity, at, message, suggestion }) => ({
      rule, severity, ...(at.length ? { at } : {}), problem: message, ...(suggestion ? { fix: suggestion } : {}),
    }));
}

/** Sequence program and schema diagnostics, which refuse a write or a read, as findings. */
export function sequenceFindings(issues: ReadonlyArray<{ message: string }>): ComponentFinding[] {
  return issues.map(({ message }) => ({
    rule: /^Line \d+:/.test(message) ? "sequence-program" : "sequence-schema",
    severity: "error",
    problem: message,
  }));
}

/** Findings that fail a check: errors and warnings. Notes never block. */
export const blockingFindings = (findings: readonly ComponentFinding[]): ComponentFinding[] =>
  findings.filter((finding) => finding.severity !== "note");

/** The program text of a saved sequence, as `setProgram` would read it back. */
export const sequenceProgram = (sequence: SequenceDocument): string => serializeSequenceProgram(sequence);

/**
 * Render a saved sequence to an SVG file the server owns, outside the docs
 * root so no render becomes a corpus asset. The path is stable for a docs
 * root and sidecar, and each edit overwrites it.
 */
export async function renderSequenceSvgFile(
  docsRoot: string,
  sequenceRelPath: string,
  sequence: SequenceDocument,
): Promise<string> {
  const root = createHash("sha256").update(docsRoot).digest("hex").slice(0, 16);
  const path = join(tmpdir(), "codecaine-docs-renders", root, sequenceRelPath.replace(/\.json$/, ".svg"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderSequenceSvgString(sequence));
  return path;
}
