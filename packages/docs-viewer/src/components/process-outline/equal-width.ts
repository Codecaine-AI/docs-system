/*
 * Consecutive process outlines share one width.
 *
 * Each outline shrinks to its content (width: fit-content, capped at the lane by
 * max-width: 100%), so a run of outlines stacked on a page (Run mode / Before /
 * After) would end ragged. CSS cannot size siblings to the widest of their run,
 * so this measures: every outline in a run takes the widest natural width of
 * the run as an inline `width`, which the stylesheet's max-width still caps.
 *
 * A block's "unit" is the highest ancestor of its section that holds no other
 * process outline (the read renderer's lane wrapper, the editor's node-view
 * root); a run is a maximal chain of adjacent element siblings that are units.
 * That reading works for both renderers without knowing their wrappers.
 *
 * One pass runs per animation frame however many outlines ask for it. A pass
 * clears the inline widths, reads every natural width, then writes the run
 * widths, so it never observes its own output. The resize observer watches
 * the full-width sections (whose size follows the lane, not the content), so
 * writing a width cannot re-trigger it: no layout loop.
 */

const BLOCK_SELECTOR = '[data-docs-block-type="process-outline"]';
const OUTLINE_SELECTOR = ".docs-process-outline";

let frame = 0;
let observer: ResizeObserver | null = null;
let fontsHooked = false;
const sectionWidths = new WeakMap<Element, number>();

function unitOf(section: Element): Element {
  let unit = section;
  while (unit.parentElement && unit.parentElement.querySelectorAll(BLOCK_SELECTOR).length === 1) unit = unit.parentElement;
  return unit;
}

function outlineOf(unit: Element): HTMLElement | null {
  const section = unit.matches(BLOCK_SELECTOR) ? unit : unit.querySelector(BLOCK_SELECTOR);
  return section?.querySelector<HTMLElement>(OUTLINE_SELECTOR) ?? null;
}

/** Groups every outline on the page into runs of adjacent siblings. */
function collectRuns(root: ParentNode): HTMLElement[][] {
  const units = new Set<Element>();
  for (const section of root.querySelectorAll(BLOCK_SELECTOR)) units.add(unitOf(section));
  const runs: HTMLElement[][] = [];
  const seen = new Set<Element>();
  for (const unit of units) {
    if (seen.has(unit)) continue;
    let first = unit;
    while (first.previousElementSibling && units.has(first.previousElementSibling)) first = first.previousElementSibling;
    const run: HTMLElement[] = [];
    for (let cursor: Element | null = first; cursor && units.has(cursor); cursor = cursor.nextElementSibling) {
      seen.add(cursor);
      const outline = outlineOf(cursor);
      if (outline) run.push(outline);
    }
    runs.push(run);
  }
  return runs;
}

export function equalizeProcessOutlineWidths(root: ParentNode = document): void {
  const runs = collectRuns(root);
  // Clear first, then read everything, then write: one forced layout, no reads after writes.
  for (const run of runs) for (const outline of run) outline.style.width = "";
  const widths = runs.map((run) => Math.max(0, ...run.map((outline) => Math.ceil(outline.getBoundingClientRect().width))));
  runs.forEach((run, index) => {
    if (run.length < 2) return;
    for (const outline of run) outline.style.width = `${widths[index]}px`;
  });
}

/** Queues one equalizing pass for the next frame; repeated calls in a frame coalesce. */
export function scheduleProcessOutlineEqualize(): void {
  if (typeof window === "undefined" || typeof document === "undefined" || frame) return;
  const raf = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
  frame = raf(() => {
    frame = 0;
    equalizeProcessOutlineWidths();
  }) as number;
}

/**
 * Registers a rendered outline section: equalizes now (next frame) and again
 * whenever the section's lane width changes. Returns the cleanup.
 */
export function trackProcessOutline(section: Element | null): () => void {
  if (!section) return () => {};
  scheduleProcessOutlineEqualize();
  // Natural widths change once the web fonts land.
  if (!fontsHooked && typeof document !== "undefined" && document.fonts?.ready) {
    fontsHooked = true;
    void document.fonts.ready.then(scheduleProcessOutlineEqualize);
  }
  if (typeof ResizeObserver === "undefined") return () => scheduleProcessOutlineEqualize();
  observer ??= new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const width = Math.round(entry.contentRect.width);
      if (sectionWidths.get(entry.target) !== width) { sectionWidths.set(entry.target, width); changed = true; }
    }
    if (changed) scheduleProcessOutlineEqualize();
  });
  observer.observe(section);
  return () => {
    observer?.unobserve(section);
    // The run this outline left may now be narrower.
    scheduleProcessOutlineEqualize();
  };
}
