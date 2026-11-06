import { expect, test } from "bun:test";
import { compareFolder, compareSection } from "./assets";
import type { CompareManifest } from "./compare";

const manifest: CompareManifest = {
  lane: "state-shape", set: "climb", before: "round-1", after: "round 2",
  pages: [{ page: "01-doc", image: "01-doc.png", regions: 2 }, { page: "03-api", image: "03-api.png", regions: 1 }], full: "full-01-doc.png",
};

test("a compare run publishes under its lane and both round labels, with no unsafe path characters", () => {
  expect(compareFolder(manifest)).toBe("lanes/state-shape/round-2-vs-round-1");
});

test("the PR section embeds every page pair and the full-page pair from the folder URL", () => {
  const section = compareSection(manifest, "https://raw.example/branch/lanes/x");
  const images = [...section.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
  expect(images).toEqual(["https://raw.example/branch/lanes/x/01-doc.png", "https://raw.example/branch/lanes/x/03-api.png", "https://raw.example/branch/lanes/x/full-01-doc.png"]);
  expect(section).toContain("**01-doc** (2 block regions)");
  expect(section).toContain("<details><summary>Full page, before and after</summary>");
});
