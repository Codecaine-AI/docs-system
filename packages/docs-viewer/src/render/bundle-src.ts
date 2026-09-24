import { resolveBundleRelativeSrc } from "@codecaine-ai/docs-model/bundle-src";

/** Bundle-relative src canonicalization (pure path rewriting, no HTTP). */

/**
 * Canonicalizes a bundle-relative canvas src (CP5 tree bundle-awareness):
 * inside a doc.json bundle, `./assets/canvases/x.canvas.json` and bare
 * `assets/canvases/x.canvas.json` refer to the bundle folder's own assets.
 * Root-relative srcs and `../` escapes pass through unchanged.
 */
export function resolveBundleCanvasSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  return resolveBundleRelativeSrc(bundlePath, src);
}

/**
 * Canonicalizes a bundle-relative sequence src, mirroring
 * `resolveBundleCanvasSrc` exactly: a `sequence` block's `./assets/...` or
 * bare `assets/...` src rewrites to `<bundlePath>/assets/...`. Root-relative
 * srcs and `../` escapes pass through unchanged.
 */
export function resolveBundleSequenceSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  return resolveBundleRelativeSrc(bundlePath, src);
}

/**
 * Canonicalizes a bundle-relative asset src (TG7.3), mirroring
 * `resolveBundleCanvasSrc` exactly: an `image` block's `./assets/...` or bare
 * `assets/...` src rewrites to `<bundlePath>/assets/...`. Root-relative srcs
 * and `../` escapes pass through unchanged.
 */
export function resolveBundleAssetSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  return resolveBundleRelativeSrc(bundlePath, src);
}

// Page-title derivation (also pure bundle-path string logic) rides this
// entry because exports-map keys are frozen — `./bundle-src` is the
// package's React-free path-helpers surface, so hosts (workbench doc-title)
// can import the title helpers without pulling any component graph.
export { docSegmentFromTitle, docTitleFromPath } from "./doc-title";
