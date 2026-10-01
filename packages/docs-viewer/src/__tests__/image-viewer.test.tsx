import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpandableImage } from "../components/rich-text/image-viewer";

afterEach(() => cleanup());

describe("ExpandableImage", () => {
  it("server-renders a trigger that carries what the published page needs to open the viewer", () => {
    const html = renderToStaticMarkup(<ExpandableImage src="/a.png" alt="Diagram" title="Overview" />);
    expect(html).toContain('data-docs-image-expand=""');
    expect(html).toContain('data-src="/a.png"');
    expect(html).toContain('data-title="Overview"');
    expect(html).not.toContain("<dialog");
  });

  it("opens a full-screen viewer sized to the image's natural pixels and closes back to the preview", () => {
    const { getByRole, baseElement } = render(<ExpandableImage src="/a.png" alt="Diagram" title="Overview" />);
    const trigger = getByRole("button", { name: "Open Overview in full-screen viewer" });
    fireEvent.click(trigger);

    const dialog = getByRole("dialog", { name: "Overview image viewer" });
    expect(dialog.textContent).toContain("Overview");
    const expanded = baseElement.querySelector<HTMLImageElement>(".docs-image-expanded")!;
    expect(expanded.getAttribute("src")).toBe("/a.png");
    Object.defineProperty(expanded, "naturalWidth", { value: 1600 });
    Object.defineProperty(expanded, "naturalHeight", { value: 900 });
    fireEvent.load(expanded);
    expect(expanded.style.width).toBe("1600px");
    expect(expanded.style.height).toBe("900px");
    expect(expanded.style.transform).toMatch(/translate\(.+\) scale\(.+\)/);

    fireEvent.click(getByRole("button", { name: "Close image viewer" }));
    expect(baseElement.querySelector(".docs-image-dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
