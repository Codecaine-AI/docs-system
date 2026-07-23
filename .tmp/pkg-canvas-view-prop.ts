/** Add the view crop to the dependency-chain canvas embed (worker-confirmed). */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
const PATH = "docs/20-implementation/10-packages/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
doc.blocks["b-pkgb-chain-canvas"].props = {
  src: "./assets/canvases/package-dependency-chain.canvas.json",
  title: "Who depends on whom",
  view: "package-dependency-chain",
};
const r = validateDocDocument(doc);
if (!r.ok) { console.error(JSON.stringify(r.issues)); process.exit(1); }
writeFileSync(PATH, serializeDocDocument(r.document));
const bytes = readFileSync(PATH, "utf8");
const re = validateDocDocument(JSON.parse(bytes));
if (!re.ok || serializeDocDocument(re.document) !== bytes) { console.error("NOT CANONICAL"); process.exit(1); }
console.log("ok — view prop added, canonical");
