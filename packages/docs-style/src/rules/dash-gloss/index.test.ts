import { expect, test } from "bun:test";
import type { DeltaSpan } from "@codecaine-ai/docs-model";
import { detect, paragraph } from "../replacement/fixtures";
import { dashGlossRule } from "./index";

// Block shapes copied from docs-system (docs/30-implementation/10-packages, as committed before
// the wave 1 fixes) and from the canvas docs (docs/30-implementation/*, "Governed by" items).
const ref = (label: string, path = "x"): DeltaSpan => ({ insert: label, attributes: { reference: { kind: "doc", path, label } } });
const code = (insert: string): DeltaSpan => ({ insert, attributes: { code: true } });
const fix = (text: DeltaSpan[]) => dashGlossRule.autofix!(text, paragraph("p", text));
const gloss = (label: DeltaSpan, rest: string): DeltaSpan[] => [label, { insert: rest }];
const applies = (scope: DeltaSpan[], rest: string): DeltaSpan[] => [{ insert: "Applies to: " }, ...scope, { insert: rest }];

test.each<[string, DeltaSpan[], DeltaSpan[]]>([
  [
    "a label that is the subject of the verb after it: the dash goes",
    gloss(ref("Interaction"), " — owns the gesture behavior the editor face wires up."),
    gloss(ref("Interaction"), " owns the gesture behavior the editor face wires up."),
  ],
  [
    "a verb whose object holds a colon, after more than three words",
    gloss(ref("Document model"), " — owns the document model: schema, the reducer contract, validation, and history."),
    gloss(ref("Document model"), " owns the document model: schema, the reducer contract, validation, and history."),
  ],
  [
    "a verb before a semicolon",
    gloss(ref("System design"), " — owns the contracts these packages implement; the package cut only decides where they live."),
    gloss(ref("System design"), " owns the contracts these packages implement; the package cut only decides where they live."),
  ],
  [
    "a noun phrase that defines the label: a colon",
    gloss(ref("The data model"), " — the shapes, invariants, block contract, and serialization the package realizes."),
    gloss(ref("The data model"), ": the shapes, invariants, block contract, and serialization the package realizes."),
  ],
  // compromise reads "hashes" and "index" as verbs. Neither is the verb of a clause here.
  [
    "a noun phrase with a relative clause",
    gloss(ref("Serialization"), " — canonical bytes and the content hashes that make write preconditions possible."),
    gloss(ref("Serialization"), ": canonical bytes and the content hashes that make write preconditions possible."),
  ],
  [
    "a list of noun phrases",
    gloss(ref("docs-index"), " — the Bun/SQLite derived backlinks index, reference identity, and move fixup."),
    gloss(ref("docs-index"), ": the Bun/SQLite derived backlinks index, reference identity, and move fixup."),
  ],
  [
    "a run of labels",
    [code("docs-model"), { insert: " " }, code("v0.0.2"), { insert: " — the format authority." }],
    [code("docs-model"), { insert: " " }, code("v0.0.2"), { insert: ": the format authority." }],
  ],
  [
    "an Applies to rule with a finite verb: a period",
    applies([code("packages/docs-model/src/components/*")], " — every future block component follows the same bundle shape."),
    applies([code("packages/docs-model/src/components/*")], ". Every future block component follows the same bundle shape."),
  ],
  [
    "an Applies to rule after prose: a period",
    applies([code("src/paths.ts")], " and its consumers — future index capabilities land as library subpaths."),
    applies([code("src/paths.ts")], " and its consumers. Future index capabilities land as library subpaths."),
  ],
  [
    'a phrase that opens with "including": a comma keeps it attached',
    applies([ref("ui/"), { insert: ", " }, code("external/")], " — including every future primitive, which is copied in."),
    applies([ref("ui/"), { insert: ", " }, code("external/")], ", including every future primitive, which is copied in."),
  ],
])("fixes %s, and leaves code and reference spans unchanged", (_, before, after) => {
  expect(fix(before)).toEqual(after);
  expect(detect(dashGlossRule, paragraph("p", before)).map((m) => m.autofixable)).toEqual([true]);
});

test.each<[string, DeltaSpan[], string]>([
  ["an Applies to phrase with no verb", applies([code("packages/docs-cli/src/index.ts")], " — every future command and flag."), "has no verb"],
  // "owned" is a participle, and the verb "live" is in a second clause after the semicolon.
  [
    "an Applies to participle phrase before a semicolon",
    applies([code("external/")], " — every future externally owned project; seam rules live on the boundary page."),
    "has no verb",
  ],
  // Deleting the dash would open the item with the label "owns gesture behavior:".
  [
    "a verb that would open the item with a label and a colon",
    gloss(ref("Interaction"), " — owns gesture behavior: the machine, threshold semantics, and selection."),
    "colon",
  ],
  ["a noun phrase that already has a colon", gloss(ref("docs-model"), " — the format authority: schema, operations, and validation."), "colon"],
  [
    "a clause with its own subject",
    gloss(code("additionalProperties: false"), " — wrong shapes and unknown keys are rejected at validation, not discovered at render."),
    "A colon fits only a phrase",
  ],
  // "rules" is a noun here, but it can also be a verb, so neither fix is sure.
  ["a first word that is a noun or a verb", gloss(ref("Doc standards"), " — rules for writing pages."), "A colon fits only a phrase"],
])("keeps the finding but makes no fix for %s", (_, text, reason) => {
  expect(fix(text)).toBeUndefined();
  const [finding] = detect(dashGlossRule, paragraph("p", text));
  expect(finding?.autofixable).toBe(false);
  expect(finding?.message).toContain(reason);
});

test("leaves every other em dash for the rewrite model", () => {
  const shapes: DeltaSpan[][] = [
    [{ insert: "The parser — a small module — reads the file." }],
    [ref("docs-index"), { insert: " and its consumers — the backlinks index." }],
    // The core label-colon rule would flag "`a.ts`, `b.ts`:" as a label, so the fix would add a finding.
    [code("a.ts"), { insert: ", " }, code("b.ts"), { insert: " — the shared helpers." }],
    [{ insert: "Applies to: every package." }],
  ];
  for (const text of shapes) {
    expect(fix(text)).toBeUndefined();
    expect(detect(dashGlossRule, paragraph("p", text))).toEqual([]);
  }
});
