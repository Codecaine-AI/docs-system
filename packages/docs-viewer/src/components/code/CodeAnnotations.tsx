"use client";

import { useMemo } from "react";
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
  linkKey,
  runStart,
  runEnd,
}: {
  lineNumber: number;
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
        // The single space keeps empty lines at full height.
        dangerouslySetInnerHTML={{ __html: html || " " }}
      />
    </div>
  );
}

/**
 * Side-annotated code block (used only when annotations exist — the plain
 * code path stays with the registry, rendering through CodeShell). The dark
 * panel shares the code frame's furniture — header strip, line height,
 * gutter — via the constants in classes.ts, but keeps its own per-line grid
 * so every annotated line stays a link target. The notes are a column
 * INSIDE the panel, on a slightly lighter surface beside the code (under it
 * in a narrow block).
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

  return (
    <section className="not-prose" data-code-annotations={id}>
      <LinkGroup>
        <CodeNotesLayout>
          <div
            className={cn("group/code", CODE_BLOCK_CLASSES, CODE_FRAME_IN_LAYOUT_CLASSES)}
            data-code-surface="true"
            data-language={language}
          >
            <CodeBlockHeader
              languageLabel={resolveDisplayLanguage(displayCode, language)}
              copyText={() => displayCode}
            />
            <CodeNotesBody>
              <pre className={CODE_ANNOTATED_PRE_CLASSES}>
                {lines.map((line, index) => {
                  const lineNumber = index + 1;
                  const owner = lineOwner.get(lineNumber);
                  return (
                    <AnnotatedCodeLine
                      key={index}
                      lineNumber={lineNumber}
                      html={line}
                      linkKey={owner === undefined ? null : annotations[owner].lines}
                      runStart={lineOwner.get(lineNumber - 1) !== owner}
                      runEnd={lineOwner.get(lineNumber + 1) !== owner}
                    />
                  );
                })}
              </pre>
              <CodeNotesAside annotations={annotations} />
            </CodeNotesBody>
          </div>
        </CodeNotesLayout>
      </LinkGroup>
    </section>
  );
}
