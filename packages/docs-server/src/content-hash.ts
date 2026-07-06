import { createHash } from "node:crypto";

/**
 * Canonical content-hash helper (SHA-256 hex) shared by every module that
 * hashes on-disk content for staleness preconditions (`index.ts` doc/comment
 * hashes, `agent-tools.ts` canvas hashes). ONE definition so every surface
 * derives byte-identical hashes for identical content.
 */
export function createContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
