"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

/** Content placement inside the viewport: `translate(x, y) scale(zoom)`, origin 0 0. */
export type PanZoomView = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
type Size = { width: number; height: number };
/** `fit` is the zoom that frames the whole content; readout and clamps are relative to it. */
type View = PanZoomView & { fit: number };

const FIT_PADDING = 24;
const MAX_ZOOM = 8;
const BUTTON_STEP = 1.25;
const KEY_PAN = 48;
/** A wheel notch reports ~100px (or 3 lines); clamping keeps it near 1.35x while pinch deltas pass through. */
const MAX_WHEEL_DELTA = 30;
const LINE_HEIGHT = 16;

/** Keeps the content point under `point` (viewport px) fixed while changing zoom. */
export function zoomAtPoint(view: PanZoomView, point: Point, zoom: number): PanZoomView {
  const ratio = zoom / view.zoom;
  return { zoom, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/** Largest zoom that shows all of `content` inside `viewport`, centered. Unmeasured sizes fall back to 1. */
export function fitContent(viewport: Size, content: Size): PanZoomView {
  const availableWidth = viewport.width - FIT_PADDING * 2;
  const availableHeight = viewport.height - FIT_PADDING * 2;
  const zoom = content.width > 0 && content.height > 0 && availableWidth > 0 && availableHeight > 0
    ? Math.min(availableWidth / content.width, availableHeight / content.height)
    : 1;
  return { zoom, x: (viewport.width - content.width * zoom) / 2, y: (viewport.height - content.height * zoom) / 2 };
}

/** Wheel deltaY normalized to pixels and clamped, then mapped to a multiplicative zoom factor. */
export function wheelZoomFactor(event: Pick<WheelEvent, "deltaY" | "deltaMode">, pageHeight: number): number {
  const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? pageHeight : 1;
  const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, event.deltaY * unit));
  return Math.exp(-delta * 0.01);
}

const minZoom = (view: View) => view.fit * 0.5;
const maxZoom = (view: View) => Math.max(MAX_ZOOM, view.fit);
const ZOOM_EPSILON = 1e-6;

type UsePanZoomArgs = {
  viewportRef: RefObject<HTMLElement | null>;
  contentWidth: number;
  contentHeight: number;
  /** Listeners attach and the view fits while true (the dialog is open). */
  enabled: boolean;
};

/**
 * Map-style navigation for a fixed-size content layer: wheel zooms toward the
 * cursor, left-drag pans, arrows pan, +/-/0 zoom and fit. Fits on enable and
 * re-fits on a viewport or content resize until the user moves the view.
 *
 * Window/DOM APIs are touched only inside effects and handlers, so the hook
 * renders on the server. Call it after any effect that makes the viewport
 * visible (e.g. `showModal`) so the first fit measures a laid-out box.
 */
export function usePanZoom({ viewportRef, contentWidth, contentHeight, enabled }: UsePanZoomArgs) {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1, fit: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const movedRef = useRef(false);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const viewportSize = useCallback((): Size => {
    const viewport = viewportRef.current;
    return { width: viewport?.clientWidth ?? 0, height: viewport?.clientHeight ?? 0 };
  }, [viewportRef]);

  const fit = useCallback(() => {
    movedRef.current = false;
    const next = fitContent(viewportSize(), { width: contentWidth, height: contentHeight });
    setView({ ...next, fit: next.zoom });
  }, [viewportSize, contentWidth, contentHeight]);

  const zoomBy = useCallback((factor: number, point?: Point) => {
    movedRef.current = true;
    const size = viewportSize();
    const anchor = point ?? { x: size.width / 2, y: size.height / 2 };
    setView(previous => {
      const zoom = Math.min(maxZoom(previous), Math.max(minZoom(previous), previous.zoom * factor));
      return { ...previous, ...zoomAtPoint(previous, anchor, zoom) };
    });
  }, [viewportSize]);

  const zoomIn = useCallback(() => zoomBy(BUTTON_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / BUTTON_STEP), [zoomBy]);

  const panBy = useCallback((dx: number, dy: number) => {
    movedRef.current = true;
    setView(previous => ({ ...previous, x: previous.x + dx, y: previous.y + dy }));
  }, []);

  // `fit` changes identity with the content size: opening always fits, while a
  // later size change (text re-measured once fonts load) re-fits only a view
  // the user has not moved.
  const openRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      openRef.current = false;
      panRef.current = null;
      setIsPanning(false);
      return;
    }
    if (!openRef.current || !movedRef.current) fit();
    openRef.current = true;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (!movedRef.current) fit(); });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [enabled, fit, viewportRef]);

  // Native, non-passive so preventDefault stops page scroll. Events are
  // coalesced into one commit per animation frame at the latest cursor point.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;
    let factor = 1;
    let point: Point = { x: 0, y: 0 };
    let frame = 0;
    const commit = () => {
      frame = 0;
      const pending = factor;
      factor = 1;
      zoomBy(pending, point);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      factor *= wheelZoomFactor(event, viewport.clientHeight);
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = requestAnimationFrame(commit);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, viewportRef, zoomBy]);

  const endPan = useCallback((event: PointerEvent<HTMLElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
  }, []);

  const viewportProps = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      // Capture throws for pointers the browser no longer considers active; the pan works without it.
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* best-effort */ }
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setIsPanning(true);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      panBy(event.clientX - pan.x, event.clientY - pan.y);
      pan.x = event.clientX;
      pan.y = event.clientY;
    },
    onPointerUp: endPan,
    onPointerCancel: endPan,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEY_PAN * 4 : KEY_PAN;
      switch (event.key) {
        case "ArrowLeft": panBy(step, 0); break;
        case "ArrowRight": panBy(-step, 0); break;
        case "ArrowUp": panBy(0, step); break;
        case "ArrowDown": panBy(0, -step); break;
        case "+": case "=": zoomIn(); break;
        case "-": case "_": zoomOut(); break;
        case "0": fit(); break;
        default: return;
      }
      event.preventDefault();
    },
  };

  return {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    /** Percent of the fitted zoom: Fit is always 100%. */
    zoomPercent: Math.round((view.zoom / view.fit) * 100),
    canZoomIn: view.zoom < maxZoom(view) - ZOOM_EPSILON,
    canZoomOut: view.zoom > minZoom(view) + ZOOM_EPSILON,
    zoomIn,
    zoomOut,
    fit,
    isPanning,
    viewportProps,
  };
}
