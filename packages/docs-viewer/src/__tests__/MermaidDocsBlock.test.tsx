import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  MermaidDocsBlock,
  type MermaidData,
} from "../components/mermaid/MermaidDocsBlock";
import type { DocsMdxParsedBlock } from "../components/base";

/**
 * The real `mermaid` package is heavy and layout-dependent — happy-dom cannot
 * render it reliably, and the component contract is only "never throws,
 * always shows at least the source". Mock the module (the component imports
 * it dynamically inside useEffect, so this intercepts that import): sources
 * starting with "graph" render a marker SVG, anything else rejects like a
 * parse failure.
 */
mock.module("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (_id: string, source: string) => {
      if (source.trimStart().startsWith("graph")) {
        return { svg: '<svg data-mock-mermaid-svg="true"><g /></svg>' };
      }
      throw new Error("Parse error on line 1:\n...bogus...");
    },
  },
}));

const block = new MermaidDocsBlock();

const VALID_SOURCE = "graph TD;\n  A-->B;";

function parseValid(
  attrs: Record<string, string> = { id: "diagram-1" },
  body: string = VALID_SOURCE,
): DocsMdxParsedBlock<MermaidData> {
  const parsed = block.parse({ attrs, body, source: "" });
  if (!parsed) throw new Error("expected parse to succeed");
  return parsed;
}

afterEach(() => {
  cleanup();
});

describe("MermaidDocsBlock.parse", () => {
  it("extracts id and source, defaulting diagramType to the first word", () => {
    const parsed = parseValid();
    expect(parsed.tag).toBe("Mermaid");
    expect(parsed.type).toBe("mermaid");
    expect(parsed.targetKind).toBe("mermaid");
    expect(parsed.sourceId).toBe("diagram-1");
    expect(parsed.data.id).toBe("diagram-1");
    expect(parsed.data.source).toBe(VALID_SOURCE);
    expect(parsed.data.diagramType).toBe("graph");
  });

  it("honors explicit title, caption, and diagramType attrs", () => {
    const parsed = parseValid({
      id: "diagram-2",
      title: "Request flow",
      caption: "How a request travels",
      diagramType: "sequenceDiagram",
    });
    expect(parsed.data.title).toBe("Request flow");
    expect(parsed.data.caption).toBe("How a request travels");
    expect(parsed.data.diagramType).toBe("sequenceDiagram");
  });

  it("returns null when id is missing or body is blank", () => {
    expect(block.parse({ attrs: {}, body: VALID_SOURCE, source: "" })).toBeNull();
    expect(block.parse({ attrs: { id: "x" }, body: "   \n  ", source: "" })).toBeNull();
  });
});

describe("MermaidDocsBlock.render", () => {
  it("shows a quiet title and the source fallback without header framing", async () => {
    const parsed = parseValid({ id: "diagram-3", title: "Topology" });
    const { container } = render(<>{block.render(parsed)}</>);

    const section = container.querySelector('[data-docs-block-type="mermaid"]');
    expect(section).toBeTruthy();
    expect(section?.getAttribute("data-mdx-block")).toBe("Mermaid");
    expect(section?.getAttribute("data-source-id")).toBe("diagram-3");
    expect(section?.className).toBe("not-prose my-4");
    expect(screen.queryByText("Mermaid")).toBeNull();
    expect(screen.getByText("Topology").className).toBe(
      "mb-1.5 text-sm font-medium text-foreground",
    );
    expect(screen.queryByText("graph")).toBeNull();
    expect(screen.queryByText("diagram-3")).toBeNull();
    // Source fallback is visible before (and while) the async render runs.
    expect(container.querySelector("pre code")?.textContent).toBe(VALID_SOURCE);

    // Let the async render settle inside the test so the state update is
    // act()-wrapped instead of firing after the test body ends.
    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-rendered="true"]')).toBeTruthy();
    });
  });

  it("renders the caption footer when provided", async () => {
    const parsed = parseValid({ id: "diagram-4", caption: "A caption" });
    const { container } = render(<>{block.render(parsed)}</>);
    const caption = screen.getByText("A caption");
    expect(caption.className).toBe("mt-1.5 text-xs text-muted-foreground");
    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-rendered="true"]')).toBeTruthy();
    });
  });

  it("swaps the fallback for the rendered SVG when mermaid succeeds", async () => {
    const parsed = parseValid({ id: "diagram-5" });
    const { container } = render(<>{block.render(parsed)}</>);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-rendered="true"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-mock-mermaid-svg="true"]')).toBeTruthy();
    expect(container.querySelector('[data-mermaid-fallback]')).toBeNull();
  });

  it("does not throw on bogus mermaid source and keeps showing the source", async () => {
    const parsed = parseValid({ id: "diagram-6" }, "definitely %% not [mermaid");
    const { container } = render(<>{block.render(parsed)}</>);

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-fallback="error"]')).toBeTruthy();
    });
    // One-line muted notice + the raw source stays visible.
    expect(screen.getByText(/Mermaid render failed: Parse error on line 1:/)).toBeTruthy();
    expect(container.querySelector("pre code")?.textContent).toBe(
      "definitely %% not [mermaid",
    );
    expect(container.querySelector('[data-mermaid-rendered="true"]')).toBeNull();
  });
});
