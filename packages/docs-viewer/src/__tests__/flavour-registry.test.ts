import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_FLAVOURS } from "@codecaine-ai/docs-model/doc-schema";
import {
  deltaToMarkdown,
  deltaToPlainText,
  describeDocFlavoursForAgent,
  type DocFlavourRenderContext,
  getDocFlavourDescriptor,
} from "../flavour-registry";

/** Minimal render context — enough to drive `image`/`attachment` descriptors. */
function makeCtx(overrides: Partial<DocFlavourRenderContext> = {}): DocFlavourRenderContext {
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
    for (const flavour of DOC_BLOCK_FLAVOURS) {
      const descriptor = getDocFlavourDescriptor(flavour);
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
    expect(getDocFlavourDescriptor("decision")?.targetKind).toBe("decision");
    expect(getDocFlavourDescriptor("decision")?.label).toBe("Decision");
    expect(getDocFlavourDescriptor("callout")?.label).toBe("Callout");
    expect(getDocFlavourDescriptor("agent-contract")?.label).toBe("Agent Contract");
    expect(getDocFlavourDescriptor("file-tree")?.label).toBe("File Tree");
    expect(getDocFlavourDescriptor("constraint")?.label).toBe("Constraint");
    expect(getDocFlavourDescriptor("assumption")?.label).toBe("Assumption");
  });

  it("returns null for unknown flavours", () => {
    expect(getDocFlavourDescriptor("wormhole")).toBeNull();
  });

  it("describes every flavour for the agent surface", () => {
    const described = describeDocFlavoursForAgent();
    expect(described.map((entry) => entry.flavour)).toEqual([...DOC_BLOCK_FLAVOURS]);
    for (const entry of described) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.patchOps.length).toBeGreaterThan(0);
    }
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
    const descriptor = getDocFlavourDescriptor("image");
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
    const descriptor = getDocFlavourDescriptor("image");
    expect(descriptor).not.toBeNull();
    const ctx = makeCtx();
    const html = renderToStaticMarkup(
      descriptor!.render(block("image", { src: "./assets/images/sample.png" }), ctx) as never,
    );
    expect(html).toContain('src="./assets/images/sample.png"');
  });

  it("attachment block shows filename, uppercase extension badge, size (when present), and a resolved download href", () => {
    const descriptor = getDocFlavourDescriptor("attachment");
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
    const descriptor = getDocFlavourDescriptor("attachment");
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
