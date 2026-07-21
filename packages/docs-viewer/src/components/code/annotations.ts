/**
 * React-free annotation model shared by every code-block surface: the read
 * descriptor (descriptor.tsx), the read renderer (CodeAnnotations.tsx), and
 * the editor node view (editor-node-view.tsx). Parsing lives here so edit
 * and read mode can never disagree about which `props.annotations` entries
 * are renderable.
 */

export type CodeAnnotation = {
  /** 1-indexed line range: "4" or "4-9" (comma lists like "1,4-6" also work). */
  lines: string;
  label?: string;
  note: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate a raw `props.annotations` value into renderable annotations.
 * Entries missing a non-empty `lines` or `note` string are dropped; returns
 * null when nothing renderable remains, so callers can branch on "has
 * annotations at all" with one check.
 */
export function parseCodeAnnotations(raw: unknown): CodeAnnotation[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const annotations: CodeAnnotation[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) continue;
    const { lines, label, note } = entry;
    if (typeof lines !== "string" || !lines.trim()) continue;
    if (typeof note !== "string" || !note.trim()) continue;
    annotations.push({ lines, note, ...(typeof label === "string" && label ? { label } : {}) });
  }
  return annotations.length > 0 ? annotations : null;
}

/**
 * Expand an annotation's `lines` string ("3", "2-5", "1,4-6") into the set of
 * 1-indexed line numbers it covers, clamped to [1, maxLine]. Unparseable or
 * fully out-of-range parts contribute nothing, so bad input never crashes.
 */
export function expandLineRange(lines: string, maxLine: number): Set<number> {
  const covered = new Set<number>();
  for (const part of lines.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : start;
    const from = Math.max(1, Math.min(start, end));
    const to = Math.min(maxLine, Math.max(start, end));
    for (let line = from; line <= to; line += 1) covered.add(line);
  }
  return covered;
}

/**
 * The full min–max span of a `lines` key ("4" → 4..4, "4-9" → 4..9,
 * "1,4-6" → 1..6) for the note's L#–# range chip (system rule R2) — the chip
 * names the note's whole extent even when the key has gaps; the raw key
 * rides along as the chip's title attribute. Unclamped on purpose (the chip
 * addresses the AUTHORED range); null when no part parses.
 */
export function lineRangeSpan(lines: string): { start: number; end: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const part of lines.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!match) continue;
    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : start;
    min = Math.min(min, start, end);
    max = Math.max(max, start, end);
  }
  if (!Number.isFinite(min)) return null;
  return { start: Math.max(1, min), end: Math.max(1, max) };
}

/** One contiguous run of annotated lines, owned by a single note. */
export type AnnotationLineRun = {
  /** 1-indexed first line of the run. */
  start: number;
  /** Number of consecutive covered lines (>= 1). */
  length: number;
  /** Index into the parsed annotations array of the run's owning note. */
  annotationIndex: number;
};

/**
 * Contiguous runs of annotated lines for overlay geometry (CodeShell's
 * absolute row tints and per-line gutter styling). Each line is owned by the
 * EARLIEST annotation covering it — the same overlap rule the annotated read
 * surface uses for click-to-pair — and a run breaks wherever coverage stops
 * OR ownership changes, so every run maps to exactly one note.
 */
export function annotationLineRuns(
  lineCount: number,
  annotations: CodeAnnotation[],
): AnnotationLineRun[] {
  const owner = new Map<number, number>();
  annotations.forEach((annotation, index) => {
    for (const line of expandLineRange(annotation.lines, lineCount)) {
      if (!owner.has(line)) owner.set(line, index);
    }
  });
  const runs: AnnotationLineRun[] = [];
  let current: AnnotationLineRun | null = null;
  for (let line = 1; line <= lineCount; line += 1) {
    const annotationIndex = owner.get(line);
    if (annotationIndex === undefined) {
      current = null;
      continue;
    }
    if (current && current.annotationIndex === annotationIndex) {
      current.length += 1;
    } else {
      current = { start: line, length: 1, annotationIndex };
      runs.push(current);
    }
  }
  return runs;
}
