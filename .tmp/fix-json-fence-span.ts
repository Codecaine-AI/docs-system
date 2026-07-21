/**
 * The markdown-render grammar paragraph carried an inline code span of
 * "```json", which projects as malformed nested backticks. Rephrase: a fenced
 * `json` code block, no backticks inside the code span.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const path = "docs/10-system-design/40-block-vocabulary/50-state-shape/doc.json";
const doc = JSON.parse(readFileSync(path, "utf8"));
const para = doc.blocks["b-25-state-shape-proj-7"];

const spans = para.text as DeltaSpan[];
const fenceIndex = spans.findIndex((span) => span.insert === "```json");
if (fenceIndex < 0) {
  console.error("```json code span not found");
  process.exit(1);
}
spans.splice(
  fenceIndex - 1,
  3,
  { insert: " is present, a blank line and a fenced " },
  { insert: "json", attributes: { code: true } },
  { insert: " code block follow, holding the example pretty-printed through the shared " },
);

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(path, serializeDocDocument(result.document));
console.log(`landed ${path}`);
