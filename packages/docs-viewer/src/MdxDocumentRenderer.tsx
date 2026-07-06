"use client";

import { Fragment, useMemo, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  DOCS_MDX_BLOCK_REGISTRY,
  docsMdxBlockRegistry,
  type AnyDocsMdxParsedBlock,
} from "./docs-blocks/registry";
import type { DocsMdxBlockRenderContext } from "./docs-blocks/base";

type MdxSegment =
  | { kind: "markdown"; content: string; key: string }
  | { kind: "block"; block: AnyDocsMdxParsedBlock; key: string }
  | { kind: "unsupported"; tag: string; source: string; key: string };

export interface MdxDocumentRendererProps {
  content: string;
  renderCanvas?: DocsMdxBlockRenderContext["renderCanvas"];
}

export { DOCS_MDX_BLOCK_REGISTRY, docsMdxBlockRegistry };

const COMPONENT_OPEN_RE = /^<([A-Z][A-Za-z0-9]*)\b([^>]*)>\s*$/;
const SELF_CLOSING_COMPONENT_RE = /^<([A-Z][A-Za-z0-9]*)\b([^>]*)\/>\s*$/;
const ATTR_RE = /([A-Za-z_:][A-Za-z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/g;

type MarkdownNode = {
  position?: {
    start?: { offset?: number; line?: number };
    end?: { offset?: number; line?: number };
  };
};

function targetAttrs(type: string, node?: MarkdownNode) {
  const startOffset = node?.position?.start?.offset;
  const endOffset = node?.position?.end?.offset;
  const line = node?.position?.start?.line;
  const sourceId =
    typeof startOffset === "number" ? `${type}:${startOffset}` : undefined;

  return {
    "data-docs-target": "true",
    "data-docs-target-type": type,
    "data-source-id": sourceId,
    "data-source-start": typeof startOffset === "number" ? String(startOffset) : undefined,
    "data-source-end": typeof endOffset === "number" ? String(endOffset) : undefined,
    "data-line": typeof line === "number" ? String(line) : undefined,
  };
}

const markdownComponents = {
  h1({ node, ...props }: ComponentPropsWithoutRef<"h1"> & { node?: MarkdownNode }) {
    return <h1 {...targetAttrs("heading", node)} {...props} />;
  },
  h2({ node, ...props }: ComponentPropsWithoutRef<"h2"> & { node?: MarkdownNode }) {
    return <h2 {...targetAttrs("heading", node)} {...props} />;
  },
  h3({ node, ...props }: ComponentPropsWithoutRef<"h3"> & { node?: MarkdownNode }) {
    return <h3 {...targetAttrs("heading", node)} {...props} />;
  },
  h4({ node, ...props }: ComponentPropsWithoutRef<"h4"> & { node?: MarkdownNode }) {
    return <h4 {...targetAttrs("heading", node)} {...props} />;
  },
  h5({ node, ...props }: ComponentPropsWithoutRef<"h5"> & { node?: MarkdownNode }) {
    return <h5 {...targetAttrs("heading", node)} {...props} />;
  },
  h6({ node, ...props }: ComponentPropsWithoutRef<"h6"> & { node?: MarkdownNode }) {
    return <h6 {...targetAttrs("heading", node)} {...props} />;
  },
  p({ node, ...props }: ComponentPropsWithoutRef<"p"> & { node?: MarkdownNode }) {
    return <p {...targetAttrs("paragraph", node)} {...props} />;
  },
  li({ node, ...props }: ComponentPropsWithoutRef<"li"> & { node?: MarkdownNode }) {
    return <li {...targetAttrs("list-item", node)} {...props} />;
  },
  blockquote({
    node,
    ...props
  }: ComponentPropsWithoutRef<"blockquote"> & { node?: MarkdownNode }) {
    return <blockquote {...targetAttrs("blockquote", node)} {...props} />;
  },
  pre({ node, ...props }: ComponentPropsWithoutRef<"pre"> & { node?: MarkdownNode }) {
    return <pre {...targetAttrs("code", node)} {...props} />;
  },
  table({
    node,
    ...props
  }: ComponentPropsWithoutRef<"table"> & { node?: MarkdownNode }) {
    return <table {...targetAttrs("table", node)} {...props} />;
  },
};

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function parseMdxSegments(content: string): MdxSegment[] {
  const lines = content.split("\n");
  const segments: MdxSegment[] = [];
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
    if (markdownBuffer.length === 0) return;
    const markdown = markdownBuffer.join("\n");
    if (markdown.trim().length > 0) {
      segments.push({
        kind: "markdown",
        content: markdown,
        key: `markdown-${segments.length}`,
      });
    }
    markdownBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const selfClosingMatch = trimmed.match(SELF_CLOSING_COMPONENT_RE);
    const openMatch = trimmed.match(COMPONENT_OPEN_RE);
    const componentMatch = selfClosingMatch ?? openMatch;

    if (!componentMatch) {
      markdownBuffer.push(lines[i]);
      continue;
    }

    const tag = componentMatch[1];
    if (!docsMdxBlockRegistry.has(tag)) {
      flushMarkdown();
      const sourceLines = [lines[i]];
      if (!selfClosingMatch) {
        const closeRe = new RegExp(`^</${tag}>\\s*$`);
        while (i + 1 < lines.length) {
          i++;
          sourceLines.push(lines[i]);
          if (closeRe.test(lines[i].trim())) break;
        }
      }
      segments.push({
        kind: "unsupported",
        tag,
        source: sourceLines.join("\n"),
        key: `unsupported-${segments.length}`,
      });
      continue;
    }

    flushMarkdown();
    const attrs = parseAttrs(componentMatch[2] ?? "");
    const sourceLines = [lines[i]];
    const bodyLines: string[] = [];

    if (!selfClosingMatch) {
      const closeRe = new RegExp(`^</${tag}>\\s*$`);
      while (i + 1 < lines.length) {
        i++;
        sourceLines.push(lines[i]);
        if (closeRe.test(lines[i].trim())) break;
        bodyLines.push(lines[i]);
      }
    }

    const source = sourceLines.join("\n");
    const block = docsMdxBlockRegistry.parse({
      tag,
      attrs,
      body: bodyLines.join("\n"),
      source,
    });
    if (block) {
      segments.push({
        kind: "block",
        block,
        key: `${block.type}-${block.sourceId ?? segments.length}`,
      });
    } else {
      segments.push({
        kind: "unsupported",
        tag,
        source,
        key: `unsupported-${segments.length}`,
      });
    }
  }

  flushMarkdown();
  return segments;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

function stripLeadingFrontmatter(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return content;

  const closingIndex = lines.findIndex((line, index) => {
    return index > 0 && line.trim() === "---";
  });
  if (closingIndex < 0) return content;

  return lines.slice(closingIndex + 1).join("\n").replace(/^\s*\n/, "");
}

function UnsupportedMdxBlock({ tag, source }: { tag: string; source: string }) {
  return (
    <section
      className="not-prose my-4 rounded-md border border-dashed bg-muted/30 p-3"
      data-docs-target="true"
      data-docs-target-type="unsupported-mdx"
      data-mdx-block={tag}
      data-docs-block-type="unsupported-mdx"
      data-source-id={`unsupported:${tag}`}
    >
      <div className="mb-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Unsupported MDX block: &lt;{tag}&gt;
      </div>
      <pre className="overflow-auto rounded border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {source}
      </pre>
    </section>
  );
}

export default function MdxDocumentRenderer({
  content,
  renderCanvas,
}: MdxDocumentRendererProps) {
  // Parsing is pure in `content` and non-trivial for large docs — don't
  // re-parse on unrelated re-renders.
  const segments = useMemo(
    () => parseMdxSegments(stripLeadingFrontmatter(content)),
    [content],
  );

  return (
    <>
      {segments.map((segment) => {
        if (segment.kind === "block") {
          const blockSpec = docsMdxBlockRegistry.get(segment.block.tag);
          return blockSpec ? (
            <Fragment key={segment.key}>
              {blockSpec.render(segment.block, {
                renderMarkdown: (markdown) => <MarkdownContent content={markdown} />,
                renderCanvas,
              })}
            </Fragment>
          ) : null;
        }
        if (segment.kind === "unsupported") {
          return (
            <UnsupportedMdxBlock
              key={segment.key}
              tag={segment.tag}
              source={segment.source}
            />
          );
        }
        return <MarkdownContent key={segment.key} content={segment.content} />;
      })}
    </>
  );
}
