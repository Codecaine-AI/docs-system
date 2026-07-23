/**
 * 40-docs-viewer page: mermaid was removed from the viewer (component dir,
 * descriptors, editor nodes, and the `mermaid` npm dependency), so drop the
 * two prose mentions — the component-family list and the dependency list.
 * Minimal present-state edit: remove each `mermaid` code span plus its
 * preceding ", " separator span. Canonical-serializer flow:
 * validateDocDocument -> mutate -> serializeDocDocument, with byte-canonical
 * asserts on both the original file and the written output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
} from "../packages/docs-model/src/index.ts";

const PATH = "docs/20-implementation/10-packages/40-docs-viewer/doc.json";

const originalBytes = readFileSync(PATH, "utf8");
const originalResult = validateDocDocument(JSON.parse(originalBytes));
if (!originalResult.ok) {
  throw new Error(`original failed validation: ${JSON.stringify(originalResult.issues)}`);
}
// Byte-canonicality precondition: never rewrite a file that is not already canonical.
if (serializeDocDocument(originalResult.document) !== originalBytes) {
  throw new Error("original file is not byte-canonical — aborting");
}

const doc = originalResult.document;
let removed = 0;
for (const block of Object.values(doc.blocks)) {
  if (!block.text) continue;
  const index = block.text.findIndex(
    (span) => span.insert === "mermaid" && span.attributes?.code === true,
  );
  if (index === -1) continue;
  const previous = block.text[index - 1];
  if (!previous || previous.insert !== ", " || previous.attributes) {
    throw new Error(
      `block ${block.id}: mermaid span not preceded by a plain ", " separator — refusing to guess`,
    );
  }
  block.text = [...block.text.slice(0, index - 1), ...block.text.slice(index + 1)];
  removed += 1;
}
if (removed !== 2) throw new Error(`expected to remove 2 mermaid mentions, removed ${removed}`);

const serialized = serializeDocDocument(doc);
if (serialized.toLowerCase().includes("mermaid")) {
  throw new Error("serialized output still mentions mermaid");
}
// Byte-canonicality postcondition: the emitted bytes must round-trip exactly.
const reResult = validateDocDocument(JSON.parse(serialized));
if (!reResult.ok) throw new Error("mutated document failed validation");
if (serializeDocDocument(reResult.document) !== serialized) {
  throw new Error("output is not byte-canonical");
}

writeFileSync(PATH, serialized);
console.log(`OK: removed ${removed} mermaid mentions from ${PATH}`);
