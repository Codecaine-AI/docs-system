/**
 * Ford's annotations decision (2026-07-21): comments → ANNOTATIONS —
 * "you're annotating something to have it changed"; one name across
 * packages (canvas's agent processes annotations too); full rename now
 * (annotations.json canonical, legacy comments key read-compat — code
 * rename runs in a parallel worker). This rewrites the doc at its new
 * home 40-annotations: the human→agent channel framing, sidecar example
 * with the annotations key + an agentRun receipt, ported field table and
 * target kinds, the TARGET-DESIGN lifecycle (queue → receipt → resolved →
 * kept record incl. eval fodder) with an honest not-wired callout, ported
 * dangling-target paragraphs. Canonical bytes.
 */
import { writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

const PATH = "docs/10-system-design/30-data-model/40-annotations/doc.json";

const blocks: Record<string, unknown> = {};
const children: string[] = [];
const add = (id: string, block: Record<string, unknown>) => {
  blocks[id] = { id, children: (block.children as string[]) ?? [], ...block };
  children.push(id);
};
const sub = (id: string, text: DeltaSpan[]) => {
  blocks[id] = { id, type: "list-item", props: {}, text, children: [] };
};

add("b-ann-intro-1", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "An annotation marks a spot in a doc and says what should change there. It is the human-to-agent channel: this system is one person working with agents, and annotations carry the requests. They never live inside ",
    ),
    c("doc.json"),
    t(" — each bundle may carry an "),
    c("annotations.json"),
    t(" sidecar, so annotation churn never touches content bytes or content hashes."),
  ],
});
add("b-ann-laidout-h-2", { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] });
add("b-ann-example-3", {
  type: "code",
  props: {
    language: "json",
    annotations: [
      {
        lines: "3",
        label: "The canonical key",
        note: "Legacy sidecars using a comments key normalize on read; writes emit annotations.",
      },
      {
        lines: "25-30",
        label: "The receipt",
        note: "The agent run that handled the request — session, patch, summary, and exactly which ids changed.",
      },
    ],
  },
  text: [
    t(
      '{\n  "schemaVersion": 1,\n  "annotations": [\n    {\n      "id": "a-example-1",\n      "target": { "kind": "block", "blockId": "b-example-body" },\n      "body": "Tighten this paragraph.",\n      "intent": "agent-request",\n      "author": "ford",\n      "status": "open",\n      "createdAt": "2026-07-15T09:30:00Z"\n    },\n    {\n      "id": "a-example-2",\n      "target": {\n        "kind": "canvas-object",\n        "canvasSrc": "assets/flow.canvas.json",\n        "objectId": "node-auth"\n      },\n      "body": "Rename this node to match the doc.",\n      "intent": "agent-request",\n      "author": "ford",\n      "status": "resolved",\n      "createdAt": "2026-07-15T09:31:00Z",\n      "agentRun": {\n        "sessionId": "s-20260715-a",\n        "patchId": "p-114",\n        "summary": "Renamed node-auth to Session Manager.",\n        "changedIds": ["node-auth"]\n      },\n      "resolution": "Renamed as asked."\n    }\n  ]\n}',
    ),
  ],
});
add("b-ann-fields-h-4", { type: "heading", props: { level: 2 }, text: [t("The annotation")] });
add("b-ann-fields-intro-5", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "Annotation ids follow the same stable-ASCII id rule as block ids and must be unique within the sidecar. Validation is the same style as the document validator: pure, no throw, typed issue list.",
    ),
  ],
});
add("b-ann-fields-table-6", {
  type: "structured-table",
  props: {
    columns: ["field", "shape", "meaning"],
    density: "compact",
    rows: [
      ["id", "stable ASCII id, unique in the sidecar", "Identity for resolve/edit flows."],
      ["target", "block | canvas-object", "What the annotation is about; see targets below."],
      ["body", "string", "The request — what should change."],
      ["intent", '"note" | "agent-request"', "Margin note vs work item for an agent."],
      ["author", "non-empty string", "Who wrote it."],
      ["status", '"open" | "resolved"', "Lifecycle; resolved annotations stay in the file."],
      ["createdAt", "string timestamp", "When it was created."],
      [
        "agentRun?",
        "{ sessionId, patchId, summary, changedIds? }",
        "Receipt of the agent run that handled the request.",
      ],
      ["resolution?", "string", "Optional note persisted when resolving with a response."],
    ],
  },
});
add("b-ann-targets-h-7", { type: "heading", props: { level: 2 }, text: [t("Two target kinds")] });
add("b-ann-target-block-8", {
  type: "list-item",
  props: {},
  text: [c("block")],
  children: ["b-ann-target-block-sub-9"],
});
sub("b-ann-target-block-sub-9", [
  c("{ kind: \"block\", blockId }"),
  t(". Anchors to a block id in the bundle's own "),
  c("doc.json"),
  t("; survives edits and moves because "),
  c("updateBlock"),
  t(" and "),
  c("moveBlock"),
  t(" preserve ids."),
]);
add("b-ann-target-canvas-10", {
  type: "list-item",
  props: {},
  text: [c("canvas-object")],
  children: ["b-ann-target-canvas-sub-11"],
});
sub("b-ann-target-canvas-sub-11", [
  c("{ kind: \"canvas-object\", canvasSrc, ... }"),
  t(" plus exactly one selector: "),
  c("objectId"),
  t(", "),
  c("connectionId"),
  t(", or a region rectangle ("),
  c("x, y"),
  t(" finite; "),
  c("width, height"),
  t(" finite and positive). Zero selectors or two selectors are both validation errors."),
]);
add("b-ann-lifecycle-h-12", { type: "heading", props: { level: 2 }, text: [t("The lifecycle")] });
add("b-ann-life-queue-13", {
  type: "list-item",
  props: {},
  text: [b("Open annotations are the work queue")],
  children: ["b-ann-life-queue-sub-14"],
});
sub("b-ann-life-queue-sub-14", [
  t("You mark spots and state requests; the set of open annotations is what the agent works through."),
]);
add("b-ann-life-receipt-15", {
  type: "list-item",
  props: {},
  text: [b("A handled request carries its receipt")],
  children: ["b-ann-life-receipt-sub1-16", "b-ann-life-receipt-sub2-17"],
});
sub("b-ann-life-receipt-sub1-16", [
  t("The "),
  c("agentRun"),
  t(" records the session and patch that produced the change, a human-readable summary, and optionally "),
  c("changedIds"),
  t(" — the exact block or canvas-object ids touched."),
]);
sub("b-ann-life-receipt-sub2-17", [
  t("An open viewer can flash exactly those targets without re-diffing."),
]);
add("b-ann-life-kept-18", {
  type: "list-item",
  props: {},
  text: [b("Resolved annotations stay")],
  children: ["b-ann-life-kept-sub1-19", "b-ann-life-kept-sub2-20"],
});
sub("b-ann-life-kept-sub1-19", [
  t("Resolving persists an optional "),
  c("resolution"),
  t(" note; nothing is deleted."),
]);
sub("b-ann-life-kept-sub2-20", [
  t(
    "The kept record is reference material — real request-to-change pairs, including for building eval sets.",
  ),
]);
add("b-ann-direction-21", {
  type: "callout",
  props: { kind: "Direction", title: "Annotate mode is not wired up yet", tone: "warning" },
  text: [
    t(
      "The surface flow — leave annotations, an AI processes them and reports back — is the target design, not current behavior. The shapes and validation for all of it exist today; the processing loop does not.",
    ),
  ],
});
add("b-ann-additive-22", {
  type: "callout",
  props: { kind: "Compatibility", tone: "info" },
  text: [
    c("changedIds"),
    t(" and "),
    c("resolution"),
    t(
      " are optional and additive: sidecars written before those fields existed still validate unchanged. The schema grows by adding optional fields, not by bumping ",
    ),
    c("schemaVersion"),
    t("."),
  ],
});
add("b-ann-shared-23", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "The name is deliberately shared across packages: the canvas package's own agent processes annotations on canvas objects through this same concept and shape — one vocabulary everywhere annotations appear.",
    ),
  ],
});
add("b-ann-dangling-h-24", { type: "heading", props: { level: 2 }, text: [t("Dangling targets")] });
add("b-ann-dangling-blocks-25", {
  type: "paragraph",
  props: {},
  text: [
    t("Because targets anchor by id, deletion — and the fresh ids minted by split and merge — can strand them. "),
    c("detectDanglingTargets"),
    t(
      " flags annotations whose targets no longer resolve: a block target dangles when its blockId is missing from the document. Dangling annotations are reported, not auto-deleted — the record of what was asked outlives the block it pointed at.",
    ),
  ],
});
add("b-ann-dangling-canvas-26", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "Canvas checks distinguish \"not loaded yet\" from \"loaded and absent\": while the canvas index is still loading, canvas-target checks are skipped entirely (block checks still run) — otherwise every canvas-object annotation would flash \"target removed\" during load. Once loaded, a missing ",
    ),
    c("canvasSrc"),
    t(", "),
    c("objectId"),
    t(", or "),
    c("connectionId"),
    t(" is genuinely dangling."),
  ],
});

const rootId = "b-ann-root";
blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
const out = {
  schemaVersion: 1,
  id: "10-system-design-30-data-model-40-annotations",
  title: "Annotations",
  root: rootId,
  blocks,
};
const result = validateDocDocument(out);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log("rewrote 40-annotations");
