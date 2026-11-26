/**
 * Feedback for Canvas and Sequence sidecars: the canvas package's board lints,
 * the sequence package's program and document diagnostics and its quality
 * lints, and a rendered SVG
 * of a sequence an agent can open as an image. Edits and `docs_check` report
 * them in one finding shape.
 */
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Resvg as ResvgClass } from "@resvg/resvg-js";
import { FINISHING_RULES, LAYOUT_RULES, runDiagnostics, type Severity } from "@codecaine-ai/canvas/lints";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { atomicWriteFile } from "./atomic-write";
import * as sequencePackage from "@codecaine-ai/sequence";
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
 */
export function canvasFindings(
  canvas: InteractiveCanvasDocument,
  options: { finishing?: boolean } = {},
): ComponentFinding[] {
  const rules = options.finishing ? FINISHING_RULES : LAYOUT_RULES;
  return runDiagnostics(canvas, rules)
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

/** One result of the sequence package's `lintSequence`. */
export interface SequenceLintResult {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Item or participant id the result points at. */
  target?: string;
}
export type SequenceLinter = (sequence: SequenceDocument) => readonly SequenceLintResult[];

/** A sequence package's `lintSequence`, or null when the package predates the lints. */
export function sequenceLinter(module: object): SequenceLinter | null {
  const lint = (module as { lintSequence?: unknown }).lintSequence;
  return typeof lint === "function" ? lint as SequenceLinter : null;
}
/** The installed sequence package's lints. */
export const installedSequenceLinter = sequenceLinter(sequencePackage);

/**
 * The sequence quality lints over a saved sequence, as warnings. They advise:
 * a write that has them still applies, and they never fail `docs_check`.
 * Without a linter, or when the linter throws, a sequence has no lint findings.
 */
export function sequenceLintFindings(sequence: SequenceDocument, lint: SequenceLinter | null): ComponentFinding[] {
  if (!lint) return [];
  let results: readonly SequenceLintResult[];
  try { results = lint(sequence); } catch { return []; }
  return results.map(({ rule, message, target }) => ({ rule, severity: "warning", ...(target ? { at: [target] } : {}), problem: message }));
}

/** Findings that fail a check: errors and warnings. Notes never block. */
export const blockingFindings = (findings: readonly ComponentFinding[]): ComponentFinding[] =>
  findings.filter((finding) => finding.severity !== "note");

/** The program text of a saved sequence, as `setProgram` would read it back. */
export const sequenceProgram = (sequence: SequenceDocument): string => serializeSequenceProgram(sequence);

/** A rendered image for a tool result: PNG bytes as base64. */
export interface RenderedImage { data: string; mimeType: "image/png"; width: number; height: number }

/**
 * The SVG paints with CSS variables and their fallbacks, as in `var(--seq-bg, var(--ds-color-surface-page, #fdfdfd))`,
 * so a page theme can restyle it. A rasterizer has no page, so each variable takes its fallback, innermost first.
 */
function resolveCssVariables(svg: string): string {
  let out = svg;
  for (let previous = ""; previous !== out;) {
    previous = out;
    out = out.replace(/var\(--[\w-]+\s*,\s*([^()]*)\)/g, (_, fallback: string) => fallback.trim());
  }
  return out;
}

let resvg: Promise<typeof ResvgClass> | undefined;
/**
 * resvg is a native module, and the supervisor bundles the managed runtime into one JavaScript file, which
 * cannot hold it. So it loads at run time from the docs-server package: the managed runtime names the
 * docs-mcp package root in CODECAINE_DOCS_PACKAGE_ROOT, and an unbundled server resolves from this file.
 */
function loadResvg(): Promise<typeof ResvgClass> {
  const packageRoot = process.env.CODECAINE_DOCS_PACKAGE_ROOT;
  const from = packageRoot ? join(packageRoot, "..", "docs-server", "src") : import.meta.dir;
  resvg ??= import(Bun.resolveSync("@resvg/resvg-js", from)).then((module) => module.Resvg as typeof ResvgClass);
  return resvg;
}

/** The longest edge of a sequence image. Vision models scale larger images down to about this size. */
export const SEQUENCE_IMAGE_MAX_EDGE = 1568;
/** The largest PNG a tool result carries. Model image limits sit near 5 MB, and base64 adds a third. */
export const SEQUENCE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Render a saved sequence to a PNG that a tool result carries as image content, so an
 * agent on any machine sees the diagram. A small diagram scales up to 2x for legibility,
 * the longest edge stays at or below SEQUENCE_IMAGE_MAX_EDGE, and a PNG above
 * SEQUENCE_IMAGE_MAX_BYTES renders again at half the size until it fits.
 */
export async function renderSequencePng(sequence: SequenceDocument): Promise<RenderedImage> {
  const Resvg = await loadResvg();
  const svg = resolveCssVariables(renderSequenceSvgString(sequence));
  const options = { font: { loadSystemFonts: true, defaultFontFamily: "Helvetica", sansSerifFamily: "Helvetica" } };
  const natural = new Resvg(svg, options);
  let zoom = Math.min(2, SEQUENCE_IMAGE_MAX_EDGE / Math.max(natural.width, natural.height, 1));
  for (;;) {
    const rendered = new Resvg(svg, { ...options, fitTo: { mode: "zoom", value: zoom } }).render();
    const png = rendered.asPng();
    if (png.byteLength <= SEQUENCE_IMAGE_MAX_BYTES || zoom < 0.1) {
      return { data: Buffer.from(png).toString("base64"), mimeType: "image/png", width: rendered.width, height: rendered.height };
    }
    zoom /= 2;
  }
}

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
  // A reader can open the file during the next edit, so it never sees a partial render.
  await atomicWriteFile(path, renderSequenceSvgString(sequence));
  return path;
}
