"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../ui/cn";
import { useLinkTarget } from "../linked-panels";
import type { AnnotationLineRun, CodeAnnotation } from "./annotations";
import {
  CODE_ANNOTATION_ROW_CLASSES,
  CODE_ANNOTATION_ROW_LIT_CLASSES,
  CODE_CONTENT_WRAPPER_CLASSES,
  CODE_COPY_BUTTON_CLASSES,
  CODE_GUTTER_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
  CODE_GUTTER_LINE_CLASSES,
  CODE_HEADER_CLASSES,
  CODE_LANG_LABEL_CLASSES,
  CODE_LINE_HEIGHT_PX,
  CODE_NOTES_ASIDE_CLASSES,
  CODE_NOTES_HEADER_CLASSES,
  CODE_NOTES_LIST_CLASSES,
  CODE_NOTE_CLASSES,
  CODE_NOTE_DIVIDER_CLASSES,
  CODE_NOTE_LIT_CLASSES,
  CODE_SCROLL_BODY_CLASSES,
  CODE_ZEBRA_LAYER_CLASSES,
} from "./classes";

/**
 * Presentational shell shared by the plain READ surface (descriptor.tsx) and
 * the EDIT surface (editor-node-view.tsx): header row (quiet language label
 * or picker slot + ghost copy button), horizontal-scroll body holding the
 * zebra layer, annotation row overlays, sticky per-line gutter, and the
 * caller's code cell — plus the optional notes aside when annotations exist.
 * The annotated READ surface (CodeAnnotations.tsx) keeps its per-line click
 * grid but reuses CodeBlockHeader/CodeNotesAside and the same class
 * constants.
 *
 * Annotation interaction model: a pair is LIT when its note is hovered
 * (transient) or sticky-clicked (activeIndex, owned by the caller). The
 * shell holds the transient hoverIndex itself; the effective lit pair is
 * hoverIndex ?? activeIndex. At rest annotated ranges show only the gutter's
 * accent bar + accent number — the tint appears when lit.
 *
 * The caller owns the frame element (rounded border + block bg via
 * CODE_BLOCK_CLASSES + group/code): the shell renders the frame's CHILDREN,
 * so the edit surface can make its NodeViewWrapper the frame. All furniture
 * is marked contentEditable={false} when `nonEditableFurniture` is set (the
 * ProseMirror DOM observer treats unknown editable children as drift).
 */

/** Ghost copy button: clipboard write with a 1.5s "Copied" confirmation. No-op where the Clipboard API is unavailable (e.g. happy-dom). */
export function CodeCopyButton({ copyText }: { copyText: () => string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );
  const handleClick = () => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    void clipboard.writeText(copyText()).then(
      () => {
        setCopied(true);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={handleClick}
      className={CODE_COPY_BUTTON_CLASSES}
      data-code-copy
    >
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5" />
      )}
      <span aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/** Header row: quiet language label (or the edit surface's picker slot) left, copy button right. */
export function CodeBlockHeader({
  languageLabel,
  languageSelect,
  copyText,
  nonEditable,
}: {
  languageLabel: string | null;
  languageSelect?: ReactNode;
  copyText: () => string;
  nonEditable?: boolean;
}) {
  return (
    <div
      className={CODE_HEADER_CLASSES}
      contentEditable={nonEditable ? false : undefined}
      data-code-header
    >
      {languageSelect ??
        (languageLabel ? (
          <span className={CODE_LANG_LABEL_CLASSES} data-code-lang>
            {languageLabel}
          </span>
        ) : (
          <span />
        ))}
      <CodeCopyButton copyText={copyText} />
    </div>
  );
}

/**
 * One note row: bold label (when present), the note paragraph beneath — no
 * line-number chip; the raw lines key rides in the title attribute and the
 * pairing is shown by hover/pin extents. Doubles as a link target keyed by the annotation's
 * `lines` key — inside a LinkGroup (annotated READ surface) the engine
 * drives lighting/pinning and the spread targetProps win; without one (edit
 * surface) the hook is inert and the callback props (data-active/data-lit,
 * onNoteClick/onNoteHover) drive exactly as before.
 */
function CodeNoteRow({
  annotation,
  index,
  isActive,
  isLit,
  onNoteClick,
  onNoteHover,
}: {
  annotation: CodeAnnotation;
  index: number;
  isActive: boolean;
  isLit: boolean;
  onNoteClick?: (index: number) => void;
  onNoteHover?: (index: number | null) => void;
}) {
  const link = useLinkTarget(annotation.lines);
  return (
    <button
      type="button"
      title={annotation.lines}
      data-annotation-note={index}
      data-active={isActive || undefined}
      data-lit={isLit || undefined}
      onClick={onNoteClick ? () => onNoteClick(index) : undefined}
      onMouseEnter={onNoteHover ? () => onNoteHover(index) : undefined}
      onMouseLeave={onNoteHover ? () => onNoteHover(null) : undefined}
      {...link.targetProps}
      className={cn(
        CODE_NOTE_CLASSES,
        index > 0 && CODE_NOTE_DIVIDER_CLASSES,
        isLit && CODE_NOTE_LIT_CLASSES,
        link.className,
      )}
    >
      {annotation.label && (
        <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5">
          <span className="font-semibold text-foreground">{annotation.label}</span>
        </div>
      )}
      <div className="text-muted-foreground">{annotation.note}</div>
    </button>
  );
}

/**
 * Notes aside: right column at lg, stacked below at narrow widths. Opens
 * with its own header cell — the NOTES label styled exactly like the
 * language label, same h-7 height and bottom rule as the code header so the
 * rule reads as one continuous line across the block (crossed by the column
 * divider). Notes are prose rows (system rule R4): plain text at rest with a
 * hairline rule BETWEEN items, never zebra. Each opens with its L#–# range
 * chip. Pairing: inside a LinkGroup the shared engine lights/pins by the
 * annotation's lines key; otherwise hovering lights via onNoteHover and
 * clicking sticky-toggles via onNoteClick (edit surface).
 */
export function CodeNotesAside({
  annotations,
  activeIndex = null,
  litIndex,
  onNoteClick,
  onNoteHover,
  nonEditable,
}: {
  annotations: CodeAnnotation[];
  /** Sticky-clicked pair (drives data-active). Callers inside a LinkGroup leave it null — the engine drives there. */
  activeIndex?: number | null;
  /** Effective lit pair (hover ?? sticky) — drives the tint. Defaults to activeIndex. */
  litIndex?: number | null;
  onNoteClick?: (index: number) => void;
  onNoteHover?: (index: number | null) => void;
  nonEditable?: boolean;
}) {
  const lit = litIndex === undefined ? activeIndex : litIndex;
  return (
    <aside
      className={cn(CODE_NOTES_ASIDE_CLASSES, nonEditable && "select-none whitespace-normal")}
      contentEditable={nonEditable ? false : undefined}
      data-code-notes
    >
      <div className={CODE_NOTES_HEADER_CLASSES} data-code-notes-header>
        <span className={CODE_LANG_LABEL_CLASSES}>Notes</span>
      </div>
      <div className={CODE_NOTES_LIST_CLASSES}>
        {annotations.map((annotation, index) => (
          <CodeNoteRow
            key={`${annotation.lines}-${annotation.label ?? annotation.note}`}
            annotation={annotation}
            index={index}
            isActive={activeIndex === index}
            isLit={lit === index}
            onNoteClick={onNoteClick}
            onNoteHover={onNoteHover}
          />
        ))}
      </div>
    </aside>
  );
}

export function CodeShell({
  languageLabel,
  languageSelect,
  copyText,
  lineCount,
  annotations,
  annotationRuns,
  activeIndex = null,
  onNoteClick,
  nonEditableFurniture,
  children,
}: {
  /** Resolved display language (highlight.ts resolveDisplayLanguage) — null hides the label. */
  languageLabel: string | null;
  /** Edit surface: replaces the static label with the language picker. */
  languageSelect?: ReactNode;
  /** Returns the text the copy button writes — the surface's WYSIWYG source. */
  copyText: () => string;
  lineCount: number;
  annotations?: CodeAnnotation[] | null;
  annotationRuns?: AnnotationLineRun[];
  activeIndex?: number | null;
  onNoteClick?: (index: number) => void;
  /** Edit surface: mark all furniture contentEditable={false} for the PM DOM observer. */
  nonEditableFurniture?: boolean;
  /** The code cell — the content wrapper grid's second column (a <pre>). */
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const runs = annotationRuns ?? [];
  /** Transient hover pair — lights without sticking; sticky click stays with the caller. */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const litIndex = hoverIndex ?? activeIndex;

  /** First run's line owner per line — annotated gutter styling. */
  const lineOwner = new Map<number, number>();
  for (const run of runs) {
    for (let line = run.start; line < run.start + run.length; line += 1) {
      if (!lineOwner.has(line)) lineOwner.set(line, run.annotationIndex);
    }
  }

  // Activating a note (sticky click, not hover) scrolls its range's first line into view.
  useEffect(() => {
    if (activeIndex === null || activeIndex === undefined) return;
    const body = scrollRef.current;
    const run = runs.find((candidate) => candidate.annotationIndex === activeIndex);
    if (!body || !run) return;
    body.scrollTop = Math.max(0, (run.start - 1) * CODE_LINE_HEIGHT_PX - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs is derived per render; activeIndex is the trigger
  }, [activeIndex]);

  const furniture = nonEditableFurniture ? { contentEditable: false as const } : {};

  return (
    <>
      <div className="min-w-0">
        <CodeBlockHeader
          languageLabel={languageLabel}
          languageSelect={languageSelect}
          copyText={copyText}
          nonEditable={nonEditableFurniture}
        />
        <div ref={scrollRef} className={CODE_SCROLL_BODY_CLASSES} data-code-scroll>
          <div className={CODE_CONTENT_WRAPPER_CLASSES} data-code-content>
            {/* Z-order: zebra < annotation rows < gutter (z-10) / code text (positioned, later in DOM). */}
            <div className={CODE_ZEBRA_LAYER_CLASSES} data-code-zebra {...furniture} />
            {runs.map((run, runIndex) => {
              const isActive = activeIndex === run.annotationIndex;
              const isLit = litIndex === run.annotationIndex;
              return (
                <div
                  key={runIndex}
                  data-code-annotation-row={run.annotationIndex}
                  data-active={isActive || undefined}
                  data-lit={isLit || undefined}
                  style={{
                    top: (run.start - 1) * CODE_LINE_HEIGHT_PX,
                    height: run.length * CODE_LINE_HEIGHT_PX,
                  }}
                  className={cn(
                    CODE_ANNOTATION_ROW_CLASSES,
                    isLit && CODE_ANNOTATION_ROW_LIT_CLASSES,
                  )}
                  {...furniture}
                />
              );
            })}
            <div className={CODE_GUTTER_CLASSES} data-code-gutter {...furniture}>
              {Array.from({ length: lineCount }, (_, index) => {
                const line = index + 1;
                const owner = lineOwner.get(line);
                const isAnnotated = owner !== undefined;
                return (
                  <div
                    key={line}
                    data-code-gutter-line={line}
                    data-annotated={isAnnotated || undefined}
                    className={cn(
                      CODE_GUTTER_LINE_CLASSES,
                      isAnnotated && CODE_GUTTER_LINE_ANNOTATED_CLASSES,
                      isAnnotated &&
                        owner === litIndex &&
                        CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
                    )}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
            {children}
          </div>
        </div>
      </div>
      {annotations && annotations.length > 0 && (
        <CodeNotesAside
          annotations={annotations}
          activeIndex={activeIndex ?? null}
          litIndex={litIndex}
          onNoteClick={onNoteClick}
          onNoteHover={setHoverIndex}
          nonEditable={nonEditableFurniture}
        />
      )}
    </>
  );
}
