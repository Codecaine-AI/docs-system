"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "rich-text",
  ownedTypes: ["paragraph", "heading", "list-item", "callout", "divider", "image", "image-grid", "video", "html", "app-embed"],
  description: "The rich-text flow: typing, marks, links, lists, inline embeds.",
  authoring: {
    "whenToUse": "Use paragraphs for explanation, headings for hierarchy, lists for steps or parallel facts, and callouts for a distinct note. Use a checklist, list items with checked set, to track open and done work, such as an install checklist or a release checklist. Do not use it for plain facts or for steps nobody ticks off. Tick an item with docs_list_item_set_checked. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use app-embed for a live view of an app a codebase declares: supply app, plus view, params, title, height (240 to 2000, default 480) and a poster image as needed. The host resolves the reference to a URL, the reader presses Start, and the app runs in a sandboxed iframe. Hosts without the app show an unavailable note. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.",
    "example": "Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.",
    "docsPath": "10-system-design/40-block-vocabulary/10-text-and-media/10-rich-text"
}
};
