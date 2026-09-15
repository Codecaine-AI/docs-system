import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PageTransition } from "../PageTransition";

const originalAnimate = HTMLElement.prototype.animate;
const originalMatchMedia = window.matchMedia;
let animations: Array<{ finish: () => void; cancel: ReturnType<typeof mock>; duration: number }>;
beforeEach(() => {
  animations = [];
  HTMLElement.prototype.animate = function (_frames, options) {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const cancel = mock(() => {});
    animations.push({ finish, cancel, duration: (options as KeyframeAnimationOptions).duration as number });
    return { finished, cancel } as unknown as Animation;
  };
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
});
const finish = async (index: number) => { await act(async () => { animations[index]!.finish(); }); };

it("fades out the old page, waits for data, then fades in the new page", async () => {
  const view = render(<PageTransition pageKey="a">Page A</PageTransition>);
  view.rerender(<PageTransition pageKey="b" ready={false}>Loading B</PageTransition>);
  expect(screen.getByText("Page A")).toBeTruthy();
  expect(animations[0]!.duration).toBe(80);
  expect(view.container.firstElementChild!.hasAttribute("inert")).toBe(true);
  await finish(0);
  expect(screen.queryByText("Loading B")).toBeNull();
  expect((view.container.firstElementChild as HTMLElement).style.opacity).toBe("0");
  view.rerender(<PageTransition pageKey="b">Page B</PageTransition>);
  expect(screen.getByText("Page B")).toBeTruthy();
  expect(animations[1]!.duration).toBe(120);
  await finish(1);
  expect(view.container.firstElementChild!.getAttribute("data-docs-page-transition")).toBe("idle");
});

it("updates edits on the same page without animating", () => {
  const view = render(<PageTransition pageKey="a">Before</PageTransition>);
  view.rerender(<PageTransition pageKey="a">After</PageTransition>);
  expect(screen.getByText("After")).toBeTruthy();
  expect(animations).toHaveLength(0);
});

it("cancels stale navigation and recovers when returning to the outgoing page", async () => {
  const view = render(<PageTransition pageKey="a">Page A</PageTransition>);
  view.rerender(<PageTransition pageKey="b">Page B</PageTransition>);
  view.rerender(<PageTransition pageKey="c">Page C</PageTransition>);
  expect(animations[0]!.cancel).toHaveBeenCalled();
  await finish(0);
  expect(screen.getByText("Page A")).toBeTruthy();
  view.rerender(<PageTransition pageKey="a">Page A</PageTransition>);
  await finish(1);
  expect(view.container.firstElementChild!.getAttribute("data-docs-page-transition")).toBe("idle");
  expect(view.container.firstElementChild!.hasAttribute("inert")).toBe(false);
});

it("skips animations for reduced motion", () => {
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  const view = render(<PageTransition pageKey="a">Page A</PageTransition>);
  view.rerender(<PageTransition pageKey="b">Page B</PageTransition>);
  expect(screen.getByText("Page B")).toBeTruthy();
  expect(animations).toHaveLength(0);
});

it("reads the host's custom timing and cancels animations on unmount", () => {
  const view = render(<PageTransition pageKey="a">Page A</PageTransition>);
  (view.container.firstElementChild as HTMLElement).style.setProperty("--docs-page-fade-out", "240ms");
  view.rerender(<PageTransition pageKey="b">Page B</PageTransition>);
  expect(animations[0]!.duration).toBe(240);
  view.unmount();
  expect(animations[0]!.cancel).toHaveBeenCalled();
});


it("supports disabling transitions and zero durations", () => {
  const view = render(<PageTransition pageKey="a">Page A</PageTransition>);
  (view.container.firstElementChild as HTMLElement).style.setProperty("--docs-page-transition-type", "none");
  view.rerender(<PageTransition pageKey="b">Page B</PageTransition>);
  expect(screen.getByText("Page B")).toBeTruthy();
  expect(animations).toHaveLength(0);
});
