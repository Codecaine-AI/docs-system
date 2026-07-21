/**
 * Block-vocabulary renumber sweep (state-shape lands at 50):
 * 50-interaction-surface → 60-interaction-surface, 60-sequence → 70-sequence,
 * 70-canvas → 80-canvas. Folder moves already done with plain mv; this rewrites
 * every reference mark (and any raw text mention) in docs corpus doc.json files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const BASE = "10-system-design/40-block-vocabulary";
const MAP = new Map<string, string>([
  [`${BASE}/50-interaction-surface`, `${BASE}/60-interaction-surface`],
  [`${BASE}/60-sequence`, `${BASE}/70-sequence`],
  [`${BASE}/70-canvas`, `${BASE}/80-canvas`],
]);

/**
 * Highest-first sequential replace is collision-free here: every produced
 * string (60-interaction-surface, 70-sequence, 80-canvas) differs from every
 * remaining old string, so nothing double-shifts.
 */
function remapText(value: string): string {
  let out = value;
  for (const [oldPath, newPath] of [...MAP.entries()].reverse()) {
    out = out.replaceAll(oldPath, newPath);
  }
  return out;
}

const docPaths = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
let filesTouched = 0;
let spansTouched = 0;
for (const path of docPaths) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    if (!block.text) continue;
    for (const span of block.text) {
      const attrs = span.attributes as { reference?: { path?: string } } | undefined;
      const target = attrs?.reference?.path;
      if (target && MAP.has(target)) {
        attrs.reference!.path = MAP.get(target)!;
        touched = true;
        spansTouched += 1;
      }
      if (typeof span.insert === "string") {
        const next = remapText(span.insert);
        if (next !== span.insert) {
          span.insert = next;
          touched = true;
          spansTouched += 1;
        }
      }
    }
  }
  if (!touched) continue;
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  filesTouched += 1;
  console.log(`rewrote ${path}`);
}
console.log(`renumber sweep: ${spansTouched} spans in ${filesTouched} files`);
