/**
 * Regenerates every corpus projection golden from disk state: deletes all
 * docs__*.md goldens (fixture golden untouched), then writes one golden per
 * corpus doc.json via projectToMarkdown. Run after any corpus edit/move.
 */
import { readdirSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateDocDocument, projectToMarkdown } from "../packages/docs-model/src/index.ts";

const GOLDENS = "packages/docs-model/src/__tests__/goldens/projection";

for (const name of readdirSync(GOLDENS)) {
  if (name.startsWith("docs__")) unlinkSync(join(GOLDENS, name));
}

const docPaths = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
let wrote = 0;
for (const relPath of docPaths) {
  const result = validateDocDocument(JSON.parse(readFileSync(relPath, "utf8")));
  if (!result.ok) {
    console.error(`${relPath} failed validation:`, JSON.stringify(result.issues));
    process.exit(1);
  }
  const goldenName = relPath.replace(/\/doc\.json$/, "").replaceAll("/", "__") + ".md";
  writeFileSync(join(GOLDENS, goldenName), projectToMarkdown(result.document));
  wrote += 1;
}
console.log(`regenerated ${wrote} goldens from ${docPaths.length} docs`);
