import { expect, test } from "bun:test";
import { lintDocument } from "../../lint";
import { document, paragraph } from "../../lint/fixtures";

const surface = (...returns: string[]) => document(paragraph("intro", "The server answers these routes."), {
  id: "surface", type: "interaction-surface", props: { operations: returns.map((value, index) => ({ name: `op${index}`, returns: value })) }, children: [],
});
const flagged = (...returns: string[]) => lintDocument(surface(...returns), { phase: "complete" }).findings
  .filter((finding) => finding.ruleId === "interaction-surface.returns-prose").map((finding) => [finding.field, finding.evidence]);

test("flags a returns that holds a sentence or a condition, at its own operation", () => {
  expect(flagged("OpsResponse", "{ ok: true, doc, hash } for a doc patch. A canvas patch returns its own fields.", "Replacement block text, plus the patch when diff is passed")).toEqual([
    ["props.operations[1].returns", "{ ok: true, doc, hash } for a doc patch. A canvas patch returns its own fields."],
    ["props.operations[2].returns", "Replacement block text, plus the patch when diff is passed"],
  ]);
});

test("accepts type text: names, unions, generics, object types, predicates and a stream label", () => {
  expect(flagged("BundleResponse", "string | null", "Promise<void>", "{ ok: false; detail: \"not found in the store\" }", "value is string", "keyof typeof registry",
    "() => void", "text/event-stream of DocsChangeEvent JSON", "Props patch { nodes }, revalidated against ComponentTreeState")).toEqual([]);
});

test("is a warning that never blocks a draft or a completed page", () => {
  const report = lintDocument(surface("{ ok } for a doc patch."), { phase: "complete" });
  expect(report.findings.find((finding) => finding.ruleId === "interaction-surface.returns-prose")?.severity).toBe("warning");
  expect(report.blocking).toEqual([]);
});
