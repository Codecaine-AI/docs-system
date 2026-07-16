/**
 * Remove the three pm-mrnnkzni-* junk blocks my browser session's
 * open-corrupts-doc bug inserted into the manifesto, then write back
 * canonical serializer bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
} from "../packages/docs-model/src/index.ts";

const path = "docs/00-foundation/00-manifesto/doc.json";
const doc = JSON.parse(readFileSync(path, "utf8")) as DocDocument;

const junk = Object.keys(doc.blocks).filter((id) => id.startsWith("pm-mrnnkzni-"));
if (junk.length !== 3) {
  console.error(`expected 3 junk blocks, found ${junk.length}:`, junk);
  process.exit(1);
}
for (const id of junk) delete doc.blocks[id];
for (const block of Object.values(doc.blocks)) {
  block.children = block.children.filter((child) => !junk.includes(child));
}

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", result.issues);
  process.exit(1);
}
writeFileSync(path, serializeDocDocument(doc));
console.log("removed:", junk.join(", "));
