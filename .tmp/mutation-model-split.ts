/**
 * Ford's mutation-model split (2026-07-21, both contracts pinned):
 * 50-mutation-model becomes a section. Overview keeps the op algebra,
 * refusal, actions, change events, discovery (de-counted; dup H1 +
 * closing nav dropped; interactions index added). NEW children:
 * 10-undo-redo (two layers: patch ledger w/ undo-by-id, redo = undoing
 * the undo; local keystroke history) and 20-copy-paste (typed clipboard
 * payloads, top-level block-run pastes, fresh ids, external conversion,
 * the validation gate). Corpus 58→60. Canonical bytes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const SEC = "docs/10-system-design/30-data-model/50-mutation-model";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}
type Def = [string, Record<string, unknown>];
function makeDoc(id: string, title: string, rootId: string, defs: Def[], subs: Array<[string, DeltaSpan[]]>) {
  const blocks: Record<string, unknown> = {};
  const children: string[] = [];
  for (const [bid, block] of defs) {
    blocks[bid] = { id: bid, children: (block.children as string[]) ?? [], ...block };
    children.push(bid);
  }
  for (const [bid, text] of subs) blocks[bid] = li(bid, text);
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  return { schemaVersion: 1, id, title, root: rootId, blocks };
}
const h2 = (text: string) => ({ type: "heading", props: { level: 2 }, text: [t(text)] });
const para = (spans: DeltaSpan[]) => ({ type: "paragraph", props: {}, text: spans });
const lead = (label: string, children: string[]) => ({
  type: "list-item",
  props: {},
  text: [b(label)],
  children,
});

// ------------------------------------------------------------------- overview
{
  const path = `${SEC}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  const textOf = (id: string) => (doc.blocks[id].text ?? []).map((s: DeltaSpan) => s.insert).join("");

  const drop: string[] = [];
  let actionsParaId = "";
  for (const id of root.children) {
    const block = doc.blocks[id];
    const txt = textOf(id);
    if (block.type === "heading" && block.props?.level === 1) drop.push(id);
    if (block.type === "divider") drop.push(id);
    if (block.type === "paragraph" && txt.startsWith("Read this alongside")) drop.push(id);
    if (block.type === "paragraph" && txt.includes("13 named actions")) actionsParaId = id;
  }
  if (!actionsParaId) {
    console.error("actions para not found; aborting");
    process.exit(1);
  }
  doc.blocks[actionsParaId].text = [
    t("The structured bundles — tables, file trees, interaction surfaces, code, and the diagram types — expose named actions for their collections. A "),
    c("blockAction"),
    t(" carries an action name plus params; the folded registry validates the params schema, applies, and returns the same inverse-op contract as every generic op. Discovery lists the current roster."),
  ];

  // interactions index after the intro (second paragraph)
  doc.blocks["b-mm-interactions-h-1"] = { id: "b-mm-interactions-h-1", children: [], ...h2("The interactions") };
  doc.blocks["b-mm-idx-undo-2"] = li("b-mm-idx-undo-2", [
    ref("Undo & redo", "10-system-design/30-data-model/50-mutation-model/10-undo-redo"),
  ], ["b-mm-idx-undo-2-gloss"]);
  doc.blocks["b-mm-idx-undo-2-gloss"] = li("b-mm-idx-undo-2-gloss", [
    t("Inverses, the patch ledger, undo by patch id, redo as undoing the undo, and the editor's local history."),
  ]);
  doc.blocks["b-mm-idx-paste-3"] = li("b-mm-idx-paste-3", [
    ref("Copy & paste", "10-system-design/30-data-model/50-mutation-model/20-copy-paste"),
  ], ["b-mm-idx-paste-3-gloss"]);
  doc.blocks["b-mm-idx-paste-3-gloss"] = li("b-mm-idx-paste-3-gloss", [
    t("Typed clipboard payloads, top-level block-run pastes, fresh ids for copies, and the validation gate."),
  ]);

  const introSecond = root.children.filter((id: string) => !drop.includes(id))[1];
  root.children = root.children.filter((id: string) => !drop.includes(id));
  const at = root.children.indexOf(introSecond);
  root.children.splice(at + 1, 0, "b-mm-interactions-h-1", "b-mm-idx-undo-2", "b-mm-idx-paste-3");
  for (const id of drop) delete doc.blocks[id];
  land(path, doc);
}

// ---------------------------------------------------------------- 10-undo-redo
land(
  `${SEC}/10-undo-redo/doc.json`,
  makeDoc("dm-mutation-10-undo-redo", "Undo & redo", "b-ur-root", [
    ["b-ur-intro-1", para([
      t("Undo is part of the algebra, not a feature bolted on: every successful apply returns exact inverse ops, and everything else follows. Two layers share that mechanism — the patch ledger for applied changes, and the editor's local history for typing."),
    ])],
    ["b-ur-structure-h-2", h2("Structure")],
    ["b-ur-code-3", {
      type: "code",
      props: {
        language: "json",
        annotations: [
          { lines: "2", label: "The change", note: "A shallow props patch, as applied." },
          { lines: "5", label: "The exact inverse", note: "Returned by the same apply — the prior value, not a guess. Applying it reverts the change." },
        ],
      },
      text: [t('// an applied op and the inverse the apply returned\n{ "type": "updateBlock", "blockId": "b-x", "props": { "density": "compact" } }\n\n// inverse\n{ "type": "updateBlock", "blockId": "b-x", "props": { "density": "normal" } }')],
    }],
    ["b-ur-rule-h-4", h2("The rule")],
    ["b-ur-inverse-5", lead("Every apply returns its inverses", ["b-ur-inverse-s1", "b-ur-inverse-s2"])],
    ["b-ur-ledger-6", lead("The patch ledger", ["b-ur-ledger-s1", "b-ur-ledger-s2"])],
    ["b-ur-redo-7", lead("Redo is undoing the undo", ["b-ur-redo-s1"])],
    ["b-ur-local-8", lead("Keystroke history stays local", ["b-ur-local-s1", "b-ur-local-s2"])],
    ["b-ur-why-h-9", h2("Why")],
    ["b-ur-why-trust-10", lead("Inverses make trust cheap", ["b-ur-why-trust-s1"])],
    ["b-ur-why-one-11", lead("One mechanism for every writer", ["b-ur-why-one-s1"])],
  ], [
    ["b-ur-inverse-s1", [t("Exact for the state actually changed — applying them reverts order, props, text, and subtree placement.")]],
    ["b-ur-inverse-s2", [t("Inverses come from the apply itself, so they are never stale reconstructions.")]],
    ["b-ur-ledger-s1", [t("Every applied batch is recorded as a patch with its inverses; "), c("POST /api/undo"), t(" reverses a patch by id — document, canvas, and sequence writes alike.")]],
    ["b-ur-ledger-s2", [t("Any surface can undo any patch: a human undoing an agent's change and an agent undoing its own are the same call.")]],
    ["b-ur-redo-s1", [t("An undo lands as a patch like any other, with inverses of its own — reversing it restores the change. No separate redo machinery exists, because none is needed.")]],
    ["b-ur-local-s1", [t("The editor keeps its own typing history, with redo, scoped to the session.")]],
    ["b-ur-local-s2", [t("It reaches the ledger only as saved op batches — the ledger never sees half-typed states.")]],
    ["b-ur-why-trust-s1", [t("An agent can act boldly when every patch reverses exactly; review becomes cheap because reverting is.")]],
    ["b-ur-why-one-s1", [t("Human edits and agent edits produce the same kind of patch, so one ledger serves both — no privileged writer.")]],
  ]),
);

// --------------------------------------------------------------- 20-copy-paste
land(
  `${SEC}/20-copy-paste/doc.json`,
  makeDoc("dm-mutation-20-copy-paste", "Copy & paste", "b-cp-root", [
    ["b-cp-intro-1", para([
      t("Copy and paste move structure, not strings. The clipboard carries typed block payloads, and a paste becomes ordinary typed operations — so nothing pasted can bypass validation."),
    ])],
    ["b-cp-rule-h-2", h2("The rule")],
    ["b-cp-copy-3", lead("Copy carries structure", ["b-cp-copy-s1", "b-cp-copy-s2"])],
    ["b-cp-toplevel-4", lead("Block runs land at top level", ["b-cp-toplevel-s1", "b-cp-toplevel-s2", "b-cp-toplevel-s3"])],
    ["b-cp-freshids-5", lead("The copy is a new block", ["b-cp-freshids-s1"])],
    ["b-cp-external-6", lead("External content converts", ["b-cp-external-s1"])],
    ["b-cp-gate-7", lead("Nothing bypasses the gate", ["b-cp-gate-s1", "b-cp-gate-s2"])],
    ["b-cp-why-h-8", h2("Why")],
    ["b-cp-why-structure-9", lead("Structure is the point", ["b-cp-why-structure-s1"])],
    ["b-cp-why-untrusted-10", lead("The clipboard is untrusted input", ["b-cp-why-untrusted-s1"])],
  ], [
    ["b-cp-copy-s1", [t("A block selection ships a closed, top-level slice — whole blocks, never fragments of a neighbor.")]],
    ["b-cp-copy-s2", [t("Block props, atom text, and references travel as typed JSON payloads in the clipboard markup ("), c("data-block-props"), t(", "), c("data-block-text"), t(", the reference payload), never as lossy HTML alone.")]],
    ["b-cp-toplevel-s1", [t("An empty caret block is replaced; at a block's start or end the run inserts before or after; mid-text, the block splits around it.")]],
    ["b-cp-toplevel-s2", [t("Never accidental nesting — depth is authored deliberately, not created by a paste.")]],
    ["b-cp-toplevel-s3", [t("Inline and partial-selection pastes merge into the caret block as marked text, the way a text editor would.")]],
    ["b-cp-freshids-s1", [t("Pasted blocks mint fresh ids; the original keeps its identity, so anchors and annotations stay with the source.")]],
    ["b-cp-external-s1", [t("HTML from outside lands as separate typed blocks — headings, paragraphs, list items — not one merged blob.")]],
    ["b-cp-gate-s1", [t("A paste persists as ordinary ops, and the save validates the entire resulting document before bytes reach disk.")]],
    ["b-cp-gate-s2", [t("Malformed clipboard data degrades to plain text instead of writing a span that fails validation later.")]],
    ["b-cp-why-structure-s1", [t("A paste that flattened blocks would make the human surface a text editor with pictures; structure surviving the clipboard is what keeps both surfaces honest.")]],
    ["b-cp-why-untrusted-s1", [t("Anything can put anything on a clipboard. Defensive parsing plus the validation gate means the worst paste costs formatting, never document integrity.")]],
  ]),
);

console.log("mutation-model split complete");
