/**
 * Ford's call (2026-07-21): section renamed interaction-surfaces →
 * 20-translation-layer (folder moved via /api/move already). This lands the
 * title, the approved translation-layer opener, the inside-section child
 * ref re-pathing (/api/move does not rewrite refs inside the moved
 * subtree), and the system-design overview's heading + link text.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

function land(p: string, doc: unknown) {
  const r = validateDocDocument(doc);
  if (!r.ok) {
    console.error(p, JSON.stringify(r.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(p, serializeDocDocument(r.document));
  console.log("landed", p);
}

{
  const p = "docs/10-system-design/20-translation-layer/doc.json";
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.title = "Translation layer";
  doc.blocks["b-is2-opener-1"].text = [
    {
      insert:
        "A document is one canonical state that neither reader touches directly. That state is a translation layer between humans and AI: each reader meets it through a renderer that speaks its language, and changes it through interactions built for how it works. This section defines the idea and the contract between the surfaces; each surface's own doc goes deeper.",
    },
  ];
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    for (const span of block.text ?? []) {
      const r = span.attributes?.reference as { path?: string } | undefined;
      if (r?.path?.startsWith("10-system-design/20-interaction-surfaces/")) {
        r.path = r.path.replace("20-interaction-surfaces", "20-translation-layer");
      }
    }
  }
  land(p, doc);
}

{
  const p = "docs/10-system-design/doc.json";
  const doc = JSON.parse(readFileSync(p, "utf8"));
  let n = 0;
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    for (const span of block.text ?? []) {
      if (span.insert === "Interaction surfaces") {
        span.insert = "Translation layer";
        n += 1;
      }
    }
  }
  console.log("sd-overview spans updated:", n);
  land(p, doc);
}
