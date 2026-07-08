"use client";

import { useMemo, useState } from "react";
import { MessageSquareCodeIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";

export type CodeAnnotation = {
  /** 1-indexed line range: "4" or "4-9" (comma lists like "1,4-6" also work). */
  lines: string;
  label?: string;
  note: string;
};

/**
 * Expand an annotation's `lines` string ("3", "2-5", "1,4-6") into the set of
 * 1-indexed line numbers it covers, clamped to [1, maxLine]. Unparseable or
 * fully out-of-range parts contribute nothing, so bad input never crashes.
 */
function expandLineRange(lines: string, maxLine: number): Set<number> {
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
 * Side-annotated code block (used only when annotations exist — the plain
 * code path stays with the registry). Renders numbered code lines with a
 * sky-tinted highlight + sky gutter over annotated ranges, and each note as a
 * sky-bordered card in a side column on wide viewports (stacked below the
 * code on narrow ones). Clicking an annotated range in the code or its note
 * card highlights the pair with a stronger sky ring; one pair is active at a
 * time, and clicking the same pair again (or a plain line) clears it.
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const lines = useMemo(() => code.split("\n"), [code]);

  /** Per-annotation covered line sets (clamped; possibly empty). */
  const ranges = useMemo(
    () => annotations.map((annotation) => expandLineRange(annotation.lines, lines.length)),
    [annotations, lines.length],
  );

  /** First annotation covering each line — overlaps resolve to the earliest note. */
  const lineOwner = useMemo(() => {
    const owner = new Map<number, number>();
    ranges.forEach((range, index) => {
      for (const line of range) {
        if (!owner.has(line)) owner.set(line, index);
      }
    });
    return owner;
  }, [ranges]);

  const toggle = (index: number) =>
    setActiveIndex((current) => (current === index ? null : index));

  const handleLineClick = (lineNumber: number) => {
    const owner = lineOwner.get(lineNumber);
    if (owner === undefined) {
      setActiveIndex(null);
      return;
    }
    toggle(owner);
  };

  return (
    <section
      className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
      data-code-annotations={id}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-sky-500/10 px-3 py-2">
        <MessageSquareCodeIcon className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="font-display text-xs font-medium uppercase tracking-wider text-sky-700 dark:text-sky-300">
          Annotated Code
        </span>
        {language && <Badge variant="outline">{language}</Badge>}
        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <pre className="max-h-[440px] overflow-auto bg-background p-0 font-mono text-xs leading-relaxed">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const owner = lineOwner.get(lineNumber);
            const isAnnotated = owner !== undefined;
            const isActive = isAnnotated && activeIndex !== null && ranges[activeIndex].has(lineNumber);
            return (
              <div
                key={index}
                data-code-line={lineNumber}
                data-annotated={isAnnotated || undefined}
                data-active={isActive || undefined}
                onClick={() => handleLineClick(lineNumber)}
                className={cn(
                  "grid grid-cols-[3rem_minmax(0,1fr)] border-b border-border/30 border-l-2",
                  isAnnotated
                    ? "cursor-pointer border-l-sky-500 bg-sky-500/10 dark:border-l-sky-400"
                    : "border-l-transparent",
                  isActive &&
                    "bg-sky-500/20 ring-1 ring-inset ring-sky-500/70 dark:bg-sky-400/20 dark:ring-sky-400/70",
                )}
              >
                <span
                  className={cn(
                    "select-none px-2 py-1 text-right",
                    isAnnotated
                      ? "bg-sky-500/15 font-medium text-sky-700 dark:text-sky-300"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {lineNumber}
                </span>
                <code className="px-3 py-1">{line || " "}</code>
              </div>
            );
          })}
        </pre>
        <aside className="border-t bg-background p-3 lg:border-l lg:border-t-0">
          <div className="mb-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Notes
          </div>
          <div className="grid gap-2">
            {annotations.map((annotation, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  key={`${annotation.lines}-${annotation.label ?? annotation.note}`}
                  type="button"
                  data-annotation-note={index}
                  data-active={isActive || undefined}
                  onClick={() => toggle(index)}
                  className={cn(
                    "rounded border border-sky-500/30 bg-sky-500/5 p-2 text-left text-xs transition-colors",
                    isActive &&
                      "bg-sky-500/10 ring-2 ring-sky-500/70 dark:bg-sky-400/10 dark:ring-sky-400/70",
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-sky-600/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:text-sky-300"
                    >
                      L{annotation.lines}
                    </Badge>
                    {annotation.label && (
                      <span className="font-medium text-foreground">{annotation.label}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">{annotation.note}</div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
