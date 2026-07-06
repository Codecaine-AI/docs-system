/**
 * @codecaine-ai/docs-index — SQLite-backed backlinks index over doc.json
 * bundles and canvas sidecars, plus move-doc (bundle move + inbound
 * reference rewrite). Extracted from Spectre
 * apps/data-backend/src/docs-index. Runs on bun (uses bun:sqlite).
 */
export * from "./backlinks";
export * from "./ref-match";
export * from "./move-doc";
export * from "./paths";
