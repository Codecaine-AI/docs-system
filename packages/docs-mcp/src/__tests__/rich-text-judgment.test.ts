import { expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { judgmentRules, ruleTargets } from "../lint-feedback";

const rule = (id: string) => judgmentRules.find((candidate) => candidate.id === id)!;
const block = (id: string, type: DocBlock["type"], text: string, props: Record<string, unknown> = {}, children: string[] = []): DocBlock =>
  ({ id, type, props, text: [{ insert: text }], children });

function page(...blocks: DocBlock[]): DocDocument {
  const nested = new Set(blocks.flatMap((b) => b.children));
  return {
    schemaVersion: 1,
    id: "doc-rich-text-judgment",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: blocks.filter((b) => !nested.has(b.id)).map((b) => b.id) },
      ...Object.fromEntries(blocks.map((b) => [b.id, b])),
    },
  };
}

test("callout-message judges each callout with its label, title and nested body text", () => {
  const callouts = rule("judgment.callout-message");
  const doc = page(
    block("lead", "paragraph", "The service checks each write."),
    block("warn", "callout", "The service refuses content writes until the task reads the style guide.", { tone: "warning", title: "Style read first" }, ["more"]),
    block("more", "paragraph", "Read tools work without a task."),
  );
  expect(ruleTargets(callouts, doc, ["lead", "warn"])).toEqual(["warn"]);
  expect(callouts.state!(doc, "warn")).toEqual({
    heading: "",
    label: "warning",
    title: "Style read first",
    body: "The service refuses content writes until the task reads the style guide.\nRead tools work without a task.",
  });
});

