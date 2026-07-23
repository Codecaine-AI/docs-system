/** Fold the coerced mermaid callout's illegal caption prop into its text. */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
const PATH = "docs/10-system-design/50-package-boundaries/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const block = doc.blocks["b-pkgb-chain-graph-6"];
const caption = block.props.caption;
delete block.props.caption;
if (caption) block.text.push({ insert: `\n\n${caption}` });
const result = validateDocDocument(doc);
if (!result.ok) { console.error(JSON.stringify(result.issues)); process.exit(1); }
writeFileSync(PATH, serializeDocDocument(result.document));
const bytes = readFileSync(PATH, "utf8");
const re = validateDocDocument(JSON.parse(bytes));
if (!re.ok || serializeDocDocument(re.document) !== bytes) { console.error("NOT CANONICAL"); process.exit(1); }
console.log("ok — caption folded, canonical");
