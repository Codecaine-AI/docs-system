/**
 * Annotations rename, corpus prose sweep (2026-07-21): every mention of
 * the COMMENTS CONCEPT (the sidecar/channel) becomes annotations.
 * In-code comments, HTML-comment lines, and "commented groups" stay.
 * Also re-points the docs-model source ref comments-schema.ts →
 * annotations-schema.ts (the code rename lands in a parallel worker).
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const REPLACEMENTS: Array<[string, string]> = [
  ["comments.json", "annotations.json"],
  ["comment-sidecar hashes", "annotation-sidecar hashes"],
  ["Comments, patches, and backlinks anchor", "Annotations, patches, and backlinks anchor"],
  ["comments anchor to blocks and spans", "annotations anchor to blocks and spans"],
  ["Comments anchor to blocks and to text spans", "Annotations anchor to blocks and to text spans"],
  ["direct manipulation, comments, themes", "direct manipulation, annotations, themes"],
  ["direct manipulation, comments, live theming", "direct manipulation, annotations, live theming"],
  ["Precise targeting and comments", "Precise targeting and annotations"],
  ["Plannotator-style comment composition", "Plannotator-style annotation composition"],
  ["defines comments whose targets anchor", "defines annotations whose targets anchor"],
  ["packages/docs-model/src/comments-schema.ts", "packages/docs-model/src/annotations-schema.ts"],
  ["compose a comment (with an intent)", "compose an annotation (with an intent)"],
  ["Comments live in the bundle's ", "Annotations live in the bundle's "],
  ["no comments pane", "no annotations pane"],
];

const files = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
let total = 0;
for (const path of files) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
    for (const span of block.text ?? []) {
      if (typeof span.insert !== "string") continue;
      for (const [from, to] of REPLACEMENTS) {
        if (span.insert.includes(from)) {
          span.insert = span.insert.split(from).join(to);
          total += 1;
          touched = true;
        }
      }
      // source refs pointing at the renamed schema file
      const r = span.attributes?.reference as { path?: string } | undefined;
      if (r?.path === "packages/docs-model/src/comments-schema.ts") {
        r.path = "packages/docs-model/src/annotations-schema.ts";
        touched = true;
      }
    }
  }
  if (touched) {
    const result = validateDocDocument(doc);
    if (!result.ok) {
      console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
      process.exit(1);
    }
    writeFileSync(path, serializeDocDocument(result.document));
    console.log(`swept ${path}`);
  }
}
console.log(`${total} replacements`);
