import { expect, test } from "bun:test";
import { lintDocument } from "../../lint";
import { document, paragraph } from "../../lint/fixtures";

const SOURCE = ["export function f() {", "  return 1;", "}"].join("\n");
const listing = (props: Record<string, unknown>) =>
  document(paragraph("intro", "Lines 1 to 3 of f.ts."), { id: "code", type: "code", props, text: [{ insert: SOURCE }], children: [] });
const flagged = (props: Record<string, unknown>) =>
  lintDocument(listing(props), { phase: "complete" }).findings
    .filter((finding) => finding.ruleId.startsWith("code."))
    .map((finding) => [finding.ruleId, finding.field, finding.message]);

test("a code block with no language is flagged at props.language", () => {
  expect(flagged({})).toEqual([["code.language", "props.language", "This code block has no language, so the page shows it as plain text with no language label."]]);
  expect(flagged({ language: "  " })).toHaveLength(1);
  expect(flagged({ language: "typescript" })).toEqual([]);
  expect(flagged({ language: "text" })).toEqual([]);
});

test("a note whose range reaches past the listing, covers no line or does not parse is flagged at its lines key", () => {
  const annotations = [
    { lines: "1-3", note: "In range." },
    { lines: "2-5", note: "Past the end." },
    { lines: "0", note: "No line." },
    { lines: "two", note: "Not a range." },
  ];
  expect(flagged({ language: "typescript", annotations })).toEqual([
    ["code.annotation-range", "props.annotations[1].lines", 'The note on lines "2-5" reaches line 5, but the listing has 3 lines, so the reader cannot pair it with its code.'],
    ["code.annotation-range", "props.annotations[2].lines", 'The note on lines "0" covers no line, so the reader cannot pair it with its code.'],
    ["code.annotation-range", "props.annotations[3].lines", 'The note on lines "two" has a part that is not a line number or a range, so the reader cannot pair it with its code.'],
  ]);
});

test("both rules are warnings that never block a completed page", () => {
  const report = lintDocument(listing({ annotations: [{ lines: "9", note: "Past the end." }] }), { phase: "complete" });
  expect(report.findings.filter((finding) => finding.ruleId.startsWith("code.")).map((finding) => finding.severity)).toEqual(["warning", "warning"]);
  expect(report.blocking).toEqual([]);
});
