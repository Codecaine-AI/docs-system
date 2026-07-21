/**
 * Ford (2026-07-21): the annotations doc's "Two target kinds" is outdated —
 * the targeting layer has FOUR kinds (block, text_range, visual_point,
 * custom_element). Principle to state: ONE canonical annotation shape for
 * every target; processing specializes via the agent adapter, the shape
 * never does. Sidecar persistence today covers block + canvas-object (a
 * custom_element instance); the rest land additively. Canonical bytes.
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

const PATH = "docs/10-system-design/30-data-model/30-annotations/doc.json";
const doc = JSON.parse(readFileSync(PATH, "utf8"));
const root = doc.blocks[doc.root];

const li = (id: string, text: DeltaSpan[], children: string[] = []) => ({
  id,
  type: "list-item",
  props: {},
  text,
  children,
});

// replace the two-kind section with the canonical-target model
const OLD = [
  "b-ann-targets-h-7",
  "b-ann-target-block-8",
  "b-ann-target-canvas-10",
];
const at = root.children.indexOf(OLD[0]);
if (at < 0) {
  console.error("targets heading missing; aborting");
  process.exit(1);
}
for (const id of OLD) {
  for (const sub of doc.blocks[id]?.children ?? []) delete doc.blocks[sub];
  delete doc.blocks[id];
}
root.children = root.children.filter((id: string) => !OLD.includes(id));

const blocks: Record<string, unknown> = {
  "b-ann2-targets-h-1": {
    id: "b-ann2-targets-h-1",
    type: "heading",
    props: { level: 2 },
    children: [],
    text: [t("The target")],
  },
  "b-ann2-targets-lead-2": {
    id: "b-ann2-targets-lead-2",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t(
        "A target addresses anything a reader can point at. The annotation shape is the same for every one of them — what differs is how it gets processed, and that is the block type's business, not the annotation's.",
      ),
    ],
  },
  "b-ann2-tk-block-3": li("b-ann2-tk-block-3", [c("block")], ["b-ann2-tk-block-s1"]),
  "b-ann2-tk-block-s1": li("b-ann2-tk-block-s1", [
    t("A whole block by id; survives edits and moves because the generic ops preserve ids."),
  ]),
  "b-ann2-tk-range-4": li("b-ann2-tk-range-4", [c("text_range")], ["b-ann2-tk-range-s1"]),
  "b-ann2-tk-range-s1": li("b-ann2-tk-range-s1", [
    t(
      "A span inside a block's text: offsets plus the quoted text and its surrounding context, so the anchor can re-attach after edits.",
    ),
  ]),
  "b-ann2-tk-point-5": li("b-ann2-tk-point-5", [c("visual_point")], ["b-ann2-tk-point-s1"]),
  "b-ann2-tk-point-s1": li("b-ann2-tk-point-s1", [
    t("A coordinate on a visual surface — a spot on a canvas or an image."),
  ]),
  "b-ann2-tk-element-6": li("b-ann2-tk-element-6", [c("custom_element")], [
    "b-ann2-tk-element-s1",
    "b-ann2-tk-element-s2",
  ]),
  "b-ann2-tk-element-s1": li("b-ann2-tk-element-s1", [
    t(
      "An element inside a complex component — a canvas object, a connection, a sequence participant — by element id and type.",
    ),
  ]),
  "b-ann2-tk-element-s2": li("b-ann2-tk-element-s2", [
    t("The sidecar's canvas-object target ("),
    c("canvasSrc"),
    t(" plus exactly one selector: "),
    c("objectId"),
    t(", "),
    c("connectionId"),
    t(", or a region rectangle) is this kind's persisted form today."),
  ]),
  "b-ann2-oneshape-7": {
    id: "b-ann2-oneshape-7",
    type: "paragraph",
    props: {},
    children: [],
    text: [
      t(
        "The shape never specializes: an annotation on a sequence diagram looks exactly like an annotation on a paragraph. Special cases are handled at processing time by the type's ",
      ),
      ref("agent adapter", "10-system-design/30-data-model/20-block-design/60-agent-adapter"),
      t(
        ". The sidecar schema persists block and canvas-object targets today; the remaining kinds land additively, under the same optional-fields growth rule.",
      ),
    ],
  },
};
Object.assign(doc.blocks, blocks);
root.children.splice(
  at,
  0,
  "b-ann2-targets-h-1",
  "b-ann2-targets-lead-2",
  "b-ann2-tk-block-3",
  "b-ann2-tk-range-4",
  "b-ann2-tk-point-5",
  "b-ann2-tk-element-6",
  "b-ann2-oneshape-7",
);

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("annotations targets updated");
