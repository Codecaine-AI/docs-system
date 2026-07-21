"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "../../../ui/cn";

const BAR_BASE_CLASSES =
  "absolute z-[2] flex items-center justify-center rounded-sm bg-muted/50 text-muted-foreground transition-opacity duration-200 ease-out hover:bg-muted";

/** Hover dwell before an add bar shows its tooltip (matches Notion's feel). */
export const ADD_BAR_TOOLTIP_DELAY_MS = 400;

const TOOLTIP_CLASSES =
  // w-max: the bars are only 16px wide, so an absolutely positioned tooltip
  // would otherwise shrink-to-fit against that containing block.
  "pointer-events-none absolute z-50 w-max whitespace-nowrap rounded-sm px-2 py-1 text-xs shadow-md bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900";

function barVisibility(forced: boolean): string {
  return forced ? "opacity-100" : "opacity-0 hover:opacity-100";
}

/** One bold-lead tooltip line ("Click to add a new column"). */
type TooltipLine = { lead: string; rest: string };

/**
 * Local dwell-timer tooltip state: `open` flips true ADD_BAR_TOOLTIP_DELAY_MS
 * after mouseenter, and any leave/mousedown cancels immediately.
 */
function useBarTooltip() {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setOpen(true);
    }, ADD_BAR_TOOLTIP_DELAY_MS);
  };

  return { open, onMouseEnter, cancel };
}

function BarTooltip({
  lines,
  placementClasses,
}: {
  lines: TooltipLine[];
  placementClasses: string;
}) {
  return (
    <span contentEditable={false} data-table-add-tooltip="" className={cn(TOOLTIP_CLASSES, placementClasses)}>
      {lines.map((line) => (
        <span key={line.lead} className="block">
          <span className="font-semibold">{line.lead}</span>
          {line.rest}
        </span>
      ))}
    </span>
  );
}

/**
 * The three Notion-style append affordances, absolutely positioned 2px
 * outside the table edges inside the surface div: a full-height 16px bar on
 * the right (columns), a full-width 16px bar on the bottom (rows), and a 16px
 * corner square (both). Invisible at rest; each bar fades in when itself
 * hovered, and the right/bottom bars also light up while the pointer is on
 * the last column/row of the grid.
 *
 * The right/bottom bars read as "expand": col/row-resize cursors, and their
 * mousedown feeds useAddDrag — a plain click (inside the drag dead zone)
 * still appends exactly one, while dragging adds/removes live. Dwelling
 * ~400ms pops a dark two-line tooltip explaining both. The corner stays a
 * plain click.
 */
export function AddButtons({
  lastColumnHovered,
  lastRowHovered,
  onColumnBarMouseDown,
  onRowBarMouseDown,
  onAddBoth,
}: {
  lastColumnHovered: boolean;
  lastRowHovered: boolean;
  onColumnBarMouseDown: (event: ReactMouseEvent) => void;
  onRowBarMouseDown: (event: ReactMouseEvent) => void;
  onAddBoth: () => void;
}) {
  const columnTooltip = useBarTooltip();
  const rowTooltip = useBarTooltip();
  const cornerTooltip = useBarTooltip();

  return (
    <>
      <button
        type="button"
        contentEditable={false}
        aria-label="Add column"
        data-table-add-column=""
        className={cn(
          BAR_BASE_CLASSES,
          "cursor-col-resize",
          "-right-[18px] top-0 h-full w-4",
          barVisibility(lastColumnHovered),
        )}
        onMouseDown={(event) => {
          columnTooltip.cancel();
          onColumnBarMouseDown(event);
        }}
        onMouseEnter={columnTooltip.onMouseEnter}
        onMouseLeave={columnTooltip.cancel}
      >
        <PlusIcon aria-hidden className="h-3.5 w-3.5" />
        {columnTooltip.open && (
          <BarTooltip
            placementClasses="right-full top-1/2 mr-2 -translate-y-1/2 text-left"
            lines={[
              { lead: "Click", rest: " to add a new column" },
              { lead: "Drag", rest: " to add or remove columns" },
            ]}
          />
        )}
      </button>
      <button
        type="button"
        contentEditable={false}
        aria-label="Add row"
        data-table-add-row=""
        className={cn(
          BAR_BASE_CLASSES,
          "cursor-row-resize",
          "-bottom-[18px] left-0 h-4 w-full",
          barVisibility(lastRowHovered),
        )}
        onMouseDown={(event) => {
          rowTooltip.cancel();
          onRowBarMouseDown(event);
        }}
        onMouseEnter={rowTooltip.onMouseEnter}
        onMouseLeave={rowTooltip.cancel}
      >
        <PlusIcon aria-hidden className="h-3.5 w-3.5" />
        {rowTooltip.open && (
          <BarTooltip
            placementClasses="left-1/2 top-full mt-2 -translate-x-1/2 text-left"
            lines={[
              { lead: "Click", rest: " to add a new row" },
              { lead: "Drag", rest: " to add or remove rows" },
            ]}
          />
        )}
      </button>
      <button
        type="button"
        contentEditable={false}
        aria-label="Add column and row"
        data-table-add-both=""
        className={cn(
          BAR_BASE_CLASSES,
          "cursor-nwse-resize",
          "-bottom-[18px] -right-[18px] h-4 w-4",
          barVisibility(false),
        )}
        onMouseDown={(event) => {
          cornerTooltip.cancel();
          // ProseMirror must never see furniture mousedowns (node-selection
          // flicker); preventDefault also keeps focus in place.
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseEnter={cornerTooltip.onMouseEnter}
        onMouseLeave={cornerTooltip.cancel}
        onClick={onAddBoth}
      >
        <PlusIcon aria-hidden className="h-3.5 w-3.5" />
        {cornerTooltip.open && (
          <BarTooltip
            placementClasses="right-full top-1/2 mr-2 -translate-y-1/2 text-left"
            lines={[{ lead: "Click", rest: " to add a new column and row" }]}
          />
        )}
      </button>
    </>
  );
}
