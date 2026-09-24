"use client";

import { useCallback, useEffect, useRef } from "react";

/** Shared inline-to-viewer motion. The caller owns mounting, focus, and modal state. */
export function useViewerMotion() {
  const originRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const closingRef = useRef(false);

  const cancel = useCallback(() => {
    animationRef.current?.cancel();
    animationRef.current = null;
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

  const animateClose = useCallback((viewer: HTMLElement | null, preview: HTMLElement | null, finish: () => void) => {
    if (closingRef.current) return;
    const target = preview?.getBoundingClientRect();
    const currentTransform = viewer ? getComputedStyle(viewer).transform : "none";
    cancel();
    if (!viewer || !target || !canAnimate(viewer, target)) { finish(); return; }
    closingRef.current = true;
    const animation = viewer.animate([
      { transform: currentTransform },
      { transform: transformTo(viewer, target) },
    ], { duration: 220, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
    animationRef.current = animation;
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
