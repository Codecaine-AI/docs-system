/**
 * When-to-use pass: gives 80-canvas and 40-file-tree the selection guidance
 * that so far lived only on the process-outline page (the three-way diagram
 * split plus file-tree's files-not-steps rule), as a paragraph after each
 * lead. Regenerates both projection goldens. Canonical serializer bytes.
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

function addAfterLead(
  relative: string,
  leadId: string,
  blockId: string,
  text: DeltaSpan[],
): void {
  const path = join(ROOT, relative, "doc.json");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.blocks[blockId] !== undefined) {
    console.log(`${relative}: ${blockId} already present, skipping insert`);
  } else {
    raw.blocks[blockId] = { id: blockId, type: "paragraph", props: {}, text, children: [] };
    const rootChildren: string[] = raw.blocks[raw.root].children;
    const leadIndex = rootChildren.indexOf(leadId);
    if (leadIndex === -1) throw new Error(`${relative}: lead ${leadId} not found`);
    rootChildren.splice(leadIndex + 1, 0, blockId);
  }
  const result = validateDocDocument(raw);
  if (!result.ok) throw new Error(`${relative} invalid: ${JSON.stringify(result.issues)}`);
  writeFileSync(path, serializeDocDocument(result.document));
  const goldenName = relative.replace(/^docs\//, "docs__").replaceAll("/", "__") + ".md";
  writeFileSync(
    join(ROOT, "packages/docs-model/src/__tests__/goldens/projection", goldenName),
    projectToMarkdown(result.document),
  );
  console.log(`wrote ${relative}/doc.json + golden`);
}

addAfterLead(
  "docs/10-system-design/40-block-vocabulary/80-canvas",
  "b-24-canvas-lead-2",
  "b-24-canvas-when-to-use",
  [
    t(
      "Reach for canvas when the question is how things relate — spatial boards, architecture maps, annotated relationships. Exact exchanges belong to the sequence block, and an end-to-end process flow belongs to process-outline.",
    ),
  ],
);

addAfterLead(
  "docs/10-system-design/40-block-vocabulary/40-file-tree",
  "b-21-file-tree-lead-2",
  "b-21-file-tree-when-to-use",
  [
    t(
      "Reach for it when the nested structure is files, not steps — repo slices, refactor plans, layout conventions. A process that flows end to end belongs to process-outline.",
    ),
  ],
);

console.log("done");
