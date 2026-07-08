/**
 * Bundle-relative src canonicalization, copied from Spectre
 * lib/projects-api (pure path rewriting — no HTTP).
 */

/**
 * Canonicalizes a bundle-relative canvas src (CP5 tree bundle-awareness):
 * inside a doc.json bundle, `./assets/canvases/x.canvas.json` refers to the
 * BUNDLE folder's own assets, so it rewrites to the docs-root-relative form
 * `<bundlePath>/assets/canvases/x.canvas.json`. Root-relative srcs and
 * `../` escapes pass through unchanged.
 */
export function resolveBundleCanvasSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  if (!bundlePath || !src.startsWith("./")) return src;
  return `${bundlePath}/${src.replace(/^(?:\.\/)+/, "")}`;
}

/**
 * Canonicalizes a bundle-relative asset src (TG7.3), mirroring
 * `resolveBundleCanvasSrc` exactly: an `image` block's
 * `./assets/...` src rewrites to the docs-root-relative form
 * `<bundlePath>/assets/...`. Root-relative srcs and `../` escapes pass
 * through unchanged.
 */
export function resolveBundleAssetSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  if (!bundlePath || !src.startsWith("./")) return src;
  return `${bundlePath}/${src.replace(/^(?:\.\/)+/, "")}`;
}
