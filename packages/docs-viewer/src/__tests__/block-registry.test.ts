import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "../render/DocBlockRenderer";
import {
  deltaToMarkdown,
  deltaToPlainText,
  describeDocBlocksForAgent,
  type DocBlockRenderContext,
  getDocBlockDescriptor,
} from "../render/block-registry";

/** Minimal render context — enough to drive `image`/`attachment` descriptors. */
function makeCtx(overrides: Partial<DocBlockRenderContext> = {}): DocBlockRenderContext {
  return {
    renderText: () => null,
    renderChildren: () => null,
    renderMarkdown: () => null,
    ...overrides,
  };
}

function block(flavour: DocBlock["flavour"], props: Record<string, unknown> = {}): DocBlock {
  return { id: `${flavour}-1`, flavour, props, children: [] };
}

describe("flavour registry", () => {
  it("resolves a descriptor for every doc.json flavour", () => {
    for (const flavour of DOC_BLOCK_TYPES) {
      const descriptor = getDocBlockDescriptor(flavour);
      expect(descriptor).not.toBeNull();
      if (!descriptor) continue;
      expect(descriptor.flavour).toBe(flavour);
      expect(descriptor.targetKind.length).toBeGreaterThan(0);
      expect(descriptor.agentDescription.length).toBeGreaterThan(0);
      expect(descriptor.patchOps.length).toBeGreaterThan(0);
      expect(typeof descriptor.render).toBe("function");
    }
  });

  it("reuses the existing docs-block metadata for adapted flavours", () => {
    expect(getDocBlockDescriptor("decision")?.targetKind).toBe("decision");
    expect(getDocBlockDescriptor("decision")?.label).toBe("Decision");
    expect(getDocBlockDescriptor("callout")?.label).toBe("Callout");
    expect(getDocBlockDescriptor("agent-contract")?.label).toBe("Agent Contract");
    expect(getDocBlockDescriptor("file-tree")?.label).toBe("File Tree");
    expect(getDocBlockDescriptor("constraint")?.label).toBe("Constraint");
    expect(getDocBlockDescriptor("assumption")?.label).toBe("Assumption");
  });

  it("returns null for unknown flavours", () => {
    expect(getDocBlockDescriptor("wormhole")).toBeNull();
  });

  it("describes every flavour for the agent surface", () => {
    const described = describeDocBlocksForAgent();
    expect(described.map((entry) => entry.flavour)).toEqual([...DOC_BLOCK_TYPES]);
    for (const entry of described) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.patchOps.length).toBeGreaterThan(0);
    }
  });
});

describe("restored flavours — parse-reuse adapters", () => {
  function checklistDoc(body: string): DocDocument {
    return {
      schemaVersion: 1,
      id: "registry-checklist",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "paragraph", props: {}, children: ["checklist-1"] },
        "checklist-1": {
          id: "checklist-1",
          flavour: "checklist",
          props: { title: "Restoration" },
          text: [{ insert: body }],
          children: [],
        },
      },
    };
  }

  it("renders real parsed checklist content through DocBlockRenderer", () => {
    const doc = checklistDoc("- [x] Wire adapters -- registry wired\n- [ ] Ship sidebar");
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    // Targeting wrapper + the component's own chrome (not the tracer card).
    expect(html).toContain('data-doc-block="checklist"');
    expect(html).toContain('data-docs-block-type="checklist"');
    expect(html).toContain("Wire adapters");
    expect(html).toContain("registry wired");
    expect(html).toContain("Ship sidebar");
    expect(html).toContain("1/2");
    expect(html).not.toContain("Invalid Checklist block");
  });

  it("renders the placeholder card instead of throwing when the body does not parse", () => {
    const doc = checklistDoc("no task rows here");
    const html = renderToStaticMarkup(createElement(DocBlockRenderer, { document: doc }));
    // Targeting attrs still exist so annotation/patch anchoring keeps working.
    expect(html).toContain('data-doc-block="checklist"');
    expect(html).toContain('data-block-id="checklist-1"');
    expect(html).toContain("Invalid Checklist block");
    expect(html).not.toContain('data-docs-block-type="checklist"');
  });

  it("appends a body-format hint to each restored flavour's agentDescription", () => {
    expect(getDocBlockDescriptor("checklist")?.agentDescription).toContain("- [x]");
    expect(getDocBlockDescriptor("diff")?.agentDescription).toContain("--- before ---");
    expect(getDocBlockDescriptor("api-endpoint")?.agentDescription).toContain("REQUIRED");
  });
});

describe("delta projections", () => {
  it("projects marks to markdown", () => {
    expect(
      deltaToMarkdown([
        { insert: "plain " },
        { insert: "bold", attributes: { bold: true } },
        { insert: " and " },
        { insert: "code", attributes: { code: true } },
        { insert: " and " },
        { insert: "site", attributes: { link: "https://example.com" } },
        { insert: " and " },
        {
          insert: "schema",
          attributes: { reference: { kind: "source", path: "apps/frontend/src/lib/docs-model/doc-schema.ts" } },
        },
      ]),
    ).toBe(
      "plain **bold** and `code` and [site](https://example.com) and [schema](apps/frontend/src/lib/docs-model/doc-schema.ts)",
    );
  });

  it("projects plain text", () => {
    expect(deltaToPlainText([{ insert: "a" }, { insert: "b", attributes: { bold: true } }])).toBe("ab");
    expect(deltaToPlainText(undefined)).toBe("");
  });
});

describe("image/attachment flavours — resolveAssetSrc (TG7.3)", () => {
  it("image block resolves its src through ctx.resolveAssetSrc when provided", () => {
    const descriptor = getDocBlockDescriptor("image");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx({
      resolveAssetSrc: (src) => `https://api.example.com/asset?path=${encodeURIComponent(src)}`,
    });
    const html = renderToStaticMarkup(
      descriptor!.render(block("image", { src: "./assets/images/sample.png", alt: "Sample" }), ctx) as never,
    );
    expect(html).toContain(
      'src="https://api.example.com/asset?path=.%2Fassets%2Fimages%2Fsample.png"',
    );
    expect(html).not.toContain('src="./assets/images/sample.png"');
  });

  it("image block falls back to the raw src when resolveAssetSrc is omitted (non-regression)", () => {
    const descriptor = getDocBlockDescriptor("image");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx();
    const html = renderToStaticMarkup(
      descriptor!.render(block("image", { src: "./assets/images/sample.png" }), ctx) as never,
    );
    expect(html).toContain('src="./assets/images/sample.png"');
  });

  it("attachment block shows filename, uppercase extension badge, size (when present), and a resolved download href", () => {
    const descriptor = getDocBlockDescriptor("attachment");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx({
      resolveAssetSrc: (src) => `https://api.example.com/asset?path=${encodeURIComponent(src)}`,
    });
    const html = renderToStaticMarkup(
      descriptor!.render(
        block("attachment", { src: "./assets/attachments/spec.pdf", name: "spec.pdf", size: 2_500_000 }),
        ctx,
      ) as never,
    );
    expect(html).toContain(">spec.pdf<");
    expect(html).toContain(">PDF<");
    expect(html).toContain(">2.4 MB<");
    expect(html).toContain(
      'href="https://api.example.com/asset?path=.%2Fassets%2Fattachments%2Fspec.pdf"',
    );
  });

  it("attachment block falls back to the raw src and omits size when not provided (non-regression)", () => {
    const descriptor = getDocBlockDescriptor("attachment");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx();
    const html = renderToStaticMarkup(
      descriptor!.render(block("attachment", { src: "./assets/attachments/spec.pdf", name: "spec.pdf" }), ctx) as never,
    );
    expect(html).toContain('href="./assets/attachments/spec.pdf"');
    expect(html).toContain(">spec.pdf<");
    expect(html).toContain(">PDF<");
  });
});
