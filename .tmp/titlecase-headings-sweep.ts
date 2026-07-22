/**
 * Corpus-wide heading Title Case sweep (Ford's 2026-07-21 directive, now a
 * writingstyle.md rule): first letter of every word in a heading is
 * capitalized; minor words stay lowercase mid-heading (first and last word
 * always capitalized, mirroring docTitleFromPath); only a word's FIRST
 * letter ever changes — acronyms/camelCase/code-marked spans keep their
 * exact form. Excludes the eight rich-text type pages (a parallel worker
 * owns those this sitting). DRY=1 previews without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const DRY = process.env.DRY === "1";

const MINOR = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
  "of", "on", "or", "per", "the", "to", "via", "vs",
]);

const EXCLUDED = new Set(
  ["10-paragraph", "11-heading", "12-list-item", "13-quote", "14-callout", "15-divider", "16-image", "17-video"].map(
    (d) => `docs/10-system-design/40-block-vocabulary/10-rich-text/${d}/doc.json`,
  ),
);

const files = execSync("find docs -name doc.json", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => !EXCLUDED.has(f))
  .sort();

function wordsOf(insert: string): string[] {
  return insert.split(/\s+/).filter((w) => w.length > 0);
}

let changedDocs = 0;
let changedHeadings = 0;

for (const file of files) {
  const bytes = readFileSync(file, "utf8");
  const doc = JSON.parse(bytes);
  let docChanged = false;

  for (const block of Object.values(doc.blocks) as any[]) {
    if (block.type !== "heading" || !Array.isArray(block.text)) continue;

    const totalWords = block.text.reduce(
      (n: number, span: any) => n + wordsOf(String(span.insert ?? "")).length,
      0,
    );
    if (totalWords === 0) continue;

    const before = block.text.map((s: any) => s.insert).join("");
    let wordIndex = 0;

    for (const span of block.text) {
      const insert = String(span.insert ?? "");
      const attrs = span.attributes ?? {};
      const skip = attrs.code === true || attrs.reference !== undefined;
      if (skip) {
        wordIndex += wordsOf(insert).length;
        continue;
      }
      // Rebuild the span word by word, preserving whitespace runs.
      const parts = insert.split(/(\s+)/);
      const rebuilt = parts
        .map((part) => {
          if (part.length === 0 || /^\s+$/.test(part)) return part;
          const idx = wordIndex++;
          const m = part.match(/^([^A-Za-z]*)([a-z])(.*)$/);
          if (!m) return part; // already capitalized, all-punct, or digit-led
          const trimmed = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
          // Identifier-looking words (paths, package/type names, filenames)
          // are content like code spans — never restyled.
          if (/[-/._]/.test(trimmed)) return part;
          const bare = trimmed.toLowerCase();
          const isEdge = idx === 0 || idx === totalWords - 1;
          if (!isEdge && MINOR.has(bare)) return part;
          return m[1] + m[2].toUpperCase() + m[3];
        })
        .join("");
      span.insert = rebuilt;
    }

    const after = block.text.map((s: any) => s.insert).join("");
    if (after !== before) {
      docChanged = true;
      changedHeadings++;
      console.log(`  ${file}\n    "${before}" -> "${after}"`);
    }
  }

  if (docChanged) {
    changedDocs++;
    if (!DRY) {
      const result = validateDocDocument(doc);
      if (!result.ok) {
        console.error(`${file} INVALID after sweep: ${JSON.stringify(result.issues)}`);
        process.exit(1);
      }
      writeFileSync(file, serializeDocDocument(result.document));
      const reread = readFileSync(file, "utf8");
      const revalidated = validateDocDocument(JSON.parse(reread));
      if (!revalidated.ok || serializeDocDocument(revalidated.document) !== reread) {
        console.error(`${file} NOT CANONICAL after write`);
        process.exit(1);
      }
    }
  }
}

console.log(`${DRY ? "[DRY] " : ""}${changedHeadings} headings across ${changedDocs} docs`);
