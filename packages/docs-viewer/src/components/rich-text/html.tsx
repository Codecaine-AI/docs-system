"use client";

import { createElement } from "react";
import type { DocBlockDescriptor } from "../../render/block-registry";
import { STRUCTURAL_OPS, blockAttrs, el, stringProp } from "../../render/descriptor-helpers";
import { WIDE_LEFT_BLOCK_LAYOUT } from "../../render/block-layout";
import { atomBlockNode } from "../../editor/core/node-helpers";

export const DocHtml = atomBlockNode("docHtml");

/** Prepend policy before author markup so later meta tags cannot relax it. */
export function htmlEmbedDocument(html: string, allowScripts = false): string {
  const policy = `default-src 'none'; script-src ${allowScripts ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light dark}body{margin:0;padding:12px;box-sizing:border-box;font-family:system-ui,sans-serif}img,svg,video{max-width:100%}</style></head><body>${html}</body></html>`;
}

export function HtmlBlock({ html, title, height = 400, allowScripts = false, caption }: {
  html: string; title: string; height?: number; allowScripts?: boolean; caption?: string;
}) {
  return <figure className="not-prose my-4" data-docs-block-type="html">
    <iframe title={title || "HTML content"} srcDoc={htmlEmbedDocument(html, allowScripts)}
      sandbox={allowScripts ? "allow-scripts" : ""} referrerPolicy="no-referrer" loading="lazy"
      style={{ width: "100%", height: Math.min(2000, Math.max(120, height)), border: "1px solid var(--border)", borderRadius: 6 }} />
    {caption && <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>}
  </figure>;
}

export const htmlDescriptor: DocBlockDescriptor = {
  type: "html", targetKind: "html", label: "HTML",
  agentDescription: "Self-contained HTML/CSS artifact. Props: html (max 1 MiB), title (required accessible label), caption?, height? (120–2000px; default 400), allowScripts? (default false). Inline CSS and data: media work offline. Explicit scripts run only inside an opaque-origin sandbox; fetch, external subresources, nested frames, forms, popups, and parent access are blocked. No external or relative assets. Use code for displayed source examples. Insert/update through typed block operations.",
  patchOps: STRUCTURAL_OPS, layout: WIDE_LEFT_BLOCK_LAYOUT,
  render: (block, ctx) => el("div", { key: block.id, ...blockAttrs(block) }, createElement(HtmlBlock, {
    html: stringProp(block, "html") ?? "", title: stringProp(block, "title") ?? "HTML content",
    caption: stringProp(block, "caption"), height: typeof block.props.height === "number" ? block.props.height : undefined,
    allowScripts: block.props.allowScripts === true,
  }), ctx.renderChildren(block)),
};
