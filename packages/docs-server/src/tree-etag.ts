import { createHash } from "node:crypto";

/** Strong ETag value (quoted sha256 hex) for a serialized docs tree. */
export function treeEtag(tree: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(tree)).digest("hex")}"`;
}

/**
 * RFC 9110 If-None-Match with weak comparison: true when the header is `*`
 * or lists `etag`, bare or prefixed `W/`.
 */
export function ifNoneMatchHits(header: string | null | undefined, etag: string): boolean {
  if (!header) return false;
  const value = header.trim();
  if (value === "*") return true;
  const bare = (tag: string) => tag.trim().replace(/^W\//, "");
  const target = bare(etag);
  return value.split(",").some((tag) => bare(tag) === target);
}
