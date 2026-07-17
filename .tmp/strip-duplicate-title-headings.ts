/**
 * R2-D11 sweep: DocPage now renders fixed page-title furniture derived from
 * the bundle folder name (web/src/lib/doc-title.ts). A doc whose FIRST block
 * is an H1 saying the same thing would show its title twice — strip that
 * heading. Conservative: only a leading, childless, level-1 heading whose
 * normalized text equals the normalized derived title is removed; richer
 * opening headings ("The data model — one format, five shapes") stay.
 * Canonical bytes rewritten; run goldens regen + links/backlinks after.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, basename } from "node:path";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";
import { docTitleFromPath } from "../packages/docs-workbench/web/src/lib/doc-title.ts";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

type RawBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  text?: Array<{ insert?: string }>;
};

const docPaths = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
let stripped = 0;
const kept: string[] = [];
for (const relPath of docPaths) {
  const raw = JSON.parse(readFileSync(relPath, "utf8")) as {
    root: string;
    blocks: Record<string, RawBlock>;
  };
  const derived = docTitleFromPath(basename(dirname(relPath)));
  const root = raw.blocks[raw.root];
  const firstId = root.children?.[0];
  const first = firstId ? raw.blocks[firstId] : undefined;
  const text = (first?.text ?? []).map((s) => s.insert ?? "").join("");
  const level = (first?.props?.level as number | undefined) ?? 1;
  if (!first || first.type !== "heading" || level !== 1) {
    kept.push(`${relPath} — first block is ${first?.type ?? "none"}, untouched`);
    continue;
  }
  if (first.children?.length) {
    kept.push(`${relPath} — leading H1 has children, untouched`);
    continue;
  }
  if (normalize(text) !== normalize(derived)) {
    kept.push(`${relPath} — H1 "${text}" richer than "${derived}", kept`);
    continue;
  }
  root.children!.shift();
  delete raw.blocks[first.id];
  const result = validateDocDocument(raw);
  if (!result.ok) {
    console.error(`${relPath} INVALID after strip:`, JSON.stringify(result.issues));
    process.exit(1);
  }
  writeFileSync(relPath, serializeDocDocument(result.document));
  stripped += 1;
  console.log(`${relPath} — stripped duplicate H1 "${text}"`);
}
console.log(`\nstripped ${stripped}/${docPaths.length}; kept:`);
for (const line of kept) console.log(`  ${line}`);
