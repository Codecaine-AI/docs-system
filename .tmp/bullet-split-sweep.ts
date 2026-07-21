/**
 * Ford's standardization directive (2026-07-21, images: five-shapes index =
 * bad, numbering Why = good): NO "lead — gloss" bullets anywhere. Every
 * such list-item splits into a parent bullet (the lead: bold label, link,
 * or short phrase) with the gloss as a sub-bullet. Corpus-wide sweep.
 *
 * Split criteria for a list-item:
 *  - first span is bold or carries a reference, and the following text
 *    starts with " — "; OR
 *  - single plain text span whose first " — " occurs within 44 chars
 *    (short-lead invariant style).
 * The remainder keeps its spans; its first character is capitalized.
 * Existing children are kept AFTER the new gloss sub-bullet.
 * DRY=1 prints planned splits without writing. Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const DRY = process.env.DRY === "1";
const files = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();

let splits = 0;
for (const path of files) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const block of Object.values(doc.blocks) as Array<{
    id: string;
    type: string;
    text?: DeltaSpan[];
    children: string[];
  }>) {
    if (block.type !== "list-item" || !block.text?.length) continue;
    const [first, ...rest] = block.text;
    const firstAttrs = first.attributes ?? {};
    const isLead = firstAttrs.bold === true || firstAttrs.reference !== undefined;

    let leadSpans: DeltaSpan[] | null = null;
    let glossSpans: DeltaSpan[] | null = null;

    if (isLead && rest.length > 0 && typeof rest[0].insert === "string" && rest[0].insert.startsWith(" — ")) {
      const glossFirst = { ...rest[0], insert: rest[0].insert.slice(3) };
      leadSpans = [first];
      glossSpans = [glossFirst, ...rest.slice(1)];
    } else if (!isLead && block.text.length === 1 && typeof first.insert === "string") {
      const idx = first.insert.indexOf(" — ");
      if (idx > 0 && idx <= 44) {
        leadSpans = [{ ...first, insert: first.insert.slice(0, idx) }];
        glossSpans = [{ ...first, insert: first.insert.slice(idx + 3) }];
      }
    }
    if (!leadSpans || !glossSpans) continue;

    // capitalize the gloss's first character
    const g0 = glossSpans[0];
    if (typeof g0.insert === "string" && g0.insert.length > 0) {
      glossSpans[0] = { ...g0, insert: g0.insert.charAt(0).toUpperCase() + g0.insert.slice(1) };
    }
    // ensure the gloss ends a sentence (many glosses already end with ".")
    const last = glossSpans[glossSpans.length - 1];
    if (typeof last.insert === "string" && !/[.!?]\s*$/.test(last.insert)) {
      glossSpans[glossSpans.length - 1] = { ...last, insert: last.insert.replace(/\s*$/, "") + "." };
    }

    splits += 1;
    const leadText = leadSpans.map((s) => s.insert).join("");
    console.log(`${DRY ? "[dry] " : ""}${path} :: ${block.id} :: "${leadText}"`);
    if (DRY) continue;

    const subId = `${block.id}-gloss`;
    doc.blocks[subId] = { id: subId, type: "list-item", props: {}, text: glossSpans, children: [] };
    block.text = leadSpans;
    block.children = [subId, ...block.children];
    touched = true;
  }
  if (!DRY && touched) {
    const result = validateDocDocument(doc);
    if (!result.ok) {
      console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
      process.exit(1);
    }
    writeFileSync(path, serializeDocDocument(result.document));
  }
}
console.log(`${DRY ? "planned" : "performed"} ${splits} splits`);
