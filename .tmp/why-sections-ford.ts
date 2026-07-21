/**
 * Ford's dictated WHY (2026-07-21) for structure + numbering:
 * - STRUCTURE why: on-disk folders next to the code (plain file access, no
 *   weird tooling, version-tracked together); progressive disclosure (read
 *   only what you need — concept doc → file header → docstrings, each level
 *   rules the next in or out); a clear place for everything (humans file/
 *   read by the numbered tree; agents get a clean search structure instead
 *   of hand-waving). Replaces the four unconfirmed bullets.
 * - NUMBERING why: human reading order + obvious insertion first, agent
 *   access second. His misplaced "docs live alongside the repo" sub-bullet
 *   moves to structure's on-disk bullet; his "Insertion is local" and
 *   "Exhaustion is a signal" bullets stay verbatim.
 * Canonical bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });

const SEC = "docs/10-system-design/10-doc-standards";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}

// ---------------------------------------------------------------- structure
{
  const path = `${SEC}/10-structure/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];
  const OLD = [
    "b-struct-why-descent-36",
    "b-struct-why-mapping-37",
    "b-struct-why-skipping-38",
    "b-struct-why-honest-39",
  ];
  const at = root.children.indexOf(OLD[0]);
  if (at < 0) {
    console.error("structure why anchor missing; aborting");
    process.exit(1);
  }

  const blocks: Record<string, unknown> = {
    "b-swhy-disk-1": li(
      "b-swhy-disk-1",
      [b("On disk, next to the code"), t(" — every doc is a folder in the repo, versioned with the source it describes.")],
      ["b-swhy-disk-sub1-2", "b-swhy-disk-sub2-3"],
    ),
    "b-swhy-disk-sub1-2": li("b-swhy-disk-sub1-2", [
      t("An agent reads and edits it with plain file access — no special tooling."),
    ]),
    "b-swhy-disk-sub2-3": li("b-swhy-disk-sub2-3", [
      t("Docs and code change in the same place, so they track together."),
    ]),
    "b-swhy-progressive-4": li(
      "b-swhy-progressive-4",
      [b("Progressive disclosure"), t(" — read only what the task needs.")],
      ["b-swhy-prog-sub1-5", "b-swhy-prog-sub2-6"],
    ),
    "b-swhy-prog-sub1-5": li("b-swhy-prog-sub1-5", [
      t(
        "The concept doc points at a source file; the file's header says whether to keep going; docstrings answer for each function.",
      ),
    ]),
    "b-swhy-prog-sub2-6": li("b-swhy-prog-sub2-6", [
      t("Each level rules the next in or out — no scattered hunting."),
    ]),
    "b-swhy-place-7": li(
      "b-swhy-place-7",
      [b("A clear place for everything"), t(" — the structure answers where a thing lives and where a new thing goes.")],
      ["b-swhy-place-sub1-8", "b-swhy-place-sub2-9"],
    ),
    "b-swhy-place-sub1-8": li("b-swhy-place-sub1-8", [
      t("A human files and finds by walking the numbered tree."),
    ]),
    "b-swhy-place-sub2-9": li("b-swhy-place-sub2-9", [
      t("An agent searches along the same explicit structure instead of guessing."),
    ]),
  };
  Object.assign(doc.blocks, blocks);
  root.children = root.children.flatMap((id: string) =>
    id === OLD[0]
      ? ["b-swhy-disk-1", "b-swhy-progressive-4", "b-swhy-place-7"]
      : OLD.includes(id)
        ? []
        : [id],
  );
  for (const id of OLD) delete doc.blocks[id];
  land(path, doc);
}

// ---------------------------------------------------------------- numbering
{
  const path = `${SEC}/20-numbering/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const root = doc.blocks[doc.root];

  // replace the read-order bullet (and its misplaced repo-alongside sub)
  const OLD_LEAD = "b-num-why-readorder-17";
  const at = root.children.indexOf(OLD_LEAD);
  if (at < 0) {
    console.error("numbering why anchor missing; aborting");
    process.exit(1);
  }
  for (const sub of doc.blocks[OLD_LEAD]?.children ?? []) delete doc.blocks[sub];
  delete doc.blocks[OLD_LEAD];

  const blocks: Record<string, unknown> = {
    "b-nwhy-human-1": li(
      "b-nwhy-human-1",
      [b("Ordered for human reading"), t(" — the numbers are for people first.")],
      ["b-nwhy-human-sub1-2"],
    ),
    "b-nwhy-human-sub1-2": li("b-nwhy-human-sub1-2", [
      t(
        "Prefixes put reading order in the filesystem itself — sidebar, terminal, and render agree without a manifest.",
      ),
    ]),
    "b-nwhy-agent-3": li(
      "b-nwhy-agent-3",
      [b("A clean search path for agents"), t(" — second to human reading, and just as real.")],
      ["b-nwhy-agent-sub1-4"],
    ),
    "b-nwhy-agent-sub1-4": li("b-nwhy-agent-sub1-4", [
      t(
        "The same explicit order tells an agent where to search and where to land a change — structure instead of hand-waving.",
      ),
    ]),
  };
  Object.assign(doc.blocks, blocks);
  // human bullet replaces the old lead; agent bullet goes after Ford's
  // "Insertion is local" bullet, before "Exhaustion is a signal"
  root.children = root.children.map((id: string) => (id === OLD_LEAD ? "b-nwhy-human-1" : id));
  const exhaustAt = root.children.indexOf("b-num-why-exhaust-19");
  if (exhaustAt < 0) {
    console.error("exhaustion bullet missing; aborting");
    process.exit(1);
  }
  root.children.splice(exhaustAt, 0, "b-nwhy-agent-3");
  land(path, doc);
}

console.log("why sections rewritten from Ford's dictation");
