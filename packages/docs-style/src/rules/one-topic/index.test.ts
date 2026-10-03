import { expect, test } from "bun:test";
import { fieldsNamed, heading, item, judgedBlocks, page, paragraph } from "../../judge/fixtures";
import { oneTopicRule } from "./index";

const long = "The cache stores each answer, and the client retries a request once on a rate limit.";

test("asks about blocks of 12 or more words, with the block and its heading", async () => {
  const doc = page(heading("h", "Caching"), paragraph("long", long), paragraph("short", "The cache stores answers."), item("bullet", long));
  expect(await judgedBlocks(oneTopicRule, doc)).toEqual(["long", "bullet"]);

  const state = oneTopicRule.judge!.state(doc, "long");
  expect(state).toEqual({ heading: "Caching", block: long });
  expect(Object.keys(state)).toEqual(expect.arrayContaining(fieldsNamed(oneTopicRule.judge!.question)));
});
