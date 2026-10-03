import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { ExpandableImage } from "../components/rich-text/image-viewer";
import DocBlockRenderer from "../render/DocBlockRenderer";

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

describe("image block", () => {
  it("heads the image with only the image tile and an expand button, no caption or file name", () => {
    const document = {
      id: "doc",
      version: 1,
      title: "Image",
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["image"] },
        image: {
          id: "image",
          type: "image",
          props: { src: "assets/images/checkout-flow.png", alt: "Checkout flow diagram", caption: "Checkout flow" },
          children: [],
        },
      },
    } as unknown as DocDocument;

    const { container } = render(<DocBlockRenderer document={document} bundlePath="docs/x" />);
    const figure = container.querySelector<HTMLElement>('figure[data-block-id="image"]')!;
    expect(figure).not.toBeNull();
    expect(figure.querySelector("figcaption")).toBeNull();
    expect(figure.textContent).not.toContain("checkout-flow.png");
    expect(figure.textContent).not.toContain("Checkout flow");
    expect(figure.querySelector('img[alt="Checkout flow diagram"]')).not.toBeNull();
    const head = figure.querySelector<HTMLElement>("[data-media-head]")!;
    expect(head).not.toBeNull();
    expect(head.querySelector("[data-media-tile]")).not.toBeNull();
    expect(head.textContent).toBe("");
    const expand = head.querySelector<HTMLButtonElement>("button[data-docs-image-expand]")!;
    expect(expand.getAttribute("aria-label")).toBe("Open Checkout flow in full-screen viewer");
    // The head button is the only expand glyph; the image itself stays clickable.
    expect(figure.querySelector(".docs-image-expand-hint")).toBeNull();
    expect(figure.querySelectorAll("[data-docs-image-expand]")).toHaveLength(2);
  });
});
