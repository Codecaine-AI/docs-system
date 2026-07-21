/**
 * Ford's serialization read (2026-07-21): the per-type markdown-render
 * table is misplaced (per-type renders now live in block-design/
 * 40-agent-renderer; the read contract in translation-layer/
 * 20-agent-surface) and stale (mermaid row). Serialization keeps the
 * deterministic serializer + content hashes; the render section shrinks
 * to one pointer paragraph. Closing nav + divider dropped per standard.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const PATH = "docs/10-system-design/30-data-model/40-serialization/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

// identify blocks by scanning (render heading, its table+para, divider, closing)
let renderHeading = "";
let renderPara = "";
let renderTable = "";
let dividerId = "";
let closingId = "";
for (const id of root.children) {
  const block = doc.blocks[id];
  const txt = (block.text ?? []).map((s: DeltaSpan) => s.insert).join("");
  if (block.type === "heading" && txt === "The markdown render") renderHeading = id;
  if (block.type === "paragraph" && txt.startsWith("Agents read documents through")) renderPara = id;
  if (block.type === "structured-table" && block.props?.columns?.[0] === "type") renderTable = id;
  if (block.type === "divider") dividerId = id;
  if (block.type === "paragraph" && txt.startsWith("The tree being serialized")) closingId = id;
}
for (const [name, id] of [
  ["render heading", renderHeading],
  ["render para", renderPara],
  ["render table", renderTable],
  ["divider", dividerId],
  ["closing", closingId],
]) {
  if (!id) {
    console.error(`${name} not found; aborting`);
    process.exit(1);
  }
}

doc.blocks["b-ser-render-pointer-1"] = {
  id: "b-ser-render-pointer-1",
  type: "paragraph",
  props: {},
  children: [],
  text: [
    t("The second derived form is the runtime markdown render: pure, never written to disk, so it can never go stale against the source of truth. Its per-type mappings belong to each block's "),
    ref("agent renderer", "10-system-design/30-data-model/20-block-design/40-agent-renderer"),
    t(", and the read contract to the "),
    ref("agent surface", "10-system-design/20-translation-layer/20-agent-surface"),
    t("."),
  ],
};

const DROP = new Set([renderPara, renderTable, dividerId, closingId]);
root.children = root.children.flatMap((id: string) => {
  if (id === renderHeading) return []; // heading replaced by the pointer para
  if (renderPara === id) return ["b-ser-render-pointer-1"]; // pointer takes its slot
  if (DROP.has(id)) return [];
  return [id];
});
for (const id of [renderHeading, renderTable, dividerId, closingId, renderPara]) delete doc.blocks[id];

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("serialization trimmed");
