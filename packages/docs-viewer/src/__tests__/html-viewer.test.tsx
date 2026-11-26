import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { HtmlBlock } from "../components/rich-text/html";

afterEach(cleanup);

function report(frame: HTMLIFrameElement, width: number, height: number, source: Window | null = frame.contentWindow) {
  act(() => window.dispatchEvent(new MessageEvent("message", {
    source, origin: "null", data: { type: "docs-html-size", width, height },
  })));
}

test("only the owning sandbox can resize the HTML preview", () => {
  const { container } = render(<HtmlBlock html="<p>Diagram</p>" title="Diagram" />);
  const frame = container.querySelector("iframe")!;
  report(frame, 1400, 1000, window);
  expect(frame.style.height).toBe("400px");
  report(frame, 1400, 1000);
  expect(frame.style.height).toBe("1000px");
  report(frame, Infinity, 500);
  report(frame, 100, -1);
  report(frame, 100, 100001);
  expect(frame.style.height).toBe("1000px");
  report(frame, 1400, 80);
  expect(frame.style.height).toBe("80px");
});

test("expansion, zoom, and Escape reuse the iframe and restore focus", () => {
  const { container, getByRole } = render(<HtmlBlock html="<button>Counter</button>" title="Counter" allowScripts />);
  const frame = container.querySelector("iframe")!;
  const source = frame.srcdoc;
  const expand = getByRole("button", { name: "Expand HTML content" });
  fireEvent.click(expand);
  expect(container.querySelector("dialog")!.open).toBe(true);
  expect(container.querySelector("dialog")!.hasAttribute("data-docs-viewer")).toBe(true);
  fireEvent.click(getByRole("button", { name: "100%" }));
  expect(container.querySelector("iframe")).toBe(frame);
  expect(frame.srcdoc).toBe(source);
  act(() => window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin: "null", data: { type: "docs-html-escape" },
  })));
  expect(container.querySelector("dialog")!.open).toBe(false);
  expect(container.querySelector("dialog")!.hasAttribute("data-docs-viewer")).toBe(false);
  expect(container.querySelector("iframe")).toBe(frame);
  expect(document.activeElement).toBe(expand);
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("tall HTML keeps its scale inline and scrolls inside the capped area", () => {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 0, width: 800, height: 0, toJSON() {} } as DOMRect;
  };
  try {
    const { container } = render(<HtmlBlock html="<p>Tall</p>" title="Tall" />);
    const frame = container.querySelector("iframe")!;
    const area = container.querySelector<HTMLElement>("[data-docs-html-area]")!;
    report(frame, 800, 3000);
    const cap = Math.min(600, window.innerHeight * 0.7);
    expect(frame.style.transform).toBe("scale(1)");
    expect(parseFloat(area.style.height)).toBeCloseTo(cap);
    expect(area.style.overflowY).toBe("auto");
    report(frame, 800, 200);
    expect(area.style.height).toBe("200px");
    expect(area.style.overflowY).toBe("hidden");
  } finally {
    HTMLElement.prototype.getBoundingClientRect = rect;
  }
});
