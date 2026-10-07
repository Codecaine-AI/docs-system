/**
 * Page-title derivation now lives in the viewer
 * (docs-viewer/src/render/doc-title.ts) so the side-peek panel and DocPage
 * derive titles through the SAME code. This module stays as the workbench's
 * import point — a pure re-export via the viewer's frozen `./bundle-src`
 * exports-map entry (React-free path-helpers surface).
 */
export { docSegmentFromTitle, docTitleFromPath } from "@codecaine-ai/docs-viewer/bundle-src";
