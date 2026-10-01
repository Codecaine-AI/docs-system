import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import { StandaloneSequenceEmbed } from "../pages/SequenceEmbed";

afterEach(() => cleanup());

const SAMPLE_SEQUENCE = {
  version: 1,
  id: "flow",
  title: "Login flow",
  participants: [
    { id: "a", name: "user", kind: "participant" },
    { id: "b", name: "service", kind: "participant" },
  ],
  items: [
    { kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "sign in" },
  ],
  style: {},
};

describe("StandaloneSequenceEmbed central Studio sequences", () => {
  it("renders a plain Open in Sequence Studio affordance (no iframe, no preview)", () => {
    const { getByRole, getByText, container } = render(
      <StandaloneSequenceEmbed
        id="sequence-block"
        sequenceId="auth-handshake"
        title="Auth handshake"
      />,
    );

    expect(getByText("Auth handshake")).toBeTruthy();
    const studioLink = getByRole("link", { name: "Open in Sequence Studio" }) as HTMLAnchorElement;
    expect(studioLink.href).toBe("http://localhost:3998/");
    expect(studioLink.target).toBe("_blank");
    // Unlike the canvas embed there is no Studio iframe/preview surface.
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(
      container
        .querySelector('[data-docs-block-type="sequence"]')
        ?.classList.contains("border-[color:var(--docs-sequence-border,var(--border))]"),
    ).toBe(true);
  });
});

describe("StandaloneSequenceEmbed sidecar src loading", () => {
  it("fetches the sidecar, validates it, and renders the read-only viewer", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(
        JSON.stringify({
          sequence_path: "guide/assets/sequences/flow.sequence.json",
          sequence_document_path: "docs/guide/assets/sequences/flow.sequence.json",
          content_hash: "hash",
          sequence: SAMPLE_SEQUENCE,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const { container, findByText, getByRole, queryByRole } = render(
        <StandaloneSequenceEmbed
          id="sequence-block"
          src="guide/assets/sequences/flow.sequence.json"
        />,
      );

      await findByText("sign in");
      expect(requested).toEqual([
        "api/sequence?src=guide%2Fassets%2Fsequences%2Fflow.sequence.json",
      ]);
      const section = container.querySelector('[data-docs-block-type="sequence"]');
      expect(section?.getAttribute("data-source-id")).toBe("sequence-block");
      expect(container.querySelector("svg")).toBeTruthy();
      const preview = getByRole("button", { name: "Open Login flow in full-screen viewer" });
      preview.focus();
      fireEvent.click(preview);
      expect(getByRole("dialog", { name: "Login flow sequence viewer" })).toBeTruthy();
      expect(window.document.body.style.overflow).toBe("hidden");
      fireEvent.click(getByRole("button", { name: "Zoom in" }));
      expect(getByRole("status", { name: "Zoom level" }).textContent).toBe("125%");
      fireEvent.click(getByRole("button", { name: "Fit" }));
      expect(getByRole("status", { name: "Zoom level" }).textContent).toBe("100%");
      fireEvent.click(getByRole("button", { name: "Close sequence viewer" }));
      expect(queryByRole("dialog")).toBeNull();
      expect(window.document.body.style.overflow).not.toBe("hidden");
      expect(window.document.activeElement).toBe(preview);
      fireEvent.click(preview);
      fireEvent(getByRole("dialog"), new Event("cancel"));
      expect(queryByRole("dialog")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces schema validation failures instead of rendering", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          sequence_path: "guide/assets/sequences/bad.sequence.json",
          sequence_document_path: "docs/guide/assets/sequences/bad.sequence.json",
          content_hash: "hash",
          sequence: { version: 1, id: "bad" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const { getByText } = render(
        <StandaloneSequenceEmbed
          id="sequence-block"
          src="guide/assets/sequences/bad.sequence.json"
        />,
      );
      await waitFor(() => getByText("Sequence failed to load"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("StandaloneSequenceEmbed full-screen pan and zoom", () => {
  const VIEWPORT = { width: 1000, height: 800 };

  function parseTransform(element: Element) {
    const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      (element as HTMLElement).style.transform,
    );
    if (!match) throw new Error(`unexpected transform: ${(element as HTMLElement).style.transform}`);
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
  }

  // happy-dom has no layout; give every element the viewport's box so the fit is real.
  function withViewportSize(run: () => Promise<void>) {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => VIEWPORT.width });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => VIEWPORT.height });
    return run().finally(() => {
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    });
  }

  // happy-dom's WheelEvent drops clientX/clientY from its init dict.
  function wheel(target: Element, init: { deltaY: number; deltaMode?: number; clientX: number; clientY: number }) {
    const event = new WheelEvent("wheel", { deltaY: init.deltaY, deltaMode: init.deltaMode ?? 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientX", { value: init.clientX });
    Object.defineProperty(event, "clientY", { value: init.clientY });
    fireEvent(target, event);
    return event;
  }

  function openViewer() {
    const utils = render(
      <StandaloneSequenceEmbed id="sequence-block" initialDocument={SAMPLE_SEQUENCE as never} />,
    );
    fireEvent.click(utils.getByRole("button", { name: "Open Login flow in full-screen viewer" }));
    const viewport = utils.container.ownerDocument.querySelector(".docs-sequence-viewport")!;
    const layer = viewport.querySelector(".docs-sequence-expanded")!;
    const zoomLevel = () => utils.getByRole("status", { name: "Zoom level" }).textContent;
    return { ...utils, viewport, layer, zoomLevel };
  }

  it("opens fitted and centered, zooms toward the wheel cursor, and Fit restores the framing", () =>
    withViewportSize(async () => {
      const { viewport, layer, zoomLevel, getByRole } = openViewer();
      const fitted = parseTransform(layer);
      const width = Number.parseFloat((layer as HTMLElement).style.width);
      expect(zoomLevel()).toBe("100%");
      expect(fitted.x * 2 + width * fitted.zoom).toBeCloseTo(VIEWPORT.width, 3);

      const cursor = { x: 300, y: 200 };
      const contentUnderCursor = { x: (cursor.x - fitted.x) / fitted.zoom, y: (cursor.y - fitted.y) / fitted.zoom };
      const event = wheel(viewport, { deltaY: -100, clientX: cursor.x, clientY: cursor.y });
      expect(event.defaultPrevented).toBe(true);
      // One notch is clamped to 30px: exp(0.3) ~ 1.35x, not exp(1) ~ 2.7x.
      await waitFor(() => expect(zoomLevel()).toBe("135%"));
      const zoomed = parseTransform(layer);
      expect(zoomed.x + contentUnderCursor.x * zoomed.zoom).toBeCloseTo(cursor.x, 3);
      expect(zoomed.y + contentUnderCursor.y * zoomed.zoom).toBeCloseTo(cursor.y, 3);

      fireEvent.click(getByRole("button", { name: "Fit" }));
      expect(zoomLevel()).toBe("100%");
      expect(parseTransform(layer)).toEqual(fitted);
    }));

  it("normalizes line-mode wheel deltas to pixels before clamping", () =>
    withViewportSize(async () => {
      const { viewport, zoomLevel } = openViewer();
      wheel(viewport, { deltaY: 3, deltaMode: 1, clientX: 10, clientY: 10 });
      await waitFor(() => expect(zoomLevel()).toBe(`${Math.round(Math.exp(-0.3) * 100)}%`));
    }));

  it("pans with a left-button drag and shows the grabbing state while dragging", () =>
    withViewportSize(async () => {
      const { viewport, layer } = openViewer();
      const before = parseTransform(layer);
      fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
      expect(viewport.hasAttribute("data-panning")).toBe(true);
      fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 140, clientY: 70 });
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 140, clientY: 70 });
      expect(viewport.hasAttribute("data-panning")).toBe(false);
      const after = parseTransform(layer);
      expect(after.x - before.x).toBeCloseTo(40, 3);
      expect(after.y - before.y).toBeCloseTo(-30, 3);
      expect(after.zoom).toBe(before.zoom);

      fireEvent.keyDown(viewport, { key: "ArrowLeft" });
      expect(parseTransform(layer).x).toBeGreaterThan(after.x);
    }));
});
