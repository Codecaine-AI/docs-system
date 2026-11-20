"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Full-screen viewers open non-modal, so the host page around them (a sidebar,
 * tabs) stays usable. They fill the host's viewer area: the CSS property
 * `--docs-viewer-inset` (an `inset` value, default 0, the whole window).
 * An open viewer carries `data-docs-viewer`, so a host can lift its own
 * chrome over it only while one is open.
 * A non-modal dialog gets no Escape cancel, so this closes the viewer on Escape.
 */
export function useViewerEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, close]);
}

type CloseOptions = {
  /** The element inside the viewer that shows what the preview shows: the image or the diagram. */
  content?: HTMLElement | null;
  /** Where `content` lands: the image or diagram inside the preview. Defaults to the preview. */
  target?: HTMLElement | null;
  /**
   * Width over height of what `content` draws, when it draws it centered and
   * fitted inside a larger box (a canvas stage). The part of `content` that
   * lands on `target` is then that fitted box, not all of `content`.
   */
  contentAspect?: number;
};

const CLOSE_MS = 240;

/** Shared inline-to-viewer motion. The caller owns mounting, focus, and modal state. */
export function useViewerMotion() {
  const originRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const fadesRef = useRef<Animation[]>([]);
  const closingRef = useRef(false);

  const cancel = useCallback(() => {
    animationRef.current?.cancel();
    animationRef.current = null;
    for (const fade of fadesRef.current) fade.cancel();
    fadesRef.current = [];
    closingRef.current = false;
  }, []);
  useEffect(() => cancel, [cancel]);

  const captureOrigin = useCallback((element: HTMLElement | null) => {
    originRef.current = element?.getBoundingClientRect() ?? null;
  }, []);

  const animateOpen = useCallback((viewer: HTMLElement | null) => {
    cancel();
    const origin = originRef.current;
    if (!viewer || !origin || !canAnimate(viewer, origin)) return;
    const animation = viewer.animate([
      { transform: transformTo(viewer, origin) },
      { transform: "none" },
    ], { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    animationRef.current = animation;
    void animation.finished.then(() => {
      if (animationRef.current === animation) animationRef.current = null;
    }, () => {});
  }, [cancel]);

  /**
   * Shrinks the viewer back onto the inline preview, then calls `finish`.
   * With `content` (the image or diagram the viewer shows), the content lands
   * on `target` (the same thing in the preview), while the viewer's header,
   * background and other chrome fade out. The content then fades into the
   * preview under it, so no frame of the viewer stays on screen at the end.
   * Without `content`, the whole viewer lands on the preview and fades out.
   */
  const animateClose = useCallback((viewer: HTMLElement | null, preview: HTMLElement | null, finish: () => void, options: CloseOptions = {}) => {
    if (closingRef.current) return;
    const currentTransform = viewer ? getComputedStyle(viewer).transform : "none";
    cancel();
    const target = (options.target ?? preview)?.getBoundingClientRect();
    if (!viewer || !target || !canAnimate(viewer, target)) { finish(); return; }
    const content = options.content && viewer.contains(options.content) ? options.content : null;
    const from = content ? fitted(content.getBoundingClientRect(), options.contentAspect) : undefined;
    const landing = content && from && from.width > 0 && from.height > 0
      ? landContentOn(viewer, from, target)
      : transformTo(viewer, target);
    closingRef.current = true;
    const timing = { duration: CLOSE_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" } as const;
    const animation = viewer.animate([
      { transform: currentTransform },
      { transform: landing },
    ], timing);
    const fades = content
      ? [...fadeChrome(viewer, content), fadeOut(content, 0.6)]
      : [fadeOut(viewer, 0.4)];
    animationRef.current = animation;
    fadesRef.current = fades;
    void animation.finished.then(() => {
      if (animationRef.current === animation) finish();
    }, () => {});
  }, [cancel]);

  return { originRef, captureOrigin, animateOpen, animateClose, cancel };
}

function canAnimate(viewer: HTMLElement, target: DOMRect): boolean {
  return typeof viewer.animate === "function" && viewer.offsetWidth > 0 && viewer.offsetHeight > 0
    && target.width > 0 && target.height > 0
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Viewer elements use transform-origin: top left and viewport-aligned positioning. */
function transformTo(viewer: HTMLElement, target: DOMRect): string {
  const bounds = viewer.getBoundingClientRect();
  return `translate(${target.x - bounds.x}px, ${target.y - bounds.y}px) scale(${target.width / viewer.offsetWidth}, ${target.height / viewer.offsetHeight})`;
}

/**
 * The viewer transform that puts `content` (now at `from`) on `target`, with
 * one scale for both axes, centered in `target`, so the content never stretches.
 * With transform-origin top left, a point p moves to V + t + s * (p - V),
 * where V is the viewer's top left corner. Solve that for `from` to land on `target`.
 */
function landContentOn(viewer: HTMLElement, from: Rect, target: DOMRect): string {
  const bounds = viewer.getBoundingClientRect();
  const scale = Math.min(target.width / from.width, target.height / from.height);
  const left = target.x + (target.width - scale * from.width) / 2;
  const top = target.y + (target.height - scale * from.height) / 2;
  const x = left - bounds.x - scale * (from.x - bounds.x);
  const y = top - bounds.y - scale * (from.y - bounds.y);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

type Rect = { x: number; y: number; width: number; height: number };

/** The centered box of `aspect` (width over height) that fits inside `box`. */
function fitted(box: DOMRect, aspect: number | undefined): Rect {
  if (!aspect || !(aspect > 0) || box.width <= 0 || box.height <= 0) return box;
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Fades everything in the viewer that is not `content`: each sibling on the
 * path from `content` up to the viewer fades out, and each box on that path
 * drops its background and its outline, so only the content is left to land on the preview.
 */
function fadeChrome(viewer: HTMLElement, content: HTMLElement): Animation[] {
  const fades: Animation[] = [];
  const timing = { duration: CLOSE_MS * 0.5, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "forwards" } as const;
  for (let node: HTMLElement = content; node !== viewer && node.parentElement; node = node.parentElement) {
    const box = node.parentElement;
    for (const sibling of Array.from(box.children)) {
      if (sibling !== node && sibling instanceof HTMLElement) fades.push(sibling.animate([{ opacity: 1 }, { opacity: 0 }], timing));
    }
    const style = getComputedStyle(box);
    // A focused viewport draws a focus ring, so its outline fades with its background.
    fades.push(box.animate([
      { backgroundColor: style.backgroundColor, outlineColor: style.outlineColor },
      { backgroundColor: "transparent", outlineColor: "transparent" },
    ], timing));
  }
  return fades;
}

/** Fades `element` out over the last part of the close, from `start` (0 to 1) to the end. */
function fadeOut(element: HTMLElement, start: number): Animation {
  return element.animate([
    { opacity: 1, offset: 0 },
    { opacity: 1, offset: start },
    { opacity: 0, offset: 1 },
  ], { duration: CLOSE_MS, easing: "linear", fill: "forwards" });
}
