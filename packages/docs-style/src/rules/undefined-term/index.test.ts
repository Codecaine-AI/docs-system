import { expect, test } from "bun:test";
import { fieldsNamed, heading, judgedBlocks, page, paragraph } from "../../judge/fixtures";
import { undefinedTermRule } from "./index";

test("asks about the first use of each term on the page, skipping code, links, and common acronyms", async () => {
  const doc = page(
    // A heading names a term. The prose under it still has to define it.
    heading("h", "SSE Events"),
    paragraph("first", "The server pushes SSE events to the Style Gate."),
    paragraph("again", "Each SSE event names its blocks."),
    paragraph("common", "The UI reads JSON over HTTP."),
    paragraph("code", [{ insert: "Call " }, { insert: "applyOp", attributes: { code: true } }, { insert: " once." }]),
    paragraph("linked", [{ insert: "Read " }, { insert: "Authoring Lints", attributes: { link: "https://example.com" } }, { insert: " first." }]),
  );
  expect(await judgedBlocks(undefinedTermRule, doc)).toEqual(["first"]);

  const state = undefinedTermRule.judge!.state(doc, "first");
  expect(state).toEqual({ heading: "SSE Events", block: "The server pushes SSE events to the Style Gate.", terms: ["SSE", "Style Gate"] });
  expect(Object.keys(state)).toEqual(expect.arrayContaining(fieldsNamed(undefinedTermRule.judge!.question)));
});
