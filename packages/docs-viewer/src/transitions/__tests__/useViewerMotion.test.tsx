import { afterEach, beforeEach, expect, it } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { useViewerMotion } from "../useViewerMotion";

type Recorded = { element: Element; frames: Keyframe[]; finish: () => void };
const originalAnimate = HTMLElement.prototype.animate;
const originalMatchMedia = window.matchMedia;
let animations: Recorded[];

beforeEach(() => {
  animations = [];
  HTMLElement.prototype.animate = function (this: HTMLElement, frames) {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    animations.push({ element: this, frames: frames as Keyframe[], finish });
    return { finished, cancel() {} } as unknown as Animation;
  };
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
  document.body.replaceChildren();
});

function place(element: HTMLElement, x: number, y: number, width: number, height: number) {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height);
  Object.defineProperty(element, "offsetWidth", { value: width });
  Object.defineProperty(element, "offsetHeight", { value: height });
}

/** A viewer that fills a 1000 by 800 window: a header, and a viewport that holds the image. */
function viewerWithImage() {
  const viewer = document.createElement("dialog");
  const header = document.createElement("header");
  const viewport = document.createElement("div");
  const image = document.createElement("img");
  viewport.append(image);
  viewer.append(header, viewport);
  const preview = document.createElement("button");
  const previewImage = document.createElement("img");
  preview.append(previewImage);
  document.body.append(viewer, preview);
  place(viewer, 0, 0, 1000, 800);
  place(image, 300, 100, 400, 600);
  place(preview, 50, 400, 120, 180);
  place(previewImage, 50, 400, 100, 150);
  return { viewer, header, image, preview, previewImage };
}

/** Where the viewer transform sends a rect, with transform-origin top left at the viewer's corner (0, 0). */
function project(transform: string, rect: { x: number; y: number; width: number; height: number }) {
  const [, tx, ty, s] = transform.match(/translate\((.+)px, (.+)px\) scale\((.+)\)/)!.map(Number);
  return { x: tx! + s! * rect.x, y: ty! + s! * rect.y, width: s! * rect.width, height: s! * rect.height };
}

it.each([
  ["lands the viewer's image on the inline image, not the whole viewer on the preview", async () => {
    const { viewer, header, image, preview, previewImage } = viewerWithImage();
    const { result } = renderHook(() => useViewerMotion());
    let finished = false;
    result.current.animateClose(viewer, preview, () => { finished = true; }, { content: image, target: previewImage });

    const shrink = animations.find(animation => animation.element === viewer && "transform" in animation.frames[1]!)!;
    expect(project(shrink.frames[1]!.transform as string, { x: 300, y: 100, width: 400, height: 600 }))
      .toEqual({ x: 50, y: 400, width: 100, height: 150 });

    const faded = (element: Element) => animations.some(animation => animation.element === element && animation.frames.at(-1)!.opacity === 0);
    expect(faded(header)).toBe(true);
    expect(faded(image)).toBe(true);
    expect(animations.some(animation => animation.element === viewer && animation.frames.at(-1)!.backgroundColor === "transparent" && animation.frames.at(-1)!.outlineColor === "transparent")).toBe(true);

    shrink.finish();
    await Promise.resolve();
    expect(finished).toBe(true);
  }],
  ["lands only the fitted drawing, at one scale and centered, when the content draws a smaller box of a known aspect", () => {
    const { viewer, image, preview } = viewerWithImage();
    const { result } = renderHook(() => useViewerMotion());
    // A 2:1 drawing fitted in the 400 by 600 stage is 400 by 200, centered at y 300.
    // In the 120 by 180 preview it lands 120 by 60, centered at y 460.
    result.current.animateClose(viewer, preview, () => {}, { content: image, contentAspect: 2 });
    const shrink = animations.find(animation => animation.element === viewer && "transform" in animation.frames[1]!)!;
    expect(project(shrink.frames[1]!.transform as string, { x: 300, y: 300, width: 400, height: 200 }))
      .toEqual({ x: 50, y: 460, width: 120, height: 60 });
  }],
])("%s", (_title: string, run: () => void | Promise<void>) => run());

it("fades the whole viewer out when the caller names no content", () => {
  const { viewer, preview } = viewerWithImage();
  const { result } = renderHook(() => useViewerMotion());
  result.current.animateClose(viewer, preview, () => {});
  expect(animations.some(animation => animation.element === viewer && animation.frames.at(-1)!.opacity === 0)).toBe(true);
});
