/**
 * Post-move sweep for the doc-architecture<->interaction-surfaces renumber:
 * rewrites reference-span paths under the OLD prefixes to the NEW ones in
 * every corpus doc.json (exact + descendant paths), via validate+serialize.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const REWRITES: Array<[string, string]> = [
  ["10-system-design/20-doc-architecture", "10-system-design/10-doc-architecture"],
  ["10-system-design/10-interaction-surfaces", "10-system-design/20-interaction-surfaces"],
];

function rewritePath(p: string): string {
  for (const [from, to] of REWRITES) {
    if (p === from || p.startsWith(from + "/")) return to + p.slice(from.length);
  }
  return p;
}

const docPaths = [...new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })].sort();
let changed = 0;
for (const relPath of docPaths) {
  const doc = JSON.parse(readFileSync(relPath, "utf8"));
  let dirty = false;
  for (const block of Object.values(doc.blocks) as any[]) {
    for (const span of block.text ?? []) {
      const ref = span.attributes?.reference;
      if (ref?.path) {
        const next = rewritePath(ref.path);
        if (next !== ref.path) { ref.path = next; dirty = true; }
      }
    }
  }
  if (!dirty) continue;
  const result = validateDocDocument(doc);
  if (!result.ok) { console.error(relPath, "invalid after rewrite", JSON.stringify(result.issues)); process.exit(1); }
  writeFileSync(relPath, serializeDocDocument(result.document));
  changed++;
  console.log("rewrote", relPath);
}
console.log(`sweep done: ${changed} docs changed`);
