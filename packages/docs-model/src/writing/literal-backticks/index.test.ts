import { expect, test } from "bun:test";
import { literalBackticksRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { lintDocument } from "../../lint";
import type { DocDocument } from "../../doc-schema";

const withText = (text: DocDocument["blocks"][string]["text"]): DocDocument => {
  const doc = document(paragraph("p", "x"));
  doc.blocks.p!.text = text;
  return doc;
};

test("a backtick pair in a plain span blocks docs_check, and a code-marked span passes", () => {
  const literal = lintDocument(withText([{ insert: "Call `renderBlock` for each child." }]), { phase: "complete" });
  expect(literal.blocking.map((f) => f.ruleId)).toContain(literalBackticksRule.id);
  const marked = lintDocument(withText([{ insert: "Call " }, { insert: "renderBlock", attributes: { code: true } }, { insert: " for each child." }]), { phase: "complete" });
  expect(marked.findings.map((f) => f.ruleId)).not.toContain(literalBackticksRule.id);
});

test("a lone backtick in plain text and backticks inside a code span pass", () => {
  expect(lintDocument(withText([{ insert: "Type one ` to start." }]), { phase: "complete" }).findings.map((f) => f.ruleId)).not.toContain(literalBackticksRule.id);
  expect(lintDocument(withText([{ insert: "Write " }, { insert: "`x`", attributes: { code: true } }]), { phase: "complete" }).findings.map((f) => f.ruleId)).not.toContain(literalBackticksRule.id);
});
