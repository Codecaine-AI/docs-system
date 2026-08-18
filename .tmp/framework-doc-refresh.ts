/**
 * 70-framework refresh + writing-style goldens: rewrites the operational-copy
 * decision in docs/20-implementation/10-packages/70-framework (the corpus is
 * the sole standards home; agent contexts render from it — no copy tier),
 * then regenerates its projection golden and writes projection goldens for
 * the nine new 99-appendix writing-style bundles. Canonical serializer bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const ROOT = join(import.meta.dir, "..");
const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

// ---------------------------------------------------------------------------
// 1. Rewrite the stale blocks in 70-framework
// ---------------------------------------------------------------------------
const FW = join(ROOT, "docs/20-implementation/10-packages/70-framework/doc.json");
const fwRaw = JSON.parse(readFileSync(FW, "utf8"));

const replacements: Record<string, DeltaSpan[]> = {
  "b-fw-role": [
    t("The agent-loadable operational manual — cookbooks and interview scripts behind a "),
    c("SKILL.md"),
    t(" entry point — distributed as a workspace package with no runtime source. Source: "),
    {
      insert: "packages/framework",
      attributes: { code: true, reference: { kind: "source", path: "packages/framework" } },
    },
    t("."),
  ],
  "b-fw-gov-standards": [
    {
      insert: "Doc standards",
      attributes: {
        reference: {
          kind: "doc",
          path: "10-system-design/10-doc-standards",
          label: "Doc standards",
        },
      },
    },
    t(" — the canonical rules; agent contexts render them from the corpus rather than from copies here."),
  ],
  "b-fw-authority-h": [t("Corpus authority; no operational copies")],
  "b-fw-authority-d": [
    t(
      "Decision: The docs corpus is the sole home of every structural rule. This package carries no standard copies; standing agent knowledge renders from the corpus doc.json bundles through the agent markdown projection at context-assembly time.",
    ),
  ],
  "b-fw-authority-w": [
    t(
      "Why: Framework must not become a second decision-memory home. A copy tier requires hand synchronization and drifts toward teaching retired conventions; rendering from the corpus leaves one canonical text and nothing to synchronize.",
    ),
  ],
  "b-fw-authority-a": [
    t("Applies to: "),
    c("packages/framework"),
    t(" — standing agent knowledge loads from the corpus, never from standards files here."),
  ],
  "b-fw-addr-a": [
    t("Applies to: "),
    c("packages/framework"),
    t(" — every future cookbook and workflow key."),
  ],
};

for (const [blockId, text] of Object.entries(replacements)) {
  const blockRecord = fwRaw.blocks[blockId];
  if (blockRecord === undefined) throw new Error(`missing block ${blockId}`);
  blockRecord.text = text;
}

const fwValidated = validateDocDocument(fwRaw);
if (!fwValidated.ok) {
  console.error(JSON.stringify(fwValidated.issues, null, 2));
  process.exit(1);
}
writeFileSync(FW, serializeDocDocument(fwValidated.document));
console.log("rewrote 70-framework/doc.json");

// ---------------------------------------------------------------------------
// 2. Regenerate / generate projection goldens
// ---------------------------------------------------------------------------
const GOLDEN_PATHS = [
  "docs/20-implementation/10-packages/70-framework/doc.json",
  "docs/99-appendix/doc.json",
  "docs/99-appendix/10-writing-style/doc.json",
  "docs/99-appendix/10-writing-style/10-register/doc.json",
  "docs/99-appendix/10-writing-style/20-structure/doc.json",
  "docs/99-appendix/10-writing-style/30-design-narrative/doc.json",
  "docs/99-appendix/10-writing-style/40-titles-and-openings/doc.json",
  "docs/99-appendix/10-writing-style/50-block-conventions/doc.json",
  "docs/99-appendix/10-writing-style/60-anti-patterns/doc.json",
  "docs/99-appendix/10-writing-style/70-why-these-hold/doc.json",
];

for (const relative of GOLDEN_PATHS) {
  const result = validateDocDocument(
    JSON.parse(readFileSync(join(ROOT, relative), "utf8")),
  );
  if (!result.ok) throw new Error(`${relative} invalid`);
  const goldenName = relative.replace(/\/doc\.json$/, "").replaceAll("/", "__") + ".md";
  const goldenPath = join(
    ROOT,
    "packages/docs-model/src/__tests__/goldens/projection",
    goldenName,
  );
  writeFileSync(goldenPath, projectToMarkdown(result.document));
  console.log(`golden ${goldenName}`);
}
console.log("done");
