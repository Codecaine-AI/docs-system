import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";

afterEach(() => cleanup());

describe("StandaloneCanvasEmbed central Studio canvases", () => {
  it("renders a static section preview until the viewer is explicitly expanded", () => {
    const { getByAltText, getByRole, getByTitle, queryByRole } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="interaction-surfaces"
        view="one-state-two-readers"
        title="One state, two readers"
      />,
    );

    const preview = getByAltText("One state, two readers") as HTMLImageElement;
    expect(preview.src).toBe(
      "http://localhost:3999/api/canvases/interaction-surfaces/preview.svg?section=one-state-two-readers&fit=content&w=1280",
    );
    expect(queryByRole("dialog")).toBeNull();
    expect(queryByRole("link", { name: "Edit in Canvas" })).toBeNull();

    fireEvent.click(getByRole("button", { name: "Open canvas viewer" }));
    expect(getByRole("dialog", { name: "One state, two readers canvas viewer" })).toBeTruthy();

    const iframe = getByTitle("One state, two readers viewer") as HTMLIFrameElement;
    expect(iframe.src).toBe(
      "http://localhost:3999/embed/interaction-surfaces?view=one-state-two-readers",
    );
    expect(iframe.getAttribute("sandbox")).toContain("allow-scripts");
  });

  it("shows the new-window editor action only when the docs surface is editing", () => {
    const { getByRole } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="interaction-surfaces"
        title="One state, two readers"
        showEditAction
      />,
    );

    const editorLink = getByRole("link", { name: "Edit in Canvas" }) as HTMLAnchorElement;
    expect(editorLink.href).toBe("http://localhost:3999/canvas/interaction-surfaces");
    expect(editorLink.target).toBe("_blank");
  });
});
