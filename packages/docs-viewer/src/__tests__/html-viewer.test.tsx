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
  fireEvent.click(getByRole("button", { name: "100%" }));
  expect(container.querySelector("iframe")).toBe(frame);
  expect(frame.srcdoc).toBe(source);
  act(() => window.dispatchEvent(new MessageEvent("message", {
    source: frame.contentWindow, origin: "null", data: { type: "docs-html-escape" },
  })));
  expect(container.querySelector("dialog")!.open).toBe(false);
  expect(container.querySelector("iframe")).toBe(frame);
  expect(document.activeElement).toBe(expand);
  expect(document.body.style.overflow).not.toBe("hidden");
});
