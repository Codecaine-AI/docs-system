import { describe, expect, it } from "bun:test";
import type { DocBlock, DocDocument } from "../../../doc-schema";
import { lintDocument } from "../../../lint";

function pseudocodeDoc(text: string, props: Record<string, unknown> = {}): DocDocument {
  const block: DocBlock = { id: "p", type: "pseudocode", props, text: [{ insert: text }], children: [] };
  return {
    schemaVersion: 1,
    id: "doc-p",
    title: "Pseudocode",
    root: "root",
    blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p"] }, p: block },
  } as DocDocument;
}

function lintPseudocode(text: string, props: Record<string, unknown> = {}, baseline?: DocDocument) {
  return lintDocument(pseudocodeDoc(text, props), { phase: "complete", baseline }).findings.filter((f) => f.ruleId === "pseudocode.code-syntax");
}

describe("pseudocode.code-syntax", () => {
  it("flags each line that uses source-language syntax, with that line's plain-word fix", () => {
    const findings = lintPseudocode([
      "parseTranscript(jsonl)",
      "  input = u.input_tokens ?? 0",
      "  if part.type === \"tool_use\" -> byName[part.name] += 1",
      "  push { insert: match[1] }",
      "  add 1 to byName[part.name]",
    ].join("\n"));
    expect(findings.map((f) => [f.blockId, f.evidence])).toEqual([
      ["p", "input = u.input_tokens ?? 0"],
      ["p", "if part.type === \"tool_use\" -> byName[part.name] += 1"],
      ["p", "push { insert: match[1] }"],
      ["p", "add 1 to byName[part.name]"],
    ]);
    expect(findings[0]!.message).toBe("Line 2 uses source-language syntax, so a reader must know the source language to follow the step. Write ?? as \"or 0 when the value is missing\".");
    expect(findings[1]!.message).toContain("Write ==, ===, != or !== as equals or does not equal.");
    expect(findings[2]!.message).toContain("Write an object literal as");
    expect(findings[3]!.message).toContain("Write an index such as [0] or [part.name] as");
  });

  it("marks a flagged line that a task adds to a block that already has some as introduced", () => {
    const old = ["a ?? 0", "b ?? 0", "c ?? 0"];
    const baseline = pseudocodeDoc(old.join("\n"));
    const introduced = (lines: string[]) => lintPseudocode(lines.join("\n"), {}, baseline).filter((f) => f.introduced).map((f) => f.evidence);
    expect(introduced([...old, "d ?? 0"])).toEqual(["d ?? 0"]);
    // A line added above the old ones shifts their numbers, and they still match the baseline.
    expect(introduced(["start here", ...old, "d ?? 0"])).toEqual(["d ?? 0"]);
  });

  it("passes plain steps, calls, arrows, fields, strings and comments", () => {
    expect(lintPseudocode([
      "normalizeDocRefPath(path)",
      "  if path starts with \"docs/\" -> remove that prefix // \"a == b\" stays in a string",
      "  for each line in entry.lines -> add 1 to the count for line.kind // x ?? y in a comment",
      "  return path",
    ].join("\n"))).toEqual([]);
  });

  it("reads past the diff marker column of a diff block", () => {
    expect(lintPseudocode(" keep()\n-  old(x)\n+  new(x)", { diff: true })).toEqual([]);
    expect(lintPseudocode(" keep()\n+  count += 1", { diff: true })[0]!.message).toStartWith("Line 2 uses");
  });
});
