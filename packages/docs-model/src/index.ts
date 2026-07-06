/**
 * @codecaine-ai/docs-model — the pure-TypeScript doc.json document model.
 *
 * Zero React, zero DOM, zero HTTP: schema validation, block ops, delta-span
 * markdown bridges, the markdown projection, comment sidecar schema, and the
 * SpectreRef reference shape. Extracted from Spectre
 * apps/frontend/src/lib/docs-model (flavour-registry.ts, which imports React
 * components, lives in @codecaine-ai/docs-viewer instead).
 */
export * from "./doc-schema";
export * from "./doc-ops";
export * from "./comments-schema";
export * from "./delta-markdown";
export * from "./project-markdown";
export * from "./markdown-to-delta";
export * from "./spectre-ref";
