"use client";

import { useMemo } from "react";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { cn } from "../../ui/cn";
import { CODE_LINE_GUTTER_LIT_CLASSES, LinkGroup, useLinkTarget } from "../linked-panels";
import { expandLineRange } from "./annotations";
import {
  CODE_FRAME_GRID_CLASSES,
  CODE_GUTTER_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_CLASSES,
  CODE_GUTTER_LINE_CLASSES,
  CODE_GUTTER_LINE_LIT_WASH_CLASSES,
  CODE_LINE_ROW_CLASSES,
  CODE_LINE_ROW_ZEBRA_CLASSES,
} from "./classes";
import { CodeBlockHeader, CodeNotesAside } from "./CodeShell";
import { highlightCode, prettyPrintIfJson, resolveDisplayLanguage } from "./highlight";

export type { CodeAnnotation } from "./annotations";

/**
 * One code line on the annotated READ surface. Zebra stripes EVERY even line
 * (system rule R4) — annotated included — from JS so a lit extent's wash can
 * replace the stripe via cn(). Lines covered by an annotation join the
 * block's LinkGroup keyed by the owning annotation's `lines` key: hover,
 * focus, or pin paints the wash + 3px pin rail across the row, the sticky
 * gutter cell layers the wash and re-pins the rail at the gutter edge, and
 * the line number goes pin-color bold (system rule R3). At rest annotated
 * lines keep only the gutter's 2px accent bar + accent number.
 */
function AnnotatedCodeLine({
  lineNumber,
  html,
  linkKey,
}: {
  lineNumber: number;
  /** hljs output (token spans over escaped text) or fully escaped plain text — see highlight.ts. */
  html: string;
  /** The owning annotation's `lines` key, or null for plain lines. */
  linkKey: string | null;
}) {
  const link = useLinkTarget(linkKey);
  return (
    <div
      data-code-line={lineNumber}
      data-annotated={linkKey !== null || undefined}
      {...link.targetProps}
      className={cn(
        CODE_LINE_ROW_CLASSES,
        lineNumber % 2 === 0 && CODE_LINE_ROW_ZEBRA_CLASSES,
        link.className,
      )}
    >
      <span
        className={cn(
          CODE_GUTTER_CLASSES,
          CODE_GUTTER_LINE_CLASSES,
          linkKey !== null && CODE_GUTTER_LINE_ANNOTATED_CLASSES,
          link.lit && CODE_LINE_GUTTER_LIT_CLASSES,
          link.lit && CODE_GUTTER_LINE_LIT_WASH_CLASSES,
        )}
      >
        {lineNumber}
      </span>
      <code
        className="hljs whitespace-pre px-3"
        // The single space keeps empty lines at full height.
        dangerouslySetInnerHTML={{ __html: html || " " }}
      />
    </div>
  );
}

/**
 * Side-annotated code block (used only when annotations exist — the plain
 * code path stays with the registry, rendering through CodeShell). Shares
 * the code frame's furniture — header row (language label + copy button;
 * this is the one surface whose bar names a language, system rule R5), 20px
 * lines, 3rem gutter, zebra striping — via the constants in classes.ts, but
 * keeps its own per-line grid so every annotated line stays a link target.
 *
 * Pairing runs on the shared LinkGroup engine (ONE group per block; key =
 * the annotation's `lines` key): hovering or focusing a note or an annotated
 * line lights the annotation's FULL extent — background wash + the 3px inset
 * pin rail spanning first-through-last covered line including the gutter
 * edge, with the covered line numbers going pin-color bold. Clicking (or
 * Enter/Space) pins the pair — the pin survives hover-out and adds the
 * 1.5px ring — and Escape clears it. Overlapping annotations resolve each
 * line to the EARLIEST covering note, matching annotationLineRuns.
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
        <div className={cn("group/code", CODE_BLOCK_CLASSES, CODE_FRAME_GRID_CLASSES)}>
          <div className="min-w-0">
            <CodeBlockHeader
              languageLabel={resolveDisplayLanguage(displayCode, language)}
              copyText={() => displayCode}
            />
            <pre className="m-0 max-h-[440px] overflow-auto p-0 pb-2 font-mono text-xs leading-[20px]">
              {lines.map((line, index) => {
                const lineNumber = index + 1;
                const owner = lineOwner.get(lineNumber);
                return (
                  <AnnotatedCodeLine
                    key={index}
                    lineNumber={lineNumber}
                    html={line}
                    linkKey={owner === undefined ? null : annotations[owner].lines}
                  />
                );
              })}
            </pre>
          </div>
          <CodeNotesAside annotations={annotations} />
        </div>
      </LinkGroup>
    </section>
  );
}
