import { expect, test } from "bun:test";
import { imageAltRule } from "./index";
import { document, paragraph } from "../../lint/fixtures";
import { orderedBlocks } from "../../lint/engine";
import type { DocDocument } from "../../doc-schema";
const check = (doc: DocDocument) =>
  imageAltRule.check({ document: doc, blocks: orderedBlocks(doc) });
test("image-alt detects its condition and accepts the corrected form", () => {
  expect(
    check(
      document({
        id: "i",
        type: "image",
        props: { src: "i.png" },
        children: [],
      }),
    ),
  ).toHaveLength(1);
  expect(
    check(
      document({
        id: "i",
        type: "image",
        props: { src: "i.png", alt: "An image." },
        children: [],
      }),
    ),
  ).toEqual([]);
});
