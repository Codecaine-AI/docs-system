"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Brackets, Check, CodeXml, Copy } from "lucide-react";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { cn } from "../../ui/cn";
import { RangeChip, useLinkTarget } from "../linked-panels";
import type { AnnotationLineRun, CodeAnnotation } from "./annotations";
import {
  CODE_ANNOTATION_ROW_CLASSES,
  CODE_ANNOTATION_ROW_LIT_CLASSES,
  CODE_CONTENT_WRAPPER_CLASSES,
  CODE_COPY_BUTTON_CLASSES,
  CODE_COPY_ICON_CLASSES,
  CODE_FRAME_IN_LAYOUT_CLASSES,
  CODE_GUTTER_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
  CODE_GUTTER_LINE_CLASSES,
  CODE_GUTTER_MARK_END_CLASSES,
  CODE_GUTTER_MARK_START_CLASSES,
  CODE_HEADER_CLASSES,
  CODE_LANG_LABEL_CLASSES,
  CODE_BODY_GRID_CLASSES,
  CODE_LAYOUT_CLASSES,
  CODE_LINE_HEIGHT_PX,
  CODE_NOTES_ASIDE_CLASSES,
  CODE_NOTE_BODY_CLASSES,
  CODE_NOTE_CHIP_CLASSES,
  CODE_NOTE_CLASSES,
  CODE_NOTE_HEAD_CLASSES,
  CODE_NOTE_LABEL_CLASSES,
  CODE_NOTE_LIT_CLASSES,
  CODE_SCROLL_BODY_CLASSES,
  CODE_TILE_CLASSES,
  CODE_TILE_ICON_CLASSES,
  CODE_ZEBRA_LAYER_CLASSES,
} from "./classes";

/**
 * Presentational shell shared by the plain READ surface (descriptor.tsx) and
 * the EDIT surface (editor-node-view.tsx): the dark panel frame (header strip
 * with the family tile, quiet language label or picker slot and copy
 * button; horizontal-scroll body holding the zebra layer, annotation row
 * overlays, sticky per-line gutter, and the caller's code cell) plus, when
 * annotations exist, the notes column inside it. The annotated READ surface
 * (CodeAnnotations.tsx) keeps its per-line click grid but reuses
 * CodeBlockHeader / CodeNotesLayout / CodeNotesBody / CodeNotesAside and the
 * same class constants.
 *
 * Annotation interaction model: a pair is LIT when its note is hovered
 * (transient) or sticky-clicked (activeIndex, owned by the caller). The
 * shell holds the transient hoverIndex itself; the effective lit pair is
 * hoverIndex ?? activeIndex. At rest annotated ranges show only the quiet
 * gutter mark — the tint, accent numbers and accent chip appear when lit.
 *
 * Layout: without notes the shell renders the bare frame. With notes it
 * renders a size container around the frame, and the frame's body is a
 * code | notes grid: the notes column sits INSIDE the dark panel on a
 * slightly lighter surface (beside the code from 760px block width, under it
 * below that). All furniture is marked
 * contentEditable={false} when `nonEditableFurniture` is set (the
 * ProseMirror DOM observer treats unknown editable children as drift).
 */

/**
 * The code line height in px as currently themed: the computed
 * --docs-code-line-height on the scroll body, else the default. Only JS that
 * needs a number (scroll-into-view) uses this — all painted geometry stays in
 * CSS calc() over the var.
 */
function resolveLineHeightPx(element: HTMLElement): number {
  const raw =
    typeof getComputedStyle === "function"
      ? getComputedStyle(element).getPropertyValue("--docs-code-line-height")
      : "";
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CODE_LINE_HEIGHT_PX;
}

/** Copy button: always visible, clipboard write with a 1.5s "Copied" confirmation. No-op where the Clipboard API is unavailable (e.g. happy-dom). */
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
      title="Copy code"
      onClick={handleClick}
      className={CODE_COPY_BUTTON_CLASSES}
      data-code-copy
    >
      {copied ? (
        <Check aria-hidden className={CODE_COPY_ICON_CLASSES} />
      ) : (
        <Copy aria-hidden className={CODE_COPY_ICON_CLASSES} />
      )}
      <span aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/** Which family glyph heads the panel: `</>` for code, `[ ]` for pseudocode. */
export type CodePanelKind = "code" | "pseudocode";

/** The code family tile: a small solid tile in the code family hue with the panel's glyph. */
export function CodeFamilyTile({ kind = "code" }: { kind?: CodePanelKind }) {
  const Glyph = kind === "pseudocode" ? Brackets : CodeXml;
  return (
    <span className={CODE_TILE_CLASSES} aria-hidden data-code-tile={kind}>
      <Glyph className={CODE_TILE_ICON_CLASSES} strokeWidth={2.25} />
    </span>
  );
}

/** Header strip: family tile, quiet language label (or the edit surface's picker slot), copy button right. */
export function CodeBlockHeader({
  languageLabel,
  languageSelect,
  copyText,
  nonEditable,
  kind = "code",
}: {
  languageLabel: string | null;
  languageSelect?: ReactNode;
  copyText: () => string;
  nonEditable?: boolean;
  kind?: CodePanelKind;
}) {
  return (
    <div
      className={CODE_HEADER_CLASSES}
      contentEditable={nonEditable ? false : undefined}
      data-code-header
    >
      <CodeFamilyTile kind={kind} />
      {languageSelect ??
        (languageLabel ? (
          <span className={CODE_LANG_LABEL_CLASSES} data-code-lang>
            {languageLabel}
          </span>
        ) : null)}
      <CodeCopyButton copyText={copyText} />
    </div>
  );
}

/**
 * One note, stacked: the head row holds its `L3–5` range chip and the bold
 * title (when present); the note text sits on its own lines below. The whole note is the control
 * (a button). Inside a LinkGroup (annotated READ surface) it is a link target
 * keyed by the annotation's `lines` key — hover / focus lights the pair,
 * click or Enter pins it; without one (edit surface) the hook is inert and
 * the callback props (data-active/data-lit, onNoteClick/onNoteHover) drive.
 * Lit: the note takes the line tint, its body steps up to the panel ink and
 * the chip takes the link color.
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
  const lit = isLit || link.lit;
  return (
    <button
      type="button"
      title={`Lines ${annotation.lines}`}
      data-annotation-note={index}
      data-active={isActive || undefined}
      data-lit={lit || undefined}
      onClick={onNoteClick ? () => onNoteClick(index) : undefined}
      onMouseEnter={onNoteHover ? () => onNoteHover(index) : undefined}
      onMouseLeave={onNoteHover ? () => onNoteHover(null) : undefined}
      {...link.targetProps}
      className={cn(CODE_NOTE_CLASSES, lit && CODE_NOTE_LIT_CLASSES)}
    >
      <span className={CODE_NOTE_HEAD_CLASSES} data-note-head>
        <RangeChip lines={annotation.lines} lit={lit} className={CODE_NOTE_CHIP_CLASSES} />
        {annotation.label && <span className={CODE_NOTE_LABEL_CLASSES} data-note-title>{annotation.label} </span>}
      </span>
      <span className={CODE_NOTE_BODY_CLASSES} data-note-body>{annotation.note}</span>
    </button>
  );
}

/**
 * The notes column inside the panel (under the code in a narrow block), on a
 * slightly lighter surface behind the panel hairline — no header, no
 * dividers between notes. Pairing: inside a
 * LinkGroup the shared engine lights/pins by the annotation's lines key;
 * otherwise hovering lights via onNoteHover and clicking sticky-toggles via
 * onNoteClick (edit surface).
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
  /** Effective lit pair (hover ?? sticky). Defaults to activeIndex. */
  litIndex?: number | null;
  onNoteClick?: (index: number) => void;
  onNoteHover?: (index: number | null) => void;
  nonEditable?: boolean;
}) {
  const lit = litIndex === undefined ? activeIndex : litIndex;
  return (
    <aside
      aria-label="Code notes"
      className={cn(CODE_NOTES_ASIDE_CLASSES, nonEditable && "select-none whitespace-normal")}
      contentEditable={nonEditable ? false : undefined}
      data-code-notes
    >
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
    </aside>
  );
}

/**
 * The block layout around a panel that has notes: a size container (the
 * notes breakpoint follows the block's own width) holding the panel frame.
 * Without notes, callers render the panel bare.
 */
export function CodeNotesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={CODE_LAYOUT_CLASSES} data-code-layout>
      {children}
    </div>
  );
}

/** The panel body under the header strip when notes exist: the code | notes grid. */
export function CodeNotesBody({ children }: { children: ReactNode }) {
  return (
    <div className={CODE_BODY_GRID_CLASSES} data-code-body>
      {children}
    </div>
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
  frameClassName,
  frameAttributes,
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
  /** Extra classes on the panel frame. */
  frameClassName?: string;
  /** Extra attributes on the panel frame (e.g. data-language). */
  frameAttributes?: Record<string, string | undefined>;
  /** The code cell — the content wrapper grid's second column (a <pre>). */
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const runs = annotationRuns ?? [];
  const hasNotes = Boolean(annotations && annotations.length > 0);
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
    body.scrollTop = Math.max(0, (run.start - 1) * resolveLineHeightPx(body) - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs is derived per render; activeIndex is the trigger
  }, [activeIndex]);

  const furniture = nonEditableFurniture ? { contentEditable: false as const } : {};

  const scrollBody = (
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
              // The run as unitless vars; CODE_ANNOTATION_ROW_CLASSES
              // multiplies them by the line-height token, so the overlay
              // tracks the knob with the rows and the zebra.
              style={
                {
                  "--docs-code-row-start": run.start - 1,
                  "--docs-code-row-span": run.length,
                } as CSSProperties
              }
              className={cn(CODE_ANNOTATION_ROW_CLASSES, isLit && CODE_ANNOTATION_ROW_LIT_CLASSES)}
              {...furniture}
            />
          );
        })}
        <div className={CODE_GUTTER_CLASSES} data-code-gutter {...furniture}>
          {Array.from({ length: lineCount }, (_, index) => {
            const line = index + 1;
            const owner = lineOwner.get(line);
            const isAnnotated = owner !== undefined;
            const runStart = isAnnotated && lineOwner.get(line - 1) !== owner;
            const runEnd = isAnnotated && lineOwner.get(line + 1) !== owner;
            return (
              <div
                key={line}
                data-code-gutter-line={line}
                data-annotated={isAnnotated || undefined}
                className={cn(
                  "relative",
                  CODE_GUTTER_LINE_CLASSES,
                  isAnnotated && CODE_GUTTER_LINE_ANNOTATED_CLASSES,
                  runStart && CODE_GUTTER_MARK_START_CLASSES,
                  runEnd && CODE_GUTTER_MARK_END_CLASSES,
                  isAnnotated && owner === litIndex && CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
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
  );

  const frame = (
    <div
      {...frameAttributes}
      className={cn("group/code", CODE_BLOCK_CLASSES, hasNotes && CODE_FRAME_IN_LAYOUT_CLASSES, frameClassName)}
      data-code-surface="true"
    >
      <CodeBlockHeader
        languageLabel={languageLabel}
        languageSelect={languageSelect}
        copyText={copyText}
        nonEditable={nonEditableFurniture}
      />
      {hasNotes && annotations ? (
        <CodeNotesBody>
          {scrollBody}
          <CodeNotesAside
            annotations={annotations}
            activeIndex={activeIndex ?? null}
            litIndex={litIndex}
            onNoteClick={onNoteClick}
            onNoteHover={setHoverIndex}
            nonEditable={nonEditableFurniture}
          />
        </CodeNotesBody>
      ) : (
        scrollBody
      )}
    </div>
  );

  if (!hasNotes) return frame;
  return <CodeNotesLayout>{frame}</CodeNotesLayout>;
}
