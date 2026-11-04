import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { SequenceDocument } from "@codecaine-ai/sequence/schema";
import * as sequencePackage from "@codecaine-ai/sequence";
import { installedSequenceLinter, renderSequenceSvgFile, sequenceLintFindings, sequenceLinter } from "../component-lints";

const participants = [{ id: "client", name: "client", kind: "actor" }, { id: "service", name: "service", kind: "participant" }];
const message = (n: number) => ({ kind: "message", id: `m${n}`, from: "client", to: "service", line: "sync", text: `request ${n}` });
const flow = (items: number) => ({ version: 1, id: "flow", title: "Flow", style: {}, participants, items: Array.from({ length: items }, (_, n) => message(n)) }) as unknown as SequenceDocument;
const small = flow(1);
// About 2 MB of SVG, so a write that truncates in place leaves a window a reader can see.
const large = flow(2000);
const SIDECAR = "page/assets/sequences/flow.sequence.json";

/** Reads the file in a loop in its own process until the stop file appears, and prints every read that is not a whole SVG. */
const READER = `
const { existsSync, readFileSync } = require("node:fs");
const { SVG_PATH, STOP_PATH } = process.env;
let reads = 0; const partial = [];
while (!existsSync(STOP_PATH)) {
  const svg = readFileSync(SVG_PATH, "utf8"); reads++;
  if (!svg.startsWith("<svg") || !svg.trimEnd().endsWith("</svg>")) partial.push(svg.length);
}
console.log(JSON.stringify({ reads, partial }));
`;

describe("renderSequenceSvgFile", () => {
  test("a reader in another process never sees a partial SVG while renders of different sizes overwrite the file", async () => {
    const docsRoot = `/render-race-${crypto.randomUUID()}`;
    const scratch = await mkdtemp(join(tmpdir(), "docs-render-race-"));
    const stop = join(scratch, "stop");
    const path = await renderSequenceSvgFile(docsRoot, SIDECAR, small);
    const reader = Bun.spawn([process.execPath, "-e", READER], { env: { ...process.env, SVG_PATH: path, STOP_PATH: stop }, stdout: "pipe" });
    try {
      for (let round = 0; round < 40; round++) {
        await renderSequenceSvgFile(docsRoot, SIDECAR, round % 2 ? small : large);
        // Between writes the file is always the whole render this round wrote.
        const svg = await readFile(path, "utf8");
        expect(svg).toStartWith("<svg");
        expect(svg.trimEnd()).toEndWith("</svg>");
      }
      await writeFile(stop, "");
      const seen = JSON.parse(await new Response(reader.stdout).text()) as { reads: number; partial: number[] };
      expect(seen.reads).toBeGreaterThan(0);
      expect(seen.partial).toEqual([]);
    } finally {
      reader.kill();
      await rm(scratch, { recursive: true, force: true });
      await rm(path, { force: true });
    }
  }, 30_000);
});

describe("sequenceLintFindings", () => {
  test("a sequence package without lintSequence gives no linter, and no linter gives no findings", () => {
    const { lintSequence: _, ...olderPackage } = sequencePackage as Record<string, unknown>;
    expect(sequenceLinter(olderPackage)).toBeNull();
    expect(sequenceLintFindings(small, sequenceLinter(olderPackage))).toEqual([]);
    // The installed package's linter is whatever it exports, or null.
    expect(installedSequenceLinter).toBe(sequenceLinter(sequencePackage));
  });

  test("every lint result is a warning, and a linter that throws gives no findings", () => {
    const lint = () => [{ rule: "crossed-columns", severity: "error" as const, message: "crosses 2 other columns", target: "m0" }, { rule: "other", severity: "info" as const, message: "no target" }];
    expect(sequenceLintFindings(small, lint)).toEqual([
      { rule: "crossed-columns", severity: "warning", at: ["m0"], problem: "crosses 2 other columns" },
      { rule: "other", severity: "warning", problem: "no target" },
    ]);
    expect(sequenceLintFindings(small, () => { throw new Error("lint bug"); })).toEqual([]);
  });
});
