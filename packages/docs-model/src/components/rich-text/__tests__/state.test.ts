"use client";

import { describe, expect, it } from "bun:test";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import sampleFixture from "../../../__fixtures__/sample.doc.json";
import type { DocBlock } from "../../../doc-schema";
import { richTextAgentView } from "../agent-view";
import {
  AppEmbedState,
  CalloutState,
  DividerState,
  HeadingState,
  ImageState,
  ListItemState,
  ParagraphState,
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
  { id: "p-invariant", schema: ParagraphState },
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

  it("accepts an app embed reference and rejects bad heights, a missing app, and stray props", () => {
    expect(Value.Check(AppEmbedState, { app: "kb-viewer" })).toBe(true);
    expect(Value.Check(AppEmbedState, {
      codebase: "ent_codebase", app: "kb-viewer", view: "graph", params: "q=1",
      title: "Graph", height: 240, poster: "./assets/images/graph.png",
    })).toBe(true);
    expect(Value.Check(AppEmbedState, { app: "kb-viewer", height: 2000 })).toBe(true);
    for (const invalid of [
      {},
      { app: "kb-viewer", height: 239 },
      { app: "kb-viewer", height: 2001 },
      { app: "kb-viewer", height: 480.5 },
      { app: "kb-viewer", src: "http://127.0.0.1:5173" },
      { app: 7 },
    ]) {
      expect(Value.Check(AppEmbedState, invalid)).toBe(false);
    }
  });

  it("accepts the four callout variants and rejects any other", () => {
    for (const variant of ["eyebrow", "hairline", "rail", "tab"]) {
      expect(Value.Check(CalloutState, { tone: "info", variant })).toBe(true);
    }
    expect(Value.Check(CalloutState, { variant: "card" })).toBe(false);
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
    expect(richTextAgentView(fixtureBlock("p-invariant"), context)).toBe(
      "Stable ids are a system invariant.",
    );
  });

  it("projects an app embed as its reference", () => {
    const block = (props: Record<string, unknown>): DocBlock => ({ id: "app", type: "app-embed", props, children: [] });
    expect(richTextAgentView(block({ app: "kb-viewer", view: "graph", params: "q=1", title: "Graph" }), context)).toBe(
      "> **App: Graph** — kb-viewer/graph?q=1",
    );
    expect(richTextAgentView(block({ codebase: "ent_x", app: "kb-viewer" }), context)).toBe("> **App** — ent_x/kb-viewer");
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
