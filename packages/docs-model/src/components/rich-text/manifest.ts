"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "rich-text",
  ownedTypes: ["paragraph", "heading", "list-item", "quote", "callout", "divider", "image", "video"],
  description: "The rich-text flow: typing, marks, links, lists, inline embeds.",
};
