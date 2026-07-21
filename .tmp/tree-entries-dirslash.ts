/**
 * File-tree entries in the three doc-standards trees rendered leaf entries
 * as files, which sorts them AFTER directories — 00-foundation fell to the
 * bottom of every tree, unacceptable in docs about ordering. Every corpus
 * doc is a bundle folder, so every entry gets a trailing "/" (the schema's
 * directory marker). Canonical bytes; idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
} from "../packages/docs-model/src/index.ts";

const TARGETS: Array<[string, string]> = [
  ["docs/10-system-design/10-doc-standards/doc.json", "b-da3-shape-tree-13"],
  ["docs/10-system-design/10-doc-standards/10-structure/doc.json", "b-struct-laidout-tree-28"],
  ["docs/10-system-design/10-doc-standards/20-numbering/doc.json", "b-num-laidout-tree-16"],
];

for (const [path, blockId] of TARGETS) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const block = doc.blocks[blockId];
  if (!block) {
    console.error(`${path}: block ${blockId} missing; aborting`);
    process.exit(1);
  }
  block.props.entries = block.props.entries.map((e: { path: string; note: string }) => ({
    ...e,
    path: e.path.endsWith("/") ? e.path : `${e.path}/`,
  }));
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`slashed ${path}`);
}
