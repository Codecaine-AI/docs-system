import { describe, expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { judgmentRules, ruleApplies } from "../lint-feedback";
import { outline } from "../doc-context";

const rule = (id: string) => judgmentRules.find((candidate) => candidate.id === id)!;

function item(id: string, text: string, props: Record<string, unknown> = {}, children: string[] = []): DocBlock {
  return { id, type: "list-item", props, text: [{ insert: text }], children };
}

function listDoc(items: DocBlock[]): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-task-lint",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: items.map((entry) => entry.id) },
      ...Object.fromEntries(items.map((entry) => [entry.id, entry])),
    },
  };
}

const checklist = listDoc([
  item("a", "Install Bun.", { checked: false }),
  item("b", "Retire the dev-01 key (due 2026-10-21).", { checked: true }),
  item("c", "Rotate the token.", { checked: false }),
]);
const bullets = listDoc([item("a", "Kernel changes"), item("b", "The kernel owns ops."), item("c", "The server writes files.")]);

describe("judgment rules skip task items", () => {
  test("packed-bullet does not judge task items but still judges plain bullets", () => {
    const packed = rule("judgment.packed-bullet");
    expect(["a", "b", "c"].some((id) => ruleApplies(packed, checklist, id))).toBe(false);
    expect(ruleApplies(packed, bullets, "a")).toBe(true);
  });

  test("flat-hierarchy does not fire on a run of task items", () => {
    const flat = rule("judgment.flat-hierarchy");
    expect(ruleApplies(flat, checklist, "a")).toBe(false);
    expect(ruleApplies(flat, bullets, "a")).toBe(true);
  });
});

describe("lint context outline", () => {
  test("shows the task box on list items", () => {
    const doc = listDoc([item("a", "Ship it.", { checked: false }, ["b"]), item("b", "Tag it.", { checked: true }), item("p", "Plain.")]);
    doc.blocks.root!.children = ["a", "p"];
    expect(outline(doc, ["a", "p"])).toEqual(["- [ ] Ship it.", "  - [x] Tag it.", "- Plain."]);
  });
});
