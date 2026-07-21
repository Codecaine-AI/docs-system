import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { DocsClientProvider, type DocsClient } from "../../client";
import { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "../../render/block-classes";
import { docTitleFromPath } from "../../render/doc-title";
import { DocPeekPanel } from "../DocPeekPanel";
import {
  DOC_REFERENCE_NAVIGATE_EVENT,
  type DocReferenceNavigateDetail,
} from "../peek-state";

/**
 * Side-peek behavior end to end (panel + hook + reducer) against a stub
 * DocsClient: a peek-intent navigation event opens the drawer with the
 * target's rendered content, Escape closes it, navigate intent bypasses the
 * panel entirely (host callback), a second peek replaces the content, and a
 * client without `getDocBundle` downgrades peeks to full navigation.
 */

afterEach(cleanup);

const refA: SpectreRef = { kind: "doc", path: "guides/a", label: "Doc A" };
const refB: SpectreRef = { kind: "doc", path: "guides/b", label: "Doc B" };

function makeDoc(id: string, title: string, body: string): DocDocument {
  return {
    schemaVersion: 1,
    id,
    title,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
      p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: body }], children: [] },
    },
  };
}

const BUNDLES: Record<string, DocDocument> = {
  "guides/a": makeDoc("doc-a", "Doc A", "Hello from A"),
  "guides/b": makeDoc("doc-b", "Doc B", "Hello from B"),
};

function stubClient(): DocsClient {
  return {
    getDocsTree: async () => ({ tree: [] }),
    getDocBundle: async (_projectId, path) => {
      const doc = BUNDLES[path];
      return doc ? { doc, documentPath: `${path}/doc.json` } : null;
    },
  };
}

async function dispatchNavigateEvent(detail: DocReferenceNavigateDetail) {
  await act(async () => {
    document.dispatchEvent(new CustomEvent(DOC_REFERENCE_NAVIGATE_EVENT, { detail }));
    // Flush the getDocBundle promise chain + validation before asserting.
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderPanel(
  client: DocsClient | null = stubClient(),
  resolveAssetSrc?: (src: string) => string,
) {
  const onNavigate = mock((_ref: SpectreRef) => {});
  render(
    <DocsClientProvider client={client}>
      <DocPeekPanel projectId="proj-1" onNavigate={onNavigate} resolveAssetSrc={resolveAssetSrc} />
    </DocsClientProvider>,
  );
  return { onNavigate };
}

function panel(): HTMLElement {
  const aside = document.querySelector("aside");
  if (!aside) throw new Error("panel <aside> not rendered");
  return aside as HTMLElement;
}

describe("DocPeekPanel", () => {
  it("stays mounted but closed (w-0, hidden content) before any peek", () => {
    renderPanel();
    expect(panel().getAttribute("aria-hidden")).toBe("true");
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
    expect(screen.queryByText("Doc A")).toBeNull();
  });

  it("opens on a peek-intent event and renders the target doc read-only", async () => {
    const { onNavigate } = renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(true);
    expect(panel().getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("Hello from A")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("wraps peeked content in the doc-surface typography + vertical-rhythm wrapper (DocPage parity)", async () => {
    renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    // Typography parity: the content sits inside the same docs-markdown/prose
    // wrapper DocPage puts around its read-only DocBlockRenderer.
    const typography = panel().querySelector(".docs-markdown");
    if (!typography) throw new Error("typography wrapper not rendered");
    expect(typography.className).toBe(DOC_SURFACE_TYPOGRAPHY_CLASSES);
    expect(typography.textContent).toContain("Hello from A");

    // Vertical-rhythm parity: the spacing column uses DocPage's
    // --style-content-top/bottom vars; only horizontal padding is
    // peek-specific (--docs-peek-padding).
    const column = typography.parentElement;
    if (!column) throw new Error("spacing column not rendered");
    expect(column.className).toContain("pt-[var(--style-content-top,1.5rem)]");
    expect(column.className).toContain("pb-[var(--style-content-bottom,1.5rem)]");
    expect(column.className).toContain("px-[var(--docs-peek-padding,1.5rem)]");
  });

  it("renders the fixed page title above the doc content, matching the main surface", async () => {
    renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    // Same furniture as DocPage: an h1 carrying the host-global
    // `docs-page-title` class, whose text comes from THE SAME derivation
    // (docTitleFromPath on the bundle path) — never the doc's own content.
    const title = panel().querySelector("h1.docs-page-title");
    if (!title) throw new Error("page title not rendered");
    expect(title.textContent).toBe(docTitleFromPath(refA.path));
    // Read-only in a preview: no rename affordance.
    expect((title as HTMLElement).isContentEditable).toBe(false);

    // It sits in the same spacing column as the content, ABOVE it.
    const typography = panel().querySelector(".docs-markdown");
    if (!typography) throw new Error("typography wrapper not rendered");
    expect(title.parentElement).toBe(typography.parentElement);
    expect(
      title.compareDocumentPosition(typography) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders an icon-only header with no title text (the page title renders in the doc column)", async () => {
    renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    const header = panel().querySelector("header");
    if (!header) throw new Error("peek header not rendered");
    // Both actions are reachable by their stable accessible names…
    expect(screen.getByLabelText("Close preview")).toBeTruthy();
    expect(screen.getByLabelText("Open in full")).toBeTruthy();
    // …and the header carries no title text of its own.
    expect(header.textContent).toBe("");
  });

  it("the close (X) button closes the peek", async () => {
    const { onNavigate } = renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });
    expect(screen.getByText("Hello from A")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Close preview"));
    });
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
    expect(screen.queryByText("Hello from A")).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });
    expect(screen.getByText("Hello from A")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
    expect(screen.queryByText("Hello from A")).toBeNull();
  });

  it("forwards navigate intent to onNavigate without opening", async () => {
    const { onNavigate } = renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "navigate" });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toEqual(refA);
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
    expect(screen.queryByText("Hello from A")).toBeNull();
  });

  it("replaces the peeked content when a second doc ref is peeked", async () => {
    renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });
    expect(screen.getByText("Hello from A")).toBeTruthy();

    await dispatchNavigateEvent({ ref: refB, intent: "peek" });
    expect(screen.getByText("Hello from B")).toBeTruthy();
    expect(screen.queryByText("Hello from A")).toBeNull();
  });

  it("shows a not-found placeholder for an unknown bundle path", async () => {
    renderPanel();
    await dispatchNavigateEvent({
      ref: { kind: "doc", path: "guides/missing", label: "Ghost" },
      intent: "peek",
    });
    expect(screen.getByText("Doc not found.")).toBeTruthy();
  });

  it("'Open in full' hands the peeked ref to onNavigate and closes", async () => {
    const { onNavigate } = renderPanel();
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open in full"));
    });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toEqual(refA);
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
  });

  it("canonicalizes bundle-relative asset srcs against the peeked path before the host resolver", async () => {
    // The workbench passes a PLAIN resolver with no bundle context; the
    // panel must hand it the docs-root-relative form, never raw `./assets/…`.
    const withImage = makeDoc("doc-img", "Doc Img", "Body");
    withImage.blocks.root.children.push("img1");
    withImage.blocks.img1 = {
      id: "img1",
      type: "image",
      props: { src: "./assets/images/foo.png", alt: "Foo" },
      children: [],
    };
    BUNDLES["guides/img"] = withImage;
    try {
      const hostResolve = mock((src: string) => `api/asset?path=${src}`);
      renderPanel(stubClient(), hostResolve);
      await dispatchNavigateEvent({
        ref: { kind: "doc", path: "guides/img", label: "Doc Img" },
        intent: "peek",
      });

      expect(hostResolve).toHaveBeenCalledWith("guides/img/assets/images/foo.png");
      expect(hostResolve).not.toHaveBeenCalledWith("./assets/images/foo.png");
      const img = document.querySelector("img[alt='Foo']");
      expect(img?.getAttribute("src")).toBe("api/asset?path=guides/img/assets/images/foo.png");
    } finally {
      delete BUNDLES["guides/img"];
    }
  });

  it("passes docs-root-relative asset srcs to the host resolver unchanged", async () => {
    const withImage = makeDoc("doc-img2", "Doc Img 2", "Body");
    withImage.blocks.root.children.push("img1");
    withImage.blocks.img1 = {
      id: "img1",
      type: "image",
      props: { src: "shared/assets/bar.png", alt: "Bar" },
      children: [],
    };
    BUNDLES["guides/img2"] = withImage;
    try {
      const hostResolve = mock((src: string) => `api/asset?path=${src}`);
      renderPanel(stubClient(), hostResolve);
      await dispatchNavigateEvent({
        ref: { kind: "doc", path: "guides/img2", label: "Doc Img 2" },
        intent: "peek",
      });

      expect(hostResolve).toHaveBeenCalledWith("shared/assets/bar.png");
    } finally {
      delete BUNDLES["guides/img2"];
    }
  });

  it("downgrades peek intent to onNavigate when the client lacks getDocBundle", async () => {
    const { onNavigate } = renderPanel({ getDocsTree: async () => ({ tree: [] }) });
    await dispatchNavigateEvent({ ref: refA, intent: "peek" });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toEqual(refA);
    expect(panel().hasAttribute("data-doc-peek-panel")).toBe(false);
  });
});
