import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { loadDocsRootExcludePolicy } from "@codecaine-ai/docs-index/paths";
import { loadDocsProjectPolicy } from "@codecaine-ai/docs-index/project-policy";
import { checkDocsPath } from "@codecaine-ai/docs-index/safe-path";

import { discoverProjects } from "../discovery";

/**
 * B7-2-04: central discovery and every host's policy loader share one
 * structural validator for codecaine.docs.json. Each malformed config below
 * is refused by both (fail closed), and the chokepoint refuses every path
 * under it; a valid config passes both.
 */

const DOC = JSON.stringify({
  schemaVersion: 1,
  id: "seed",
  title: "seed",
  root: "root",
  blocks: { root: { id: "root", type: "paragraph", props: {}, children: [] } },
});

let kb: string;

beforeEach(async () => {
  kb = join(await realpath(await mkdtemp(join(tmpdir(), "docs-config-parity-"))), "kb");
  await mkdir(join(kb, "notes/seed"), { recursive: true });
  await writeFile(join(kb, "notes/seed/doc.json"), DOC);
});

afterEach(async () => {
  await rm(join(kb, ".."), { recursive: true, force: true });
});

const MALFORMED: Array<[string, string, RegExp]> = [
  ["non-string docsRoot", JSON.stringify({ docsRoot: 42, exclude: ["sessions/*/outputs/inputs/**"] }), /Invalid docsRoot/],
  ["null docsRoot", JSON.stringify({ docsRoot: null, exclude: ["x/**"] }), /Invalid docsRoot/],
  ["empty docsRoot", JSON.stringify({ docsRoot: "", exclude: ["x/**"] }), /Invalid docsRoot/],
  ["docsRoot outside the folder", JSON.stringify({ docsRoot: "../elsewhere" }), /docsRoot must be inside project/],
  ["invalid exclude", JSON.stringify({ docsRoot: ".", exclude: 42 }), /Invalid exclude/],
  ["invalid products", JSON.stringify({ docsRoot: ".", products: "docs" }), /Invalid products/],
  ["a non-object", JSON.stringify(["docs"]), /expected a JSON object/],
  ["unparsable JSON", "{ not json", /Cannot read/],
];

describe("one structural validator for discovery and every host", () => {
  for (const [name, config, message] of MALFORMED) {
    test(`${name}: refused by discovery, the policy loader and the chokepoint`, async () => {
      await writeFile(join(kb, "codecaine.docs.json"), config);
      await expect(discoverProjects(kb)).rejects.toThrow(message);
      expect(() => loadDocsProjectPolicy(kb)).toThrow(message);
      expect(() => loadDocsRootExcludePolicy(kb)).toThrow(message);
      // A served subfolder is governed by the same config.
      expect(() => loadDocsRootExcludePolicy(join(kb, "notes"))).toThrow(message);
      expect(checkDocsPath(kb, "notes/seed/doc.json", "read")).toMatchObject({ ok: false, reason: "policy-invalid" });
    });
  }

  test("positive control: a valid config passes both and the page resolves", async () => {
    await writeFile(join(kb, "codecaine.docs.json"), JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
    const discovery = await discoverProjects(kb);
    expect(discovery.projects.map((project) => project.exclude)).toEqual([["sessions/*/outputs/inputs/**"]]);
    expect(loadDocsRootExcludePolicy(kb).map((scope) => scope.exclude)).toEqual([["sessions/*/outputs/inputs/**"]]);
    expect(checkDocsPath(kb, "notes/seed/doc.json", "read").ok).toBe(true);
  });
});
