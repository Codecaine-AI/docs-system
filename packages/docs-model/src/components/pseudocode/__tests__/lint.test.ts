import { describe, expect, it } from "bun:test";
import type { DocBlock, DocDocument } from "../../../doc-schema";
import { lintDocument } from "../../../lint";

function lintPseudocode(text: string, props: Record<string, unknown> = {}) {
  const block: DocBlock = { id: "p", type: "pseudocode", props, text: [{ insert: text }], children: [] };
  const document: DocDocument = {
    schemaVersion: 1,
    id: "doc-p",
    title: "Pseudocode",
    root: "root",
    blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p"] }, p: block },
  } as DocDocument;
  return lintDocument(document, { phase: "complete" }).findings.filter((f) => f.ruleId === "pseudocode.code-syntax");
}

describe("pseudocode.code-syntax", () => {
  it("flags source-language operators and names each line and its plain-word fix", () => {
    const [finding, ...rest] = lintPseudocode([
      "parseTranscript(jsonl)",
      "  input = u.input_tokens ?? 0",
      "  if part.type === \"tool_use\" -> byName[part.name] += 1",
      "  push { insert: match[1] }",
    ].join("\n"));
    expect(rest).toEqual([]);
    expect(finding!.blockId).toBe("p");
    expect(finding!.message).toStartWith("Lines 2, 3 and 4 use source-language syntax");
    expect(finding!.message).toContain("Write ?? as \"or 0 when the value is missing\".");
    expect(finding!.message).toContain("Write ==, ===, != or !== as equals or does not equal.");
    expect(finding!.message).toContain("Write an object literal as");
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
