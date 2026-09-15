import type { LintRule } from "../../lint/types";
const docsPath = "99-appendix/10-style-guide/20-structure";
const base = {
  docsPath,
  severity: "warning" as const,
  enforcement: [] as const,
  exclusions: ["Schema validity, handled by existing validators"],
};
const text = (b: { text?: { insert: string }[] }) =>
  b.text?.map((s) => s.insert).join("") ?? "";
export const imageAltRule: LintRule = {
  ...base,
  id: "structure.image-alt",
  audit: { id: "W2", severity: "warning" },
  applicability: "Document images and image grid entries",
  suggestion: "Add alt text describing the image information.",
  check: ({ blocks }) => blocks.flatMap(b => {
    const images = b.type === "image" ? [{ image: b.props, field: "props.alt" }]
      : b.type === "image-grid" && Array.isArray(b.props.images)
        ? b.props.images.map((image, i) => ({ image, field: `props.images[${i}].alt` })) : [];
    return images.filter(({ image }) => typeof image.alt !== "string" || !image.alt.trim())
      .map(({ image, field }) => ({ blockId: b.id, field, evidence: String(image.src), message: "Image is missing alt text." }));
  }),
};
