/**
 * Repairs delta spans whose reference attribute is invalid (the paste
 * "[object Object]" corruption, 2026-07-17): drops the broken reference so
 * the span becomes plain text, revalidates, rewrites canonical bytes.
 * Scans the entire corpus; reports every repair.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const isValidRef = (r: unknown): boolean =>
  typeof r === "object" &&
  r !== null &&
  ((r as Record<string, unknown>).kind === "doc" || (r as Record<string, unknown>).kind === "source") &&
  typeof (r as Record<string, unknown>).path === "string" &&
  ((r as Record<string, unknown>).path as string).length > 0;

const docPaths = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
let repairedDocs = 0;
for (const relPath of docPaths) {
  const raw = JSON.parse(readFileSync(relPath, "utf8"));
  let repairs = 0;
  for (const block of Object.values(raw.blocks ?? {}) as Array<Record<string, unknown>>) {
    const text = block.text as Array<Record<string, unknown>> | undefined;
    if (!text) continue;
    for (const span of text) {
      const attrs = span.attributes as Record<string, unknown> | undefined;
      if (!attrs || attrs.reference === undefined) continue;
      if (!isValidRef(attrs.reference)) {
        console.log(`${relPath} :: block ${block.id} :: dropping broken reference on "${span.insert}"`);
        delete attrs.reference;
        if (Object.keys(attrs).length === 0) delete span.attributes;
        repairs += 1;
      }
    }
  }
  if (repairs === 0) continue;
  const result = validateDocDocument(raw);
  if (!result.ok) {
    console.error(`${relPath} STILL INVALID after repair:`, JSON.stringify(result.issues));
    process.exit(1);
  }
  writeFileSync(relPath, serializeDocDocument(result.document));
  repairedDocs += 1;
  console.log(`${relPath} repaired (${repairs} span(s)), canonical bytes rewritten`);
}
console.log(`done: ${repairedDocs} doc(s) repaired out of ${docPaths.length}`);
