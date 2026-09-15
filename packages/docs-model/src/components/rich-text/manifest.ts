"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "rich-text",
  ownedTypes: ["paragraph", "heading", "list-item", "quote", "callout", "divider", "image", "image-grid", "video", "html"],
  description: "The rich-text flow: typing, marks, links, lists, inline embeds.",
  authoring: {
    "whenToUse": "Use paragraphs for explanation, headings for hierarchy, lists for steps or parallel facts, quotes for attributed text, and callouts for a distinct note. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.",
    "example": "Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.",
    "docsPath": "10-system-design/40-block-vocabulary/10-rich-text"
}
};
