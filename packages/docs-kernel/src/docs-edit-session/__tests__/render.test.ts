import { describe, expect, test } from "bun:test";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { renderDocsBlockMap } from "../render";

describe("renderDocsBlockMap", () => {
  test("renders a depth-first stable-id map with snippets and title fallback", () => {
    const longText = `${"1234567890".repeat(6)}extra`;
    const doc: DocDocument = {
      schemaVersion: 1,
      id: "render-fixture",
      root: "root",
      blocks: {
        root: {
          id: "root",
          type: "paragraph",
          props: {},
          children: ["section", "image"],
        },
        section: {
          id: "section",
          type: "heading",
          props: { level: 2 },
          text: [{ insert: "Nested\n" }, { insert: "  heading" }],
          children: ["body"],
        },
        body: {
          id: "body",
          type: "paragraph",
          props: {},
          text: [{ insert: longText }],
          children: [],
        },
        image: {
          id: "image",
          type: "image",
          props: { title: "Architecture", src: "/architecture.png" },
          children: [],
        },
      },
    };

    expect(renderDocsBlockMap(doc)).toBe(
      [
        "BLOCK MAP · 4 blocks",
        "root · paragraph",
        '  section · heading · "Nested heading"',
        `    body · paragraph · "${"1234567890".repeat(6)}…"`,
        "  image · image · Architecture",
      ].join("\n"),
    );
  });
});
