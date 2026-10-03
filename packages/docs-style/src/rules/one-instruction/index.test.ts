import { expect, test } from "bun:test";
import { fieldsNamed, heading, item, judgedBlocks, page, paragraph } from "../../judge/fixtures";
import { oneInstructionRule } from "./index";

test("asks about blocks that open with a command and about numbered steps", async () => {
  const doc = page(
    heading("h", "Install"),
    // The tagger reads a capitalized "Use" as a proper noun. It is still a command.
    item("use", "Use the CLI and restart the service."),
    item("numbered", "The service restarts. Then reload the page.", { ordered: true }),
    item("describe", "Undo is another apply in the opposite direction."),
    item("label", [{ insert: "Keep the Context", attributes: { bold: true } }]),
    paragraph("para", "Open the `doc.json` file. Save it."),
  );
  expect(await judgedBlocks(oneInstructionRule, doc)).toEqual(["use", "numbered", "para"]);
});

test("gives Jev each sentence of a step, and a numbered step whole", () => {
  const doc = page(
    heading("h", "Install"),
    paragraph("para", "Open the `doc.json` file. Save it."),
    item("numbered", "Click Export. Keep the dialog open.", { ordered: true }),
  );
  const state = oneInstructionRule.judge!.state(doc, "para");
  expect(state).toEqual({ heading: "Install", step: ["Open the `doc.json` file.", "Save it."] });
  expect(oneInstructionRule.judge!.state(doc, "numbered")).toEqual({ heading: "Install", step: ["Click Export. Keep the dialog open."] });
  expect(Object.keys(state)).toEqual(expect.arrayContaining(fieldsNamed(oneInstructionRule.judge!.question)));
});
