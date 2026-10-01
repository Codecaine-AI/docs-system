import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Editor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "../render/DocBlockRenderer";
import { TEXT_BLOCK_NODES } from "../editor/core/schema";
import {
  DocDividerWithView,
  DocImageWithView,
  DocVideoWithView,
} from "../editor/views/node-views";

/**
 * Style-rail token wiring for the eight rich-text blocks (paragraph, heading,
 * list-item, callout, divider, image, video), asserted on the RENDERED
 * DOM of both surfaces.
 *
 * A token the rendered element never reads is a dead slider — the state-shape
 * `rowPad` bug, where the registry had a knob and the component hardcoded
 * `py-3`. So each block is mounted through the read renderer AND the editor,
 * and every token must appear in the element's class as `var(<name>,…)` on
 * both. Read and edit must also wear the SAME class string, or a knob would
 * move one surface and not the other.
 */

let editor: Editor | undefined;

afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = undefined;
});

const text = (value: string) => [{ insert: value }];

const BLOCKS = [
  { id: "p", type: "paragraph", props: {}, text: text("Paragraph") },
  { id: "h1", type: "heading", props: { level: 1 }, text: text("Heading 1") },
  { id: "h2", type: "heading", props: { level: 2 }, text: text("Heading 2") },
  { id: "h3", type: "heading", props: { level: 3 }, text: text("Heading 3") },
  { id: "h4", type: "heading", props: { level: 4 }, text: text("Heading 4") },
  { id: "li", type: "list-item", props: {}, text: text("Item") },
  { id: "callout", type: "callout", props: { tone: "warning", title: "Careful" }, text: text("Body") },
  { id: "divider", type: "divider", props: {} },
  { id: "image", type: "image", props: { src: "a.png", alt: "A", caption: "Image caption" } },
  { id: "video", type: "video", props: { src: "a.mp4", caption: "Video caption" } },
] as const;

const DOCUMENT = {
  id: "doc",
  version: 1,
  title: "Tokens",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: BLOCKS.map((block) => block.id) },
    ...Object.fromEntries(BLOCKS.map((block) => [block.id, { ...block, children: [] }])),
  },
} as unknown as DocDocument;

const NODE_NAME: Record<string, string> = {
  paragraph: "docParagraph",
  heading: "docHeading",
  "list-item": "docListItem",
  callout: "docCallout",
  divider: "docDivider",
  image: "docImage",
  video: "docVideo",
};

function renderRead(): HTMLElement {
  return render(<DocBlockRenderer document={DOCUMENT} bundlePath="docs/x" />).container;
}

async function renderEdit(): Promise<HTMLElement> {
  editor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
      }),
      ...TEXT_BLOCK_NODES,
      DocDividerWithView,
      DocImageWithView,
      DocVideoWithView,
    ],
    content: {
      type: "doc",
      content: BLOCKS.map((block) => {
        const { level, ordered, ...blockProps } = block.props as Record<string, unknown>;
        const isText = "text" in block;
        return {
          type: NODE_NAME[block.type],
          attrs: {
            blockId: block.id,
            blockProps,
            ...(level === undefined ? {} : { level }),
            ...(ordered === undefined ? {} : { ordered }),
          },
          ...(isText
            ? {
                content: [
                  { type: "docBlockText", content: [{ type: "text", text: block.text[0].insert }] },
                ],
              }
            : {}),
        };
      }),
    },
    injectCSS: false,
  });
  const { container } = render(<EditorContent editor={editor} />);
  // React node views (callout, divider, image, video) mount asynchronously.
  await waitFor(() => {
    expect(container.querySelector("[data-callout-title]")).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector("figcaption")).not.toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
  });
  return container;
}

/**
 * element label -> [selector on the READ surface, selector on the EDIT
 * surface, tokens its class must read]. Selectors differ only where the two
 * surfaces legitimately use different wrappers (the read surface wraps a
 * text block in a `data-block-id` div; the editor puts the id on the element).
 */
const ELEMENTS: Array<{ label: string; read: string; edit: string; tokens: string[] }> = [
  {
    label: "paragraph",
    read: '[data-block-id="p"] > p',
    edit: 'p[data-block-id="p"]',
    tokens: ["var(--docs-paragraph-fg,#2a2a2a)", "var(--docs-paragraph-spacing,1)"],
  },
  {
    label: "heading h1",
    read: '[data-block-id="h1"] > h1',
    edit: 'h1[data-block-id="h1"]',
    tokens: [
      "var(--docs-heading-fg,#1f1f1f)",
      "var(--docs-heading-weight,600)",
      "var(--docs-heading-margin-top,40px)",
      "var(--docs-heading-margin-bottom,12px)",
      "var(--docs-heading-h1-size,1.875)",
    ],
  },
  {
    label: "heading h2",
    read: '[data-block-id="h2"] > h2',
    edit: 'h2[data-block-id="h2"]',
    tokens: ["var(--docs-heading-weight,600)", "var(--docs-heading-h2-size,1.25)"],
  },
  {
    label: "heading h3",
    read: '[data-block-id="h3"] > h3',
    edit: 'h3[data-block-id="h3"]',
    tokens: ["var(--docs-heading-weight,600)", "var(--docs-heading-h3-size,1)"],
  },
  {
    label: "heading h4",
    read: '[data-block-id="h4"] > h4',
    edit: 'h4[data-block-id="h4"]',
    tokens: ["var(--docs-heading-weight,600)", "var(--docs-heading-margin-top,40px)"],
  },
  {
    label: "list item",
    read: '[data-block-id="li"][role="listitem"]',
    edit: 'li[data-block-id="li"]',
    tokens: ["var(--docs-list-item-fg,#2a2a2a)", "var(--docs-list-item-gap,4px)"],
  },
  // The callout's card geometry (rule and hairline widths, padding, radius)
  // and palette live in its inline stylesheet; the class strings carry the
  // remaining knobs.
  {
    label: "callout frame",
    read: '[data-docs-block-type="callout"]',
    edit: '[data-docs-block-type="callout"]',
    tokens: ["var(--docs-callout-margin,20px)"],
  },
  {
    label: "callout icon",
    read: "[data-callout-icon] svg",
    edit: "[data-callout-icon] svg",
    tokens: ["var(--docs-callout-icon-size,14px)"],
  },
  {
    label: "callout head",
    read: "[data-callout-head]",
    edit: "[data-callout-head]",
    tokens: ["var(--docs-callout-title-text-size,13.5px)"],
  },
  {
    label: "callout title",
    read: "[data-callout-title]",
    edit: "[data-callout-title]",
    tokens: ["var(--docs-callout-title-weight,500)"],
  },
  {
    label: "callout body",
    read: "[data-callout-body]",
    edit: "[data-callout-body]",
    tokens: ["var(--docs-callout-body-text-scale,1)"],
  },
  {
    label: "divider",
    read: "hr",
    edit: "hr",
    tokens: [
      "var(--docs-divider-color,#e6e5e3)",
      "var(--docs-divider-thickness,1px)",
      "var(--docs-divider-spacing,2)",
    ],
  },
  {
    // The figure is the media panel: margin plus the frame knobs.
    label: "image figure",
    read: 'figure[data-block-id="image"]',
    edit: 'figure[data-block-id="image"]',
    tokens: [
      "var(--docs-image-margin,24px)",
      "var(--docs-image-border,#e6e5e3)",
      "var(--docs-image-border-width,1px)",
      "var(--docs-image-radius,var(--radius,2px))",
    ],
  },
  {
    // The caption is the panel head's title.
    label: "image caption",
    read: 'figure[data-block-id="image"] figcaption',
    edit: 'figure[data-block-id="image"] figcaption',
    tokens: [
      "var(--docs-image-caption-fg,#1f1f1f)",
      "var(--docs-image-caption-text-size,13.5px)",
      "var(--docs-image-caption-gap,8px)",
    ],
  },
  {
    label: "video figure",
    read: 'figure[data-docs-block-type="video"]',
    edit: 'figure[data-docs-block-type="video"]',
    tokens: ["var(--docs-video-margin,24px)"],
  },
  {
    label: "video panel",
    read: 'figure[data-docs-block-type="video"] [data-docs-media-panel]',
    edit: 'figure[data-docs-block-type="video"] [data-docs-media-panel]',
    tokens: [
      "var(--docs-video-border,#e6e5e3)",
      "var(--docs-video-border-width,1px)",
      "var(--docs-video-radius,var(--radius,2px))",
    ],
  },
  {
    label: "video caption",
    read: 'figure[data-docs-block-type="video"] figcaption',
    edit: 'figure[data-docs-block-type="video"] figcaption',
    tokens: [
      "var(--docs-video-caption-fg,#666562)",
      "var(--docs-video-caption-text-size,13.5px)",
      "var(--docs-video-caption-gap,8px)",
    ],
  },
];

const classOf = (container: HTMLElement, selector: string): string | null =>
  container.querySelector(selector)?.getAttribute("class") ?? null;

/** Tokens the element's class does NOT read — empty means fully wired. */
function missingTokens(container: HTMLElement, surface: "read" | "edit"): string[] {
  const missing: string[] = [];
  for (const element of ELEMENTS) {
    const className = classOf(container, element[surface]);
    if (className === null) {
      missing.push(`${element.label}: element not rendered`);
      continue;
    }
    for (const token of element.tokens) {
      if (!className.includes(token)) missing.push(`${element.label}: ${token}`);
    }
  }
  return missing;
}

describe("rich-text style tokens", () => {
  it("reads every token on the read surface", () => {
    expect(missingTokens(renderRead(), "read")).toEqual([]);
  });

  it("reads every token on the edit surface", async () => {
    expect(missingTokens(await renderEdit(), "edit")).toEqual([]);
  });

  it("wears the same class string on both surfaces, so one knob moves both", async () => {
    const read = renderRead();
    const readClasses = Object.fromEntries(
      ELEMENTS.map((element) => [element.label, classOf(read, element.read)]),
    );
    cleanup();
    const edit = await renderEdit();
    const editClasses = Object.fromEntries(
      ELEMENTS.map((element) => [element.label, classOf(edit, element.edit)]),
    );
    expect(editClasses).toEqual(readClasses);
  });

  it("gives h1-h3 a size token and leaves h4-h6 at the reading size", () => {
    const read = renderRead();
    const sizeTokens = (level: number) =>
      (classOf(read, `[data-block-id="h${level}"] > h${level}`) ?? "").match(
        /--docs-heading-h\d-size/g,
      ) ?? [];
    expect(sizeTokens(1)).toEqual(["--docs-heading-h1-size"]);
    expect(sizeTokens(2)).toEqual(["--docs-heading-h2-size"]);
    expect(sizeTokens(3)).toEqual(["--docs-heading-h3-size"]);
    expect(sizeTokens(4)).toEqual([]);
  });

  it("resolves the callout palette from the root-level tokens instead of shadowing them", () => {
    // The callout's inline stylesheet must READ the public tokens (so a rail
    // override on <html> reaches it) and never declare them on the element.
    const css = Array.from(renderRead().querySelectorAll("[data-docs-block-type='callout'] style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    for (const tone of ["info", "decision", "warning", "risk", "success"]) {
      for (const part of ["accent", "tint", "title-fg"]) {
        expect(css).toContain(`var(--docs-callout-${tone}-${part}, #`);
        expect(css).not.toMatch(new RegExp(`--docs-callout-${tone}-${part}:\\s`));
      }
    }
    expect(css).toContain("--docs-callout-text: var(--docs-callout-fg, #2a2a2a);");
    expect(css).toContain("--docs-callout-frame: var(--docs-callout-border, #e6e5e3);");
    expect(css).not.toMatch(/--docs-callout-fg:\s/);
    expect(css).not.toMatch(/--docs-callout-border:\s/);
  });
});
