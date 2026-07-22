import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { syntheticInteractiveCanvas } from "@codecaine-ai/canvas";

import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";

afterEach(() => {
  document.body.style.overflow = "";
  cleanup();
});

describe("StandaloneCanvasEmbed central Studio canvases", () => {
  it("renders an honest unavailable card with a Studio root link", () => {
    const { container, getByRole, getByText, queryByRole } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="interaction-surfaces"
        view="one-state-two-readers"
        title="One state, two readers"
      />,
    );

    expect(getByText("One state, two readers")).toBeTruthy();
    expect(
      getByText(
        'This block references central board "interaction-surfaces", which isn\'t stored in this docs repo — canvas embeds render from .canvas.json sidecars in the docs tree.',
      ),
    ).toBeTruthy();
    const studioLink = getByRole("link", { name: "Open Canvas Studio" }) as HTMLAnchorElement;
    expect(studioLink.href).toBe("http://localhost:3999/");
    expect(studioLink.target).toBe("_blank");

    const card = container.querySelector('[data-docs-block-type="canvas"]');
    expect(card?.getAttribute("data-source-id")).toBe("canvas-block");
    expect(card?.getAttribute("data-canvas-id")).toBe("interaction-surfaces");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(queryByRole("dialog")).toBeNull();
  });
});

describe("StandaloneCanvasEmbed loaded canvases", () => {
  it("loads a sidecar as the same inert, expandable preview", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(
        JSON.stringify({
          canvas_path: "guide/assets/canvases/flow.canvas.json",
          canvas_document_path: "docs/guide/assets/canvases/flow.canvas.json",
          content_hash: "hash",
          canvas: syntheticInteractiveCanvas,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const { container, findByRole, getByText } = render(
        <StandaloneCanvasEmbed
          id="canvas-block"
          src="guide/assets/canvases/flow.canvas.json"
          title="Sidecar flow"
        />,
      );

      expect(getByText("Loading canvas...")).toBeTruthy();
      await findByRole("button", { name: "Open Sidecar flow in full-screen viewer" });
      expect(requested).toEqual([
        "api/canvas?src=guide%2Fassets%2Fcanvases%2Fflow.canvas.json",
      ]);
      expect(container.querySelector("[inert]")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the existing canvas validation error state", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          canvas_path: "guide/assets/canvases/bad.canvas.json",
          canvas_document_path: "docs/guide/assets/canvases/bad.canvas.json",
          content_hash: "hash",
          canvas: { schemaVersion: 1, id: "bad" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const { findByText } = render(
        <StandaloneCanvasEmbed
          id="canvas-block"
          src="guide/assets/canvases/bad.canvas.json"
        />,
      );
      expect(await findByText("Canvas failed to load")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("renders an inert synthetic preview and an in-app full-screen viewer", () => {
    document.body.style.overflow = "clip";
    const { container, getByRole, queryByRole, queryByText } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="synthetic"
        view="input-context"
        title="Interview inputs"
      />,
    );

    const inertPreview = container.querySelector("[inert]");
    expect(inertPreview).toBeTruthy();
    expect(inertPreview?.classList.contains("pointer-events-none")).toBe(true);
    expect(inertPreview?.getAttribute("aria-hidden")).toBe("true");
    expect(queryByRole("button", { name: /User brief/i })).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();

    // Inline render is the bare static viewer — just the diagram, no header,
    // no badges, no zoom controls.
    expect(queryByText("Interactive Canvas")).toBeNull();
    const inlineViewerSection = inertPreview?.querySelector('[data-mdx-block="Canvas"]');
    expect(inlineViewerSection).toBeTruthy();
    expect(inlineViewerSection?.getAttribute("data-canvas-interactive")).toBeNull();
    expect(inertPreview?.querySelector("[data-zoom-controls]")).toBeNull();
    // The embed supplies the single rounded border around the viewer.
    const previewFrame = inlineViewerSection?.parentElement;
    expect(previewFrame?.classList.contains("rounded-md")).toBe(true);
    expect(previewFrame?.classList.contains("border")).toBe(true);

    fireEvent.click(
      getByRole("button", { name: "Open Interview inputs in full-screen viewer" }),
    );
    const dialog = getByRole("dialog", { name: "Interview inputs canvas viewer" });
    // The dialog's own header is the only framing — the viewer inside is the
    // bare interactive surface with pan/zoom (zoom controls overlay).
    expect(within(dialog).getByText("Canvas viewer")).toBeTruthy();
    expect(within(dialog).queryByText("Interactive Canvas")).toBeNull();
    expect(
      dialog.querySelector('[data-canvas-interactive="true"]'),
    ).toBeTruthy();
    expect(dialog.querySelector("[data-zoom-controls]")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /User brief/i })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.querySelector("iframe")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("clip");

    fireEvent.click(getByRole("button", { name: "Open canvas viewer" }));
    expect(getByRole("dialog", { name: "Interview inputs canvas viewer" })).toBeTruthy();
  });

  it("keeps the inline viewer interactive for annotation targeting", () => {
    const selected: string[] = [];
    const { container, getByRole, queryByRole, queryByText } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="synthetic"
        onObjectSelect={(objectId) => selected.push(objectId)}
      />,
    );

    expect(container.querySelector("[inert]")).toBeNull();
    // Annotation targeting stays the bare static viewer — no framing, no
    // interactive pan/zoom — with object clicks live.
    expect(queryByText("Interactive Canvas")).toBeNull();
    expect(container.querySelector('[data-canvas-interactive="true"]')).toBeNull();
    expect(container.querySelector("[data-zoom-controls]")).toBeNull();
    expect(
      queryByRole("button", {
        name: "Open Synthetic Interview Flow in full-screen viewer",
      }),
    ).toBeNull();

    fireEvent.click(getByRole("button", { name: /User brief/i }));
    expect(selected).toEqual(["user-brief"]);
    expect(queryByRole("dialog")).toBeNull();

    fireEvent.click(getByRole("button", { name: "Open canvas viewer" }));
    expect(
      getByRole("dialog", { name: "Synthetic Interview Flow canvas viewer" }),
    ).toBeTruthy();
  });

  it("deep-links sidecar authoring actions into Studio's editor", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          canvas_path: "guide/assets/canvases/flow.canvas.json",
          canvas_document_path: "docs/guide/assets/canvases/flow.canvas.json",
          content_hash: "hash",
          canvas: syntheticInteractiveCanvas,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const expectedHref =
      "http://localhost:3999/?src=guide%2Fassets%2Fcanvases%2Fflow.canvas.json";
    try {
      const { findByRole, getAllByRole, getByRole } = render(
        <StandaloneCanvasEmbed
          id="canvas-block"
          src="guide/assets/canvases/flow.canvas.json"
          title="Sidecar flow"
          showEditAction
        />,
      );

      await findByRole("button", { name: "Open Sidecar flow in full-screen viewer" });
      const inlineEdit = getByRole("link", { name: "Edit in Canvas" }) as HTMLAnchorElement;
      expect(inlineEdit.href).toBe(expectedHref);
      expect(inlineEdit.target).toBe("_blank");

      fireEvent.click(
        getByRole("button", { name: "Open Sidecar flow in full-screen viewer" }),
      );
      const editLinks = getAllByRole("link", { name: "Edit in Canvas" }) as HTMLAnchorElement[];
      expect(editLinks).toHaveLength(2);
      for (const link of editLinks) {
        expect(link.href).toBe(expectedHref);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("links authoring actions to the Canvas Studio root", () => {
    const { getAllByRole, getByRole, queryByRole } = render(
      <StandaloneCanvasEmbed
        id="canvas-block"
        canvasId="synthetic"
        showEditAction
      />,
    );

    const inlineEdit = getByRole("link", { name: "Edit in Canvas" }) as HTMLAnchorElement;
    expect(inlineEdit.href).toBe("http://localhost:3999/");
    expect(inlineEdit.target).toBe("_blank");
    expect(queryByRole("dialog")).toBeNull();

    fireEvent.click(
      getByRole("button", {
        name: "Open Synthetic Interview Flow in full-screen viewer",
      }),
    );
    const editLinks = getAllByRole("link", { name: "Edit in Canvas" }) as HTMLAnchorElement[];
    expect(editLinks).toHaveLength(2);
    for (const link of editLinks) {
      expect(link.href).toBe("http://localhost:3999/");
      expect(link.href).not.toContain("/canvas/");
    }
  });
});
