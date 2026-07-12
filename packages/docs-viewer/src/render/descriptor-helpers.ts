import { createElement, type ReactNode } from "react";
import type { DocsMdxBlock, DocsMdxParsedBlock } from "../components/base";
import type { DeltaSpan, DocBlock, DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import { deltaToPlainTextInline, wrapMarkdownMarks } from "@codecaine-ai/docs-model/delta-markdown";
import type { DocBlockDescriptor, DocBlockRenderContext } from "./block-registry";

export const STRUCTURAL_OPS = ["insertBlock", "updateBlock", "deleteBlock", "moveBlock"] as const;
export const TEXT_OPS = [...STRUCTURAL_OPS, "splitBlock", "mergeBlocks"] as const;

export function stringProp(block: DocBlock, key: string): string | undefined {
  const value = block.props[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function deltaToMarkdown(text: DeltaSpan[] | undefined): string {
  if (!text) return "";
  return text
    .map((span) => {
      const attrs = span.attributes;
      if (attrs?.reference) return `[${span.insert}](${attrs.reference.path})`;
      return wrapMarkdownMarks(span.insert, attrs);
    })
    .join("");
}

export function deltaToPlainText(text: DeltaSpan[] | undefined): string {
  return deltaToPlainTextInline(text);
}

export function el(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactNode {
  return createElement(tag, props, ...children);
}

export function blockAttrs(block: DocBlock): Record<string, unknown> {
  return {
    "data-doc-block": block.type,
    "data-block-id": block.id,
    "data-docs-target": "true",
    "data-docs-target-type": block.type,
  };
}

export function invalidBlockPlaceholder(
  block: DocBlock,
  ctx: DocBlockRenderContext,
  label: string,
): ReactNode {
  return el(
    "div",
    { key: block.id, ...blockAttrs(block) },
    el(
      "div",
      {
        className:
          "rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground",
      },
      `Invalid ${label} block — see agent description for the expected shape.`,
    ),
    ctx.renderChildren(block),
  );
}

type MdxAdapterOptions = {
  type: DocBlockType;
  block: DocsMdxBlock<any>;
  data: (block: DocBlock, body: string) => Record<string, unknown>;
};

export function mdxAdapterDescriptor(options: MdxAdapterOptions): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    type: options.type,
    targetKind: mdxBlock.targetKind,
    label: mdxBlock.label,
    agentDescription: mdxBlock.agentDescription,
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const body = deltaToMarkdown(block.text);
      const rendered = mdxBlock.render(
        {
          tag: mdxBlock.tag,
          type: mdxBlock.type,
          targetKind: mdxBlock.targetKind,
          sourceId: block.id,
          data: options.data(block, body),
        },
        { renderMarkdown: ctx.renderMarkdown },
      );
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        rendered,
        ctx.renderChildren(block),
      );
    },
  };
}

type ParseableDocsMdxBlock = DocsMdxBlock<any> & {
  parse(input: {
    tag: string;
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<any> | null;
};

type ParsedMdxAdapterOptions = {
  type: DocBlockType;
  block: ParseableDocsMdxBlock;
  bodyHint: string;
};

export function parsedMdxAdapterDescriptor(
  options: ParsedMdxAdapterOptions,
): DocBlockDescriptor {
  const mdxBlock = options.block;
  return {
    type: options.type,
    targetKind: mdxBlock.targetKind,
    label: mdxBlock.label,
    agentDescription: `${mdxBlock.agentDescription} ${options.bodyHint}`,
    patchOps: TEXT_OPS,
    render: (block, ctx) => {
      const body = deltaToMarkdown(block.text);
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(block.props)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          attrs[key] = String(value);
        }
      }
      attrs.id = block.id;
      const parsed = mdxBlock.parse({ tag: mdxBlock.tag, attrs, body, source: body });
      if (!parsed) {
        return invalidBlockPlaceholder(block, ctx, mdxBlock.label);
      }
      const rendered = mdxBlock.render(parsed, { renderMarkdown: ctx.renderMarkdown });
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        rendered,
        ctx.renderChildren(block),
      );
    },
  };
}
