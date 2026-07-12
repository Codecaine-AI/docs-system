import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import {
  STRUCTURAL_OPS,
  TEXT_OPS,
  blockAttrs,
  el,
  mdxAdapterDescriptor,
  stringProp,
} from "../../render/descriptor-helpers";
import {
  HEADING_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CHILDREN_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
  PARAGRAPH_CLASSES,
  QUOTE_CLASSES,
} from "../../render/block-classes";
import { CalloutDocsBlock } from "./CalloutDocsBlock";
import {
  VIDEO_AGENT_DESCRIPTION,
  VIDEO_LABEL,
  VideoBlock,
} from "./VideoDocsBlock";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "paragraph",
    targetKind: "paragraph",
    label: "Paragraph",
    agentDescription: "A paragraph of rich text (delta spans).",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el("p", { className: PARAGRAPH_CLASSES }, ctx.renderText(block.text)),
        ctx.renderChildren(block),
      ),
  },
  {
    type: "heading",
    targetKind: "heading",
    label: "Heading",
    agentDescription: "A section heading; props.level selects h1-h6.",
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const rawLevel = block.props.level;
      const level =
        typeof rawLevel === "number" && Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6
          ? rawLevel
          : 2;
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el(`h${level}`, { className: HEADING_CLASSES }, ctx.renderText(block.text)),
        ctx.renderChildren(block),
      );
    },
  },
  {
    type: "list-item",
    targetKind: "list-item",
    label: "List Item",
    agentDescription: "A list item; nesting via child list-item blocks (D25 normalized tree).",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        {
          key: block.id,
          ...blockAttrs(block),
          role: "listitem",
          className: LIST_ITEM_CLASSES,
        },
        el("span", { className: LIST_ITEM_BULLET_CLASSES, "aria-hidden": "true" }, "•"),
        el(
          "div",
          { className: LIST_ITEM_CONTENT_CLASSES },
          ctx.renderText(block.text),
          el("div", { className: LIST_ITEM_CHILDREN_CLASSES }, ctx.renderChildren(block)),
        ),
      ),
  },
  {
    type: "quote",
    targetKind: "quote",
    label: "Quote",
    agentDescription: "A block quote of rich text.",
    patchOps: TEXT_OPS,
    render: (block, ctx) =>
      el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        el("blockquote", { className: QUOTE_CLASSES }, ctx.renderText(block.text)),
        ctx.renderChildren(block),
      ),
  },
  {
    type: "divider",
    targetKind: "divider",
    label: "Divider",
    agentDescription: "A horizontal rule separating sections.",
    patchOps: STRUCTURAL_OPS,
    render: (block) =>
      el("hr", { key: block.id, ...blockAttrs(block), className: "my-6 border-border" }),
  },
  {
    type: "image",
    targetKind: "image",
    label: "Image",
    agentDescription:
      "An image from the doc bundle's assets/images/ (D30); props: src, alt, caption.",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const src = stringProp(block, "src");
      const resolvedSrc = src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined;
      const caption = stringProp(block, "caption");
      return el(
        "figure",
        { key: block.id, ...blockAttrs(block), className: "not-prose my-4" },
        resolvedSrc
          ? el("img", {
              src: resolvedSrc,
              alt: stringProp(block, "alt") ?? caption ?? "",
              className: "max-w-full rounded-md border",
            })
          : el(
              "div",
              {
                className:
                  "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
              },
              "Image block is missing a src.",
            ),
        caption
          ? el("figcaption", { className: "mt-1 text-xs text-muted-foreground" }, caption)
          : null,
        ctx.renderChildren(block),
      );
    },
  },
  {
    type: "video",
    targetKind: "video",
    label: VIDEO_LABEL,
    agentDescription: VIDEO_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const src = stringProp(block, "src");
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(VideoBlock, {
          id: block.id,
          src,
          // Same optional plumbing as the image descriptor above: the host
          // decides HOW a bundle-relative src resolves; raw src otherwise.
          resolvedSrc: src ? (ctx.resolveAssetSrc?.(src) ?? src) : undefined,
          url: stringProp(block, "url"),
          title: stringProp(block, "title"),
          caption: stringProp(block, "caption"),
        }),
        ctx.renderChildren(block),
      );
    },
  },
  mdxAdapterDescriptor({
    type: "callout",
    block: new CalloutDocsBlock(),
    data: (block, body) => ({
      id: block.id,
      tone: stringProp(block, "tone") ?? "info",
      kind: stringProp(block, "kind"),
      title: stringProp(block, "title"),
      body,
    }),
  }),
];
