"use client";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { validateDocDocument } from "../../doc-schema";
import { schemaIssues } from "../define";
import { stateFor } from "../index";

const REPO_ROOT = join(import.meta.dir, "../../../../..");
const FIXTURE_PATH = "packages/docs-model/src/__fixtures__/sample.doc.json";

function corpusPaths(): string[] {
  return Array.from(
    new Bun.Glob("docs/**/doc.json").scanSync({ cwd: REPO_ROOT }),
  ).sort();
}

describe("component state schemas over the document corpus", () => {
  it("accepts every block in the fixture and all repository docs", async () => {
    const docs = corpusPaths();
    expect(docs, "expected the complete seventy-six-document repository corpus").toHaveLength(76);

    for (const relativePath of [FIXTURE_PATH, ...docs]) {
      const bytes = await readFile(join(REPO_ROOT, relativePath), "utf8");
      const validation = validateDocDocument(JSON.parse(bytes));
      if (!validation.ok) {
        throw new Error(
          `${relativePath} failed document validation: ${JSON.stringify(validation.issues)}`,
        );
      }

      for (const block of Object.values(validation.document.blocks)) {
        const schema = stateFor(block.type).schema;
        const valid = Value.Check(schema, block.props);
        const issues = valid
          ? []
          : schemaIssues(
              Value.Errors(schema, block.props),
              `$.blocks.${block.id}.props`,
            );
        expect(
          valid,
          `${relativePath} block "${block.id}": ${JSON.stringify(issues)}`,
        ).toBe(true);
      }
    }
  });
});
