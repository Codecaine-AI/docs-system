/** Re-verify canonical-bytes idempotence for the three restructured pages. */
import { readFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PAGES = [
  "docs/10-system-design/40-block-vocabulary/60-interaction-surface/doc.json",
  "docs/10-system-design/40-block-vocabulary/70-sequence/doc.json",
  "docs/10-system-design/40-block-vocabulary/80-canvas/doc.json",
];

let failed = false;
for (const path of PAGES) {
  const bytes = readFileSync(path, "utf8");
  const result = validateDocDocument(JSON.parse(bytes));
  if (!result.ok) {
    console.error(`${path} invalid: ${JSON.stringify(result.issues, null, 2)}`);
    failed = true;
    continue;
  }
  if (serializeDocDocument(result.document) !== bytes) {
    console.error(`${path} not canonical`);
    failed = true;
    continue;
  }
  console.log(`ok ${path}`);
}
if (failed) process.exit(1);
console.log("all canonical");
