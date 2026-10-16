"use client";

import { describe, expect, it } from "bun:test";
import { applyOp, applyOps } from "../../../doc-ops";
import type { DocDocument } from "../../../doc-schema";

function taskDoc(itemProps: Record<string, unknown> = {}): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-tasks",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["item", "para"] },
      item: {
        id: "item",
        type: "list-item",
        props: itemProps,
        text: [{ insert: "Install Bun." }],
        children: [],
      },
      para: { id: "para", type: "paragraph", props: {}, text: [{ insert: "Body." }], children: [] },
    },
  };
}

function setChecked(blockId: string, params: Record<string, unknown>) {
  return { type: "componentAction" as const, blockId, action: "list-item.setChecked", params };
}

describe("list-item.setChecked", () => {
  it("turns an ordinary bullet into a done task, keeping id, text, and ordered", () => {
    const doc = taskDoc({ ordered: true });
    const result = applyOp(doc, setChecked("item", { checked: true }));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const item = result.doc.blocks.item!;
    expect(item.id).toBe("item");
    expect(item.props).toEqual({ ordered: true, checked: true });
    expect(item.text).toEqual([{ insert: "Install Bun." }]);
    expect(result.doc.root).toBe(doc.root);
    expect(result.doc.blocks.root!.children).toEqual(["item", "para"]);
  });

  it("reopens a done task", () => {
    const result = applyOp(taskDoc({ checked: true }), setChecked("item", { checked: false }));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.doc.blocks.item!.props).toEqual({ checked: false });
  });

  it("returns an inverse that restores the plain bullet (no checked key)", () => {
    const doc = taskDoc();
    const result = applyOp(doc, setChecked("item", { checked: true }));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const undone = applyOps(result.doc, result.inverse);
    if (!undone.ok) throw new Error(JSON.stringify(undone.issues));
    expect(undone.doc.blocks.item!.props).toEqual({});
    expect("checked" in undone.doc.blocks.item!.props).toBe(false);
  });

  it("rejects a block that is not a list-item", () => {
    const result = applyOp(taskDoc(), setChecked("para", { checked: true }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toContain("$.op.blockId");
  });

  it("rejects a missing or non-boolean checked param", () => {
    for (const params of [{}, { checked: "yes" }, { checked: 1 }, { checked: null }]) {
      const result = applyOp(taskDoc(), setChecked("item", params));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issues.map((issue) => issue.path)).toContain("$.params.checked");
    }
  });
});
