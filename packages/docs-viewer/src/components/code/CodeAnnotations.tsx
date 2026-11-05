"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { cn } from "../../ui/cn";
import { LinkGroup, useLinkTarget } from "../linked-panels";
import { expandLineRange } from "./annotations";
import {
  CODE_ANNOTATED_PRE_CLASSES,
  CODE_FRAME_IN_LAYOUT_CLASSES,
  CODE_GUTTER_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
  CODE_GUTTER_LINE_CLASSES,
  CODE_GUTTER_MARK_END_CLASSES,
  CODE_GUTTER_MARK_START_CLASSES,
  CODE_LINE_ROW_CLASSES,
  CODE_LINE_ROW_LINKABLE_CLASSES,
  CODE_LINE_ROW_LIT_CLASSES,
  CODE_LINE_ROW_ZEBRA_CLASSES,
  CODE_LINE_TEXT_CELL_CLASSES,
} from "./classes";
import { CodeBlockHeader, CodeNotesAside, CodeNotesBody, CodeNotesLayout } from "./CodeShell";
import { highlightCode, prettyPrintIfJson, resolveDisplayLanguage } from "./highlight";

export type { CodeAnnotation } from "./annotations";

/**
 * One code line on the annotated READ surface. Lines covered by an
 * annotation join the block's LinkGroup keyed by the owning annotation's
 * `lines` key: hover, focus, or pin tints the row (the sticky gutter cell
 * layers the same tint), turns its number and gutter mark to the accent, and
 * keyboard focus draws the focus ring. At rest annotated lines keep only the
 * quiet gutter mark. The zebra stripe on even lines is transparent by
 * default; a lit tint replaces it via cn().
 */
function AnnotatedCodeLine({
  lineNumber,
  html,
  indent,
  linkKey,
  runStart,
  runEnd,
}: {
  lineNumber: number;
  /** Leading whitespace width of the raw line, in ch: a wrapped continuation hangs 2ch past it. */
  indent: number;
  /** hljs output (token spans over escaped text) or fully escaped plain text — see highlight.ts. */
  html: string;
  /** The owning annotation's `lines` key, or null for plain lines. */
  linkKey: string | null;
  /** First / last line of its annotated run: the gutter mark insets there. */
  runStart?: boolean;
  runEnd?: boolean;
}) {
  const link = useLinkTarget(linkKey);
  const annotated = linkKey !== null;
  return (
    <div
      data-code-line={lineNumber}
      data-annotated={annotated || undefined}
      {...link.targetProps}
      className={cn(
        CODE_LINE_ROW_CLASSES,
        lineNumber % 2 === 0 && CODE_LINE_ROW_ZEBRA_CLASSES,
        annotated && CODE_LINE_ROW_LINKABLE_CLASSES,
        link.lit && CODE_LINE_ROW_LIT_CLASSES,
      )}
    >
      <span
        className={cn(
          CODE_GUTTER_CLASSES,
          CODE_GUTTER_LINE_CLASSES,
          // A wrapped line grows the row: the gutter cell (and its mark) grows with it.
          "h-auto",
          annotated && CODE_GUTTER_LINE_ANNOTATED_CLASSES,
          annotated && runStart && CODE_GUTTER_MARK_START_CLASSES,
          annotated && runEnd && CODE_GUTTER_MARK_END_CLASSES,
          link.lit && CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
        )}
      >
        {lineNumber}
      </span>
      <code
        className={CODE_LINE_TEXT_CELL_CLASSES}
        style={{ "--docs-code-hang": `${indent + 2}ch` } as CSSProperties}
        // The single space keeps empty lines at full height.
        dangerouslySetInnerHTML={{ __html: html || " " }}
      />
    </div>
  );
}

/**
 * Places the notes of a read code block once it has laid out, and again when
 * its width changes. Beside the code, each note starts level with the first
 * line it explains, or just under the note above it. When a code line wraps
 * beside the notes column, the notes move under the code instead
 * (`data-notes-below`), so the code gets the full panel width. Without
 * layout (static markup) the notes stay stacked at the top of their column.
 */
function useNotePlacement(sectionRef: RefObject<HTMLElement | null>, firstLines: readonly number[], content: string) {
  const key = firstLines.join(",");
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const body = section?.querySelector<HTMLElement>("[data-code-body]");
    const aside = body?.querySelector<HTMLElement>("[data-code-notes]");
    const pre = body?.querySelector<HTMLElement>("pre");
    if (!section || !body || !aside || !pre) return;
    const place = () => {
      // Read the notes on each run: React replaces a note element when its text changes.
      const notes = Array.from(aside.children) as HTMLElement[];
      body.removeAttribute("data-notes-below");
      aside.removeAttribute("data-notes-below");
      for (const note of notes) note.style.marginTop = "";
      if (aside.getBoundingClientRect().top >= pre.getBoundingClientRect().bottom - 1) return;
      const rows = Array.from(pre.querySelectorAll<HTMLElement>("[data-code-line]"));
      const heights = rows.map((row) => row.getBoundingClientRect().height);
      // One line's height comes from the computed line height, so a block whose every line wraps still counts as wrapped.
      const computed = Number.parseFloat(getComputedStyle(rows[0] ?? pre).lineHeight);
      const lineHeight = Number.isFinite(computed) && computed > 0 ? computed : Math.min(...heights);
      if (heights.some((height) => height > lineHeight * 1.5)) {
        body.setAttribute("data-notes-below", "true");
        aside.setAttribute("data-notes-below", "true");
        return;
      }
      notes.forEach((note, index) => {
        const line = rows[(firstLines[index] ?? 1) - 1];
        if (!line) return;
        const lift = line.getBoundingClientRect().top - note.getBoundingClientRect().top;
        if (lift > 0.5) note.style.marginTop = `${lift}px`;
      });
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    let width = section.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = section.getBoundingClientRect().width;
      if (Math.abs(next - width) < 0.5) return;
      width = next;
      place();
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [sectionRef, key, content]);
}

/**
 * The READ code block, with or without notes (the edit surface renders
 * through CodeShell). Long lines wrap per line here, so a plain block never
 * scrolls sideways either; with no notes it drops the notes column. The dark
 * panel shares the code frame's furniture — header strip, line height,
 * gutter — via the constants in classes.ts, but keeps its own per-line grid
 * so every annotated line stays a link target. The notes are a column
 * INSIDE the panel, on a slightly lighter surface beside the code, each level
 * with its first line (under the code in a narrow block, or when a line
 * would wrap beside them: see useNotePlacement).
 *
 * Pairing runs on the shared LinkGroup engine (ONE group per block; key =
 * the annotation's `lines` key): hovering or focusing a note or an annotated
 * line lights the annotation's FULL extent — the line tint, accent numbers
 * and marks, and the note's accent chip. Clicking (or Enter/Space) pins the
 * pair — the pin survives hover-out — and Escape clears it. Overlapping
 * annotations resolve each line to the EARLIEST covering note, matching
 * annotationLineRuns.
 */
export function AnnotatedCodeBlock({
  id,
  language,
  code,
  annotations,
}: {
  id: string;
  language?: string;
  code: string;
  annotations: Array<{ lines: string; label?: string; note: string }>;
}) {
  /**
   * JSON pretty-print happens BEFORE line-splitting, so annotation `lines`
   * ranges refer to the pretty-printed (displayed) form. Authors of JSON
   * examples should write pretty multi-line text in the block so their ranges
   * are stable against this transform — it is a display-only safety net that
   * rescues one-liner JSON, not something to author against.
   */
  const displayCode = useMemo(() => prettyPrintIfJson(code, language), [code, language]);
  /** One hljs-highlighted HTML string per line (count matches split("\n")). */
  const lines = useMemo(() => highlightCode(displayCode, language), [displayCode, language]);
  /** Leading whitespace of each displayed line, in ch (a tab counts 4, the page tab-size). */
  const indents = useMemo(
    () => displayCode.split("\n").map((line) => [...(/^[ \t]*/.exec(line)?.[0] ?? "")].reduce((n, c) => n + (c === "\t" ? 4 : 1), 0)),
    [displayCode],
  );

  /** First annotation covering each line — overlaps resolve to the earliest note. */
  const lineOwner = useMemo(() => {
    const owner = new Map<number, number>();
    annotations.forEach((annotation, index) => {
      for (const line of expandLineRange(annotation.lines, lines.length)) {
        if (!owner.has(line)) owner.set(line, index);
      }
    });
    return owner;
  }, [annotations, lines.length]);

  const hasNotes = annotations.length > 0;
  const sectionRef = useRef<HTMLElement>(null);
  const firstLines = useMemo(
    () => annotations.map((annotation) => Math.min(...expandLineRange(annotation.lines, lines.length), lines.length)),
    [annotations, lines.length],
  );
  // Placement runs again when the code or a note changes.
  useNotePlacement(sectionRef, firstLines, `${displayCode}\u0000${JSON.stringify(annotations)}`);
  const pre = (
    <pre className={CODE_ANNOTATED_PRE_CLASSES}>
      {lines.map((line, index) => {
        const lineNumber = index + 1;
        const owner = lineOwner.get(lineNumber);
        return (
          <AnnotatedCodeLine
            key={index}
            lineNumber={lineNumber}
            html={line}
            indent={indents[index] ?? 0}
            linkKey={owner === undefined ? null : annotations[owner].lines}
            runStart={lineOwner.get(lineNumber - 1) !== owner}
            runEnd={lineOwner.get(lineNumber + 1) !== owner}
          />
        );
      })}
    </pre>
  );
  const frame = (
    <div
      className={cn("group/code", CODE_BLOCK_CLASSES, hasNotes && CODE_FRAME_IN_LAYOUT_CLASSES)}
      data-code-surface="true"
      data-language={language}
    >
      <CodeBlockHeader
        languageLabel={resolveDisplayLanguage(displayCode, language)}
        copyText={() => displayCode}
      />
      {hasNotes ? (
        <CodeNotesBody>
          {pre}
          <CodeNotesAside annotations={annotations} />
        </CodeNotesBody>
      ) : pre}
    </div>
  );
  if (!hasNotes) return frame;
  return (
    <section ref={sectionRef} className="not-prose" data-code-annotations={id}>
      <LinkGroup>
        <CodeNotesLayout>{frame}</CodeNotesLayout>
      </LinkGroup>
    </section>
  );
}
