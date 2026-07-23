/** Align stale 10-system-design-30-packages-* doc ids with current paths. */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
const files = execSync("find docs/20-implementation/10-packages -mindepth 2 -name doc.json", { encoding: "utf8" }).trim().split("\n").sort();
for (const f of files) {
  const doc = JSON.parse(readFileSync(f, "utf8"));
  const want = f.replace(/^docs\//, "").replace(/\/doc\.json$/, "").replace(/\//g, "-");
  if (doc.id === want) { console.log(`ok(already) ${f}`); continue; }
  const old = doc.id;
  doc.id = want;
  const r = validateDocDocument(doc);
  if (!r.ok) { console.error(`${f} INVALID`); process.exit(1); }
  writeFileSync(f, serializeDocDocument(r.document));
  const bytes = readFileSync(f, "utf8");
  const re = validateDocDocument(JSON.parse(bytes));
  if (!re.ok || serializeDocDocument(re.document) !== bytes) { console.error(`${f} NOT CANONICAL`); process.exit(1); }
  console.log(`ok ${f}: ${old} -> ${want}`);
}
