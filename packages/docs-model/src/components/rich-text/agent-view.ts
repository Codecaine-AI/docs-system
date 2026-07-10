"use client";

import { deltaToMarkdownInline } from "../../delta-markdown";
import type { DocBlock } from "../../doc-schema";
import { blockquotePrefix, numberProp, stringProp } from "../projection-utils";
import type { ComponentBundle } from "../types";

function headingLevel(block: DocBlock): number {
  const level = numberProp(block, "level");
  if (level && Number.isInteger(level) && level >= 1 && level <= 6) return level;
  return 2;
}

function projectCallout(block: DocBlock): string {
  // kind (free-form label chip, incl. coerced legacy type names) wins over
  // the tone-derived label.
  const label = stringProp(block, "kind") ?? (stringProp(block, "tone") ?? "info").toUpperCase();
  const title = stringProp(block, "title");
  const body = deltaToMarkdownInline(block.text);

  let head = `**${label}`;
  if (title) head += `: ${title}`;
  head += "**";
  if (body) head += ` — ${body}`;
  return blockquotePrefix(head);
}

function projectImage(block: DocBlock): string {
  const src = stringProp(block, "src") ?? "";
  const alt = stringProp(block, "alt") ?? stringProp(block, "caption") ?? "";
  const caption = stringProp(block, "caption");
  const lines = [`![${alt}](${src})`];
  if (caption) lines.push(`*${caption}*`);
  return lines.join("\n");
}

function projectVideo(block: DocBlock): string {
  // External url wins over the bundle-relative src when both are present —
  // same precedence the video block's render surface applies.
  const target = stringProp(block, "url") ?? stringProp(block, "src");
  const title = stringProp(block, "title");
  const caption = stringProp(block, "caption");

  let head = "**Video";
  if (title) head += `: ${title}`;
  head += "**";
  if (target) head += ` — ${target}`;
  if (caption) head += ` — ${caption}`;
  return blockquotePrefix(head);
}

function projectListItem(block: DocBlock, depth: number, index: number): string {
  const indent = "  ".repeat(depth);
  const ordered = block.props.ordered === true;
  const bullet = ordered ? `${index + 1}.` : "-";
  return `${indent}${bullet} ${deltaToMarkdownInline(block.text)}`;
}

export const richTextAgentView: ComponentBundle["agentView"] = (block, ctx) => {
  switch (block.type) {
    case "heading": {
      const level = headingLevel(block);
      return `${"#".repeat(level)} ${deltaToMarkdownInline(block.text)}`;
    }
    case "paragraph":
      return block.text && block.text.length > 0 ? deltaToMarkdownInline(block.text) : null;
    case "quote":
      return blockquotePrefix(deltaToMarkdownInline(block.text));
    case "divider":
      return "---";
    case "callout":
      return projectCallout(block);
    case "image":
      return projectImage(block);
    case "video":
      return projectVideo(block);
    case "list-item":
      return projectListItem(block, ctx.listDepth, ctx.listIndex);
    default:
      return null;
  }
};
