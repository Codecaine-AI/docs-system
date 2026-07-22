import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
const files = execSync("find docs/10-system-design/40-block-vocabulary -name doc.json", { encoding: "utf8" }).trim().split("\n").sort();
let bad = 0;
for (const f of files) {
  const bytes = readFileSync(f, "utf8");
  const r = validateDocDocument(JSON.parse(bytes));
  if (!r.ok) { console.error(`INVALID ${f}`); bad++; continue; }
  if (serializeDocDocument(r.document) !== bytes) { console.error(`NOT CANONICAL ${f}`); bad++; continue; }
}
console.log(bad === 0 ? `all ${files.length} vocab docs canonical` : `${bad} problems`);
process.exit(bad === 0 ? 0 : 1);
