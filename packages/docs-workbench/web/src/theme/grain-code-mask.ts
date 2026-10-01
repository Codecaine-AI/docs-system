/**
 * Keeps the grain overlay (StyleRailOverlay's full-viewport `.docs-grain-layer`,
 * fixed above every panel) off code panes, so a code surface reads as a flat
 * --docs-code-block-bg panel. On a light page the grain blends with `overlay`,
 * whose swing scales with the base's distance from white: invisible on paper,
 * heavy static on a #1E1E1E dark code panel.
 *
 * A CSS mask on the layer cuts one hole per visible code pane
 * ([data-code-surface], outermost only), clipped to the pane's scroll
 * containers so a pane scrolled under a sticky bar does not punch through
 * the bar. The holes are recomputed (once per frame at most) on scroll,
 * resize, DOM mutation, and pane resizes.
 */

export type GrainHole = { x: number; y: number; width: number; height: number };

const GRAIN_LAYER_SELECTOR = ".docs-grain-layer";
const CODE_SURFACE_SELECTOR = "[data-code-surface]";
const SOLID = "linear-gradient(#000 0 0)";

/**
 * Mask declarations for the grain layer: a full layer minus the union of the
 * holes (`subtract` on the top layer, `add` between the holes). Null when
 * there are no holes, so the mask can be dropped entirely.
 */
export function grainMaskDeclarations(holes: readonly GrainHole[]): Record<string, string> | null {
  const visible = holes.filter((hole) => hole.width > 0 && hole.height > 0);
  if (visible.length === 0) return null;
  const px = (value: number) => `${Math.round(value * 100) / 100}px`;
  return {
    "mask-image": [SOLID, ...visible.map(() => SOLID)].join(", "),
    "mask-size": ["100% 100%", ...visible.map((hole) => `${px(hole.width)} ${px(hole.height)}`)].join(", "),
    "mask-position": ["0 0", ...visible.map((hole) => `${px(hole.x)} ${px(hole.y)}`)].join(", "),
    "mask-repeat": "no-repeat",
    "mask-composite": ["subtract", ...visible.map(() => "add")].join(", "),
  };
}

/** Intersection of two rects; zero-size when they do not overlap. */
export function intersectRect(a: GrainHole, b: GrainHole): GrainHole {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function toHole(rect: DOMRect): GrainHole {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function clipsOverflow(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.overflowX !== "visible" || style.overflowY !== "visible";
}

/** Visible viewport rects of the outermost code panes. */
function codePaneHoles(clipCache: WeakMap<Element, Element[]>): GrainHole[] {
  const viewport: GrainHole = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const holes: GrainHole[] = [];
  for (const pane of document.querySelectorAll(CODE_SURFACE_SELECTOR)) {
    if (pane.parentElement?.closest(CODE_SURFACE_SELECTOR)) continue;
    let clippers = clipCache.get(pane);
    if (!clippers) {
      clippers = [];
      for (let node = pane.parentElement; node && node !== document.body; node = node.parentElement) {
        if (clipsOverflow(node)) clippers.push(node);
      }
      clipCache.set(pane, clippers);
    }
    let hole = intersectRect(toHole(pane.getBoundingClientRect()), viewport);
    for (const clipper of clippers) {
      if (hole.width === 0 || hole.height === 0) break;
      hole = intersectRect(hole, toHole(clipper.getBoundingClientRect()));
    }
    if (hole.width > 0 && hole.height > 0) holes.push(hole);
  }
  return holes;
}

function applyMask(layer: HTMLElement, holes: readonly GrainHole[]): void {
  const declarations = grainMaskDeclarations(holes);
  for (const property of ["mask-image", "mask-size", "mask-position", "mask-repeat", "mask-composite"]) {
    const value = declarations?.[property] ?? "";
    if (layer.style.getPropertyValue(property) !== value) {
      if (value) layer.style.setProperty(property, value);
      else layer.style.removeProperty(property);
    }
  }
}

/** Starts tracking; returns a stop function. Safe to call once at startup. */
export function installGrainCodeMask(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let clipCache = new WeakMap<Element, Element[]>();
  let frame = 0;
  const observed = new WeakSet<Element>();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());

  const update = () => {
    frame = 0;
    const layer = document.querySelector<HTMLElement>(GRAIN_LAYER_SELECTOR);
    if (!layer) return;
    if (resizeObserver) {
      for (const pane of document.querySelectorAll(CODE_SURFACE_SELECTOR)) {
        if (!observed.has(pane)) { observed.add(pane); resizeObserver.observe(pane); }
      }
    }
    applyMask(layer, codePaneHoles(clipCache));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const onMutation = (records: MutationRecord[]) => {
    // The mask's own style writes land here too; they change nothing to measure.
    if (records.every((record) => record.target instanceof Element && record.target.closest(GRAIN_LAYER_SELECTOR))) return;
    // Structure or classes changed: scroll containers may have moved.
    clipCache = new WeakMap();
    schedule();
  };

  const mutationObserver = new MutationObserver(onMutation);
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-code-panels", "data-theme", "hidden", "open"],
  });
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("transitionend", schedule, { capture: true, passive: true });
  document.addEventListener("animationend", schedule, { capture: true, passive: true });
  schedule();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", schedule);
    document.removeEventListener("transitionend", schedule, { capture: true });
    document.removeEventListener("animationend", schedule, { capture: true });
  };
}
