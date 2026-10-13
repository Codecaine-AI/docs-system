import { isBareBundleSrc } from "@codecaine-ai/docs-model/bundle-src";
import type { DocBlockType } from "../doc-schema";
import type { LintRule } from "./types";

/** The asset-path prop each document-owned media block type carries. */
const ASSET_PROP_BY_TYPE: ReadonlyMap<DocBlockType, "src" | "poster"> = new Map([
  ["canvas", "src"],
  ["sequence", "src"],
  ["image", "src"],
  ["video", "src"],
  ["app-embed", "poster"],
]);

export const bundleRelativeSrcRule: LintRule = {
  id: "bundle-relative-src",
  docsPath: "10-system-design/10-doc-standards/80-authoring-lints",
  severity: "error",
  enforcement: ["complete"],
  applicability: "Document-owned canvas, sequence, image, and video blocks with string src props, and app-embed blocks with a string poster prop.",
  exclusions: ["Other block types and non-string src values are handled by their component schemas."],
  suggestion: "Prefix bundle asset paths with ./, or use a docs-root-relative path or URL.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      const key = ASSET_PROP_BY_TYPE.get(block.type);
      const src = key ? block.props[key] : undefined;
      if (!key || typeof src !== "string" || !isBareBundleSrc(src)) return [];
      return [{
        blockId: block.id,
        field: `props.${key}`,
        message: `${key} must be bundle-relative (\`./assets/...\`) or root-relative; the viewer will not resolve it.`,
        evidence: src,
      }];
    });
  },
};
