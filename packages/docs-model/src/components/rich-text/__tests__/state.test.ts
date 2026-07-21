"use client";

import { describe, expect, it } from "bun:test";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { richTextAgentView } from "../agent-view";
import {
  CalloutState,
  DividerState,
  HeadingState,
  ImageState,
  ListItemState,
  ParagraphState,
  QuoteState,
  VideoState,
} from "../state";

const context = { listDepth: 0, listIndex: 0 };

const fixtureCases: Array<{ id: keyof typeof sampleFixture.blocks; schema: TSchema }> = [
  { id: "h1", schema: HeadingState },
  { id: "h2-structure", schema: HeadingState },
  { id: "p-intro", schema: ParagraphState },
  { id: "root", schema: ParagraphState },
  { id: "divider-1", schema: DividerState },
  { id: "callout-1", schema: CalloutState },
  { id: "image-1", schema: ImageState },
  { id: "video-1", schema: VideoState },
  { id: "li-a", schema: ListItemState },
  { id: "li-a-1", schema: ListItemState },
  { id: "li-b", schema: ListItemState },
  { id: "quote-1", schema: QuoteState },
];

function fixtureBlock(id: keyof typeof sampleFixture.blocks): DocBlock {
  return sampleFixture.blocks[id] as DocBlock;
}

describe("rich-text component state", () => {
  it("accepts every owned fixture block", () => {
    for (const { id, schema } of fixtureCases) {
      expect(Value.Check(schema, sampleFixture.blocks[id].props)).toBe(true);
    }
  });

  it("rejects a stray property for every owned fixture block", () => {
    for (const { id, schema } of fixtureCases) {
      expect(Value.Check(schema, { ...sampleFixture.blocks[id].props, stray: true })).toBe(false);
    }
  });

  it("rejects an out-of-range heading level", () => {
    expect(Value.Check(HeadingState, { level: 7 })).toBe(false);
  });

  it("accepts a heading without a level", () => {
    expect(Value.Check(HeadingState, {})).toBe(true);
  });

  it("rejects an image without src", () => {
    expect(Value.Check(ImageState, { alt: "Missing source" })).toBe(false);
  });

  it("rejects an unknown callout tone", () => {
    expect(Value.Check(CalloutState, { tone: "blue" })).toBe(false);
  });
});

describe("rich-text component agent view", () => {
  it("projects the fixture blocks byte-for-byte", () => {
    expect(richTextAgentView(fixtureBlock("h1"), context)).toBe("# Docs Model Sample");
    expect(richTextAgentView(fixtureBlock("p-intro"), context)).toBe(
      "This paragraph mixes **bold**, *italic*, ~~struck~~, `inline code`, a [link](https://example.com), and a reference to doc-schema.ts.",
    );
    expect(richTextAgentView(fixtureBlock("root"), context)).toBeNull();
    expect(richTextAgentView(fixtureBlock("divider-1"), context)).toBe("---");
    expect(richTextAgentView(fixtureBlock("callout-1"), context)).toBe(
      "> **Decision: Heads up** — Annotations live in annotations.json, never in doc.json.",
    );
    expect(richTextAgentView(fixtureBlock("image-1"), context)).toBe(
      "![Sample image](./assets/images/sample.png)\n*A bundled asset image (D30).*",
    );
    expect(richTextAgentView(fixtureBlock("video-1"), context)).toBe(
      "> **Video: Docs walkthrough** — https://www.youtube.com/watch?v=dQw4w9WgXcQ — An external video (YouTube).",
    );
    expect(richTextAgentView(fixtureBlock("li-a"), context)).toBe("- First item");
    expect(richTextAgentView(fixtureBlock("quote-1"), context)).toBe(
      "> Stable ids are a system invariant.",
    );
  });

  it("defaults a heading without level to level two", () => {
    const block = { ...fixtureBlock("h1"), props: {} };
    expect(richTextAgentView(block, context)).toBe("## Docs Model Sample");
  });

  it("numbers and indents an ordered nested list item", () => {
    const block = { ...fixtureBlock("li-a"), props: { ordered: true } };
    expect(richTextAgentView(block, { listDepth: 1, listIndex: 1 })).toBe("  2. First item");
  });
});
