import { isBareBundleSrc } from "@codecaine-ai/docs-model/bundle-src";
import type { DocBlockType } from "../doc-schema";
import type { LintRule } from "./types";

const SRC_BLOCK_TYPES: ReadonlySet<DocBlockType> = new Set([
  "canvas",
  "sequence",
  "image",
  "video",
]);

export const bundleRelativeSrcRule: LintRule = {
  id: "bundle-relative-src",
  docsPath: "10-system-design/10-doc-standards/80-authoring-lints",
  severity: "error",
  enforcement: ["complete"],
  applicability: "Document-owned canvas, sequence, image, and video blocks with string src props.",
  exclusions: ["Other block types and non-string src values are handled by their component schemas."],
  suggestion: "Prefix bundle asset paths with ./, or use a docs-root-relative path or URL.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      const src = block.props.src;
      if (
        !SRC_BLOCK_TYPES.has(block.type) ||
        typeof src !== "string" ||
        !isBareBundleSrc(src)
      ) {
        return [];
      }
      return [{
        blockId: block.id,
        field: "props.src",
        message: "src must be bundle-relative (`./assets/...`) or root-relative; the viewer will not resolve it.",
        evidence: src,
      }];
    });
  },
};
