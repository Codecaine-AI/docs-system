export type BlockSrcKind =
  | "url"
  | "root-absolute"
  | "parent-escape"
  | "bundle-relative"
  | "bare-bundle-relative"
  | "root-relative";

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function classifyBlockSrc(src: string): BlockSrcKind {
  if (URL_SCHEME.test(src)) return "url";
  if (src.startsWith("/")) return "root-absolute";
  if (src.startsWith("../")) return "parent-escape";
  if (src.startsWith("./")) return "bundle-relative";
  if (src.startsWith("assets/")) return "bare-bundle-relative";
  return "root-relative";
}

export function resolveBundleRelativeSrc(
  bundlePath: string | null | undefined,
  src: string,
): string {
  if (!bundlePath) return src;

  const kind = classifyBlockSrc(src);
  if (kind !== "bundle-relative" && kind !== "bare-bundle-relative") {
    return src;
  }

  return `${bundlePath}/${src.replace(/^(?:\.\/)+/, "")}`;
}

export function isBareBundleSrc(src: string): boolean {
  return classifyBlockSrc(src) === "bare-bundle-relative";
}

export function canonicalBundleSrc(src: string): string {
  return isBareBundleSrc(src) ? `./${src}` : src;
}
