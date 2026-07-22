"use client";

import { describe, expect, it } from "bun:test";
import {
  nodesToSteps,
  parseWaterfall,
  serializeWaterfall,
  stepNodes,
} from "../lib";
import type { WaterfallStep } from "../lib";

describe("parseWaterfall", () => {
  it("ranks irregular indentation widths and builds nested steps", () => {
    expect(parseWaterfall(
      "Run mode\n  -> Get candidates\n       -> Exclude locked work\n  -> Drain workers\n       -> Spawn workers",
    )).toEqual([
      {
        text: "Run mode",
        note: false,
        depth: 0,
        children: [
          {
            text: "Get candidates",
            note: false,
            depth: 1,
            children: [
              { text: "Exclude locked work", note: false, depth: 2, children: [] },
            ],
          },
          {
            text: "Drain workers",
            note: false,
            depth: 1,
            children: [
              { text: "Spawn workers", note: false, depth: 2, children: [] },
            ],
          },
        ],
      },
    ]);
  });

  it("marks clarification notes without keeping the marker", () => {
    const [root] = parseWaterfall("Run\n  -> Drain\n       > workers produce tentative evidence");
    expect(root.children[0].children[0]).toEqual({
      text: "workers produce tentative evidence",
      note: true,
      depth: 2,
      children: [],
    });
  });

  it("supports multiple roots", () => {
    expect(parseWaterfall("First\n  -> Child\nSecond\n  -> Other").map((node) => node.text)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("skips blank lines", () => {
    const forest = parseWaterfall("\nRun\n   \n  -> Drain\n\t\n");
    expect(forest).toHaveLength(1);
    expect(forest[0].children).toHaveLength(1);
  });

  it("preserves backticks in node text", () => {
    const [root] = parseWaterfall("Run `safe` mode\n  -> Read `epoch-size`");
    expect(root.text).toBe("Run `safe` mode");
    expect(root.children[0].text).toBe("Read `epoch-size`");
  });

  it("ranks indent widths in order seen, so the first line is depth 0 even when indented", () => {
    const forest = parseWaterfall("  Indented first\nRoot later");
    expect(forest.map((node) => ({ text: node.text, depth: node.depth }))).toEqual([
      { text: "Indented first", depth: 0 },
      { text: "Root later", depth: 0 },
    ]);
  });

  it("keeps an assigned depth when a smaller nonzero indent appears later", () => {
    const [root] = parseWaterfall("Root\n       -> Deeper first\n  -> Shallower later");
    expect(root.children.map((node) => ({ text: node.text, depth: node.depth }))).toEqual([
      { text: "Deeper first", depth: 1 },
      { text: "Shallower later", depth: 1 },
    ]);
  });

  it("re-ranks later lines once a new smaller indent width is known", () => {
    const [root] = parseWaterfall("Root\n       -> A\n  -> B\n       -> C");
    const a = root.children[0];
    const b = root.children[1];
    expect(a).toEqual({ text: "A", note: false, depth: 1, children: [] });
    expect(b.text).toBe("B");
    expect(b.depth).toBe(1);
    expect(b.children).toEqual([{ text: "C", note: false, depth: 2, children: [] }]);
  });
});

describe("serializeWaterfall", () => {
  it("emits bare roots, arrowed children at 5 spaces per level, and > notes", () => {
    const steps: WaterfallStep[] = [
      {
        text: "Run mode",
        steps: [
          { text: "Get candidates", steps: [{ text: "Exclude locked work" }] },
          { text: "workers produce tentative evidence", kind: "note" },
        ],
      },
      { text: "Second root" },
    ];
    expect(serializeWaterfall(steps)).toBe(
      [
        "Run mode",
        "     -> Get candidates",
        "          -> Exclude locked work",
        "     > workers produce tentative evidence",
        "Second root",
      ].join("\n"),
    );
  });

  it("serializes WaterfallNode input identically to its WaterfallStep twin", () => {
    const notation = "Run\n  -> Drain `epoch`\n       > why";
    const nodes = parseWaterfall(notation);
    expect(serializeWaterfall(nodes)).toBe(serializeWaterfall(nodesToSteps(nodes)));
  });

  it("serializes a root-level note with the bare > marker", () => {
    expect(serializeWaterfall([{ text: "just context", kind: "note" }])).toBe("> just context");
  });

  it("serializes an empty forest to empty text", () => {
    expect(serializeWaterfall([])).toBe("");
  });
});

describe("serialize/parse round-trip", () => {
  // Deterministic PRNG so the property run is reproducible.
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WORDS = ["run", "drain", "spawn", "`epoch`", "map", "verify", "queue", "lock"];

  function randomSteps(rand: () => number, depth: number): WaterfallStep[] {
    const count = 1 + Math.floor(rand() * 3);
    return Array.from({ length: count }, () => {
      const text = Array.from(
        { length: 1 + Math.floor(rand() * 3) },
        () => WORDS[Math.floor(rand() * WORDS.length)],
      ).join(" ");
      const note = depth > 0 && rand() < 0.2;
      const step: WaterfallStep = { text };
      if (note) step.kind = "note";
      else if (depth < 3 && rand() < 0.6) step.steps = randomSteps(rand, depth + 1);
      return step;
    });
  }

  it("parse(serialize(x)) reproduces the structure for generated trees", () => {
    const rand = mulberry32(2026);
    for (let run = 0; run < 40; run += 1) {
      const steps = randomSteps(rand, 0);
      expect(parseWaterfall(serializeWaterfall(steps))).toEqual(stepNodes(steps));
    }
  });

  it("round-trips parse output through nodesToSteps and back", () => {
    const notation = "Run mode\n  -> Get candidates\n       -> Exclude locked work\n       > why\n  -> Drain";
    const nodes = parseWaterfall(notation);
    expect(parseWaterfall(serializeWaterfall(nodesToSteps(nodes)))).toEqual(nodes);
  });
});
