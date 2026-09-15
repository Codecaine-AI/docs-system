"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Shared by full pages and previews. Hosts style it through inherited CSS variables. */
export function pageTransitionTiming(element: HTMLElement) {
  const css = getComputedStyle(element);
  const disabled = css.getPropertyValue("--docs-page-transition-type").trim() === "none"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const duration = (name: string, fallback: number) => {
    const raw = css.getPropertyValue(name).trim();
    const value = Number.parseFloat(raw);
    return disabled ? 0 : Number.isFinite(value)
      ? Math.min(800, Math.max(0, value * (raw.endsWith("ms") ? 1 : raw.endsWith("s") ? 1000 : 1)))
      : fallback;
  };
  return { out: duration("--docs-page-fade-out", 80), in: duration("--docs-page-fade-in", 120) };
}

/**
 * Keep the outgoing React tree until its fade finishes and the next page is ready.
 * Same-page edits render immediately. Only a page identity change runs a fade.
 * The old tree is inert while leaving, so its saved callbacks cannot be invoked
 * against the newly requested route. Unmount still runs the editor's save flush.
 */
export function PageTransition({ pageKey, ready = true, children, className }: {
  pageKey: string;
  ready?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const saved = useRef<ReactNode>(children);
  const [displayedKey, setDisplayedKey] = useState(pageKey);
  const [phase, setPhase] = useState<"idle" | "out" | "wait" | "in">("idle");
  const current = displayedKey === pageKey && ready;

  useLayoutEffect(() => {
    if (current) saved.current = children;
  }, [current, children]);

  useLayoutEffect(() => {
    if (pageKey === displayedKey) {
      if (phase === "out" || phase === "wait") setPhase("idle");
      return;
    }
    const node = element.current!;
    setPhase("out");
    let cancelled = false;
    const duration = pageTransitionTiming(node).out;
    const animation = duration && node.animate
      ? node.animate([{ opacity: getComputedStyle(node).opacity || 1 }, { opacity: 0 }], { duration, easing: "ease-out", fill: "forwards" })
      : null;
    const finish = () => { if (!cancelled) setPhase("wait"); };
    if (animation) void animation.finished.then(finish, finish);
    else finish();
    return () => { cancelled = true; animation?.cancel(); };
    // The requested key owns the outgoing animation, including rapid navigation.
  }, [pageKey, displayedKey]);

  useLayoutEffect(() => {
    if (phase !== "wait" || !ready) return;
    setDisplayedKey(pageKey);
    setPhase("in");
  }, [phase, ready, pageKey]);

  useLayoutEffect(() => {
    if (phase !== "in") return;
    const node = element.current!;
    let cancelled = false;
    const duration = pageTransitionTiming(node).in;
    const animation = duration && node.animate
      ? node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-in", fill: "both" })
      : null;
    const finish = () => { if (!cancelled) setPhase("idle"); };
    if (animation) void animation.finished.then(finish, finish);
    else finish();
    return () => { cancelled = true; animation?.cancel(); };
  }, [phase, displayedKey]);

  return <div ref={element} className={className} data-docs-page-transition={phase}
    aria-busy={!current} inert={!current || phase === "out" || phase === "wait"}
    style={{ opacity: phase === "wait" ? 0 : undefined }}>
    {current ? children : saved.current}
  </div>;
}
