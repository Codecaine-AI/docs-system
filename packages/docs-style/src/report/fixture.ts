/**
 * A realistic, fabricated SweepResult for the report tests and the preview. It holds 3 pages, 2
 * of them deep, and every case the report must draw: autofixes, accepted rewrites (one after a
 * strong retry), a structural list rewrite, guardrail rejections, an error, Tier 2 findings with
 * probabilities, and a page that ran Tier 1 only. The sentences come from real docs-system pages.
 *
 * Each call returns a fresh object, so a test can change it freely. Words after and findings
 * after are derived from the accepted changes, so the numbers stay consistent.
 */
import { inlineToDelta, type DocBlock, type DocBlockType, type DocDocument, type DocOp } from "@codecaine-ai/docs-model";
import type { BlockChange, GuardrailId, GuardrailResult, PageResult, RuleLayer, StyleFinding, SweepResult } from "../types";
import { CHECKS } from "./cards";
import { countWords } from "./diff";
import type { ReviewOverlay } from "./review";

const RULES: Record<string, { layer: RuleLayer; hint: string }> = {
  "ste.sentence-length": { layer: "structure", hint: "Split the sentence so that each part has 25 words or fewer. Keep every fact." },
  "ste.paragraph-length": { layer: "structure", hint: "Split the paragraph, or write a lead sentence and one bullet for each point." },
  "ste.passive-voice": { layer: "structure", hint: "Write the sentence in the active voice, and name the actor." },
  "ste.one-topic": { layer: "structure", hint: "Give each topic its own sentence." },
  "ste.condition-first": { layer: "structure", hint: "Put the condition before the instruction that it guards." },
  "ste.undefined-term": { layer: "vocabulary", hint: "Define the term, or link to its page, where the page first uses it." },
  "writing.semicolon": { layer: "structure", hint: "Split at the semicolon. In a structural rewrite, put each clause on its own bullet." },
  "writing.no-em-dash": { layer: "structure", hint: "Use a period or a comma instead of the em dash." },
  "ste.replacement": { layer: "vocabulary", hint: "Use the simpler word from the replacement table." },
  "ste.filler": { layer: "vocabulary", hint: "Delete the filler word." },
  "ste.modal-verbs": { layer: "vocabulary", hint: "Write `must` or `can` instead of `should`, `may`, or `might`." },
  "ste.noun-cluster": { layer: "vocabulary", hint: "Break the noun cluster with a preposition, such as `of` or `for`." },
};

function finding(ruleId: string, blockId: string, evidence: string, message: string, extra: Partial<StyleFinding> = {}): StyleFinding {
  const rule = RULES[ruleId]!;
  return {
    ruleId,
    source: ruleId.startsWith("ste.") ? "ste" : "core",
    layer: rule.layer,
    tier: 1,
    blockId,
    field: "text",
    message,
    evidence,
    hint: rule.hint,
    ...extra,
  };
}


const PASS_DETAIL: Record<GuardrailId, string> = {
  tokens: "no protected tokens in this block",
  "fact-ledger": "every ledger item found",
  "content-coverage": "every content word survives",
  "meaning-words": "every meaning word keeps its count",
  "shrink-limit": "within the 20% shrink limit",
  "smallest-edit": "every unflagged sentence unchanged",
  "fixes-target": "a target finding is gone",
  "no-new-findings": "no Tier 1 rule fires more often",
  slop: "no slop words or em dashes added",
  "list-integrity": "no list changed length or joined with \", and\"",
  "sentence-shape": "every sentence starts cleanly",
  "split-integrity": "every split keeps its lead-in, citation, scope, subject, and identifiers",
  "fact-check": "Jev: no fact dropped, no claim added",
  "meaning-equivalence": "Sol: same meaning in both directions",
};

/** All fourteen checks in pipeline order. Named details override the pass text; `failed` and `skipped` mark the rest. */
function checks(details: Partial<Record<GuardrailId, string>>, failed: GuardrailId[] = [], skipped: GuardrailId[] = []): GuardrailResult[] {
  return CHECKS.map(({ id }) => ({
    id,
    ok: !failed.includes(id),
    detail: details[id] ?? PASS_DETAIL[id],
    ...(skipped.includes(id) ? { skipped: true } : {}),
  }));
}

const spans = (markdown: string) => inlineToDelta(markdown).spans;

/** The ops a full pass would stage: update the block, and insert one child per bullet line. */
function opsFor(blockId: string, after: string): DocOp[] {
  const [lead = "", ...bullets] = after.split("\n");
  return [
    { type: "updateBlock", blockId, text: spans(lead) },
    ...bullets.map(
      (line, index): DocOp => ({
        type: "insertBlock",
        blockId: `${blockId}-b${index + 1}`,
        parentId: blockId,
        index,
        blockType: "list-item",
        props: {},
        text: spans(line.replace(/^- /, "")),
      }),
    ),
  ];
}

function autofix(blockId: string, blockType: string, ruleId: string, before: string, after: string): BlockChange {
  return { blockId, blockType, kind: "autofix", before, after, ruleIds: [ruleId], status: "accepted", ops: opsFor(blockId, after) };
}

type Attempt = NonNullable<BlockChange["attempts"]>[number];
const fast = (ms: number, after: string, failed: GuardrailId[] = []): Attempt => ({
  strength: "fast",
  model: "gpt-6-luna",
  ms,
  accepted: failed.length === 0,
  after,
  failed,
});
const strong = (ms: number, after: string, failed: GuardrailId[] = []): Attempt => ({
  strength: "strong",
  model: "gpt-6.1-sol",
  ms,
  accepted: failed.length === 0,
  after,
  failed,
});

function rewrite(
  blockId: string,
  blockType: string,
  ruleIds: string[],
  before: string,
  attempts: Attempt[],
  verdict: GuardrailResult[],
  reason?: string,
): BlockChange {
  const last = attempts[attempts.length - 1]!;
  const accepted = last.accepted;
  return {
    blockId,
    blockType,
    kind: "rewrite",
    before,
    after: last.after,
    ruleIds,
    status: accepted ? "accepted" : "rejected",
    verdict: { accepted, checks: verdict },
    attempts,
    ...(reason ? { reason } : {}),
    ops: accepted ? opsFor(blockId, last.after) : [],
  };
}

interface BlockSpec {
  id: string;
  type: DocBlockType;
  text: string;
}

/** Applies each accepted change to the page's blocks. A bullet line becomes a child list item. */
function afterDoc(id: string, title: string, blocks: BlockSpec[], changes: BlockChange[]): DocDocument {
  const docBlocks: Record<string, DocBlock> = {};
  for (const block of blocks) {
    const change = changes.find((c) => c.blockId === block.id && c.status === "accepted" && c.kind === "rewrite")
      ?? changes.find((c) => c.blockId === block.id && c.status === "accepted");
    const [lead = "", ...bullets] = (change?.after ?? block.text).split("\n");
    const children = bullets.map((line, i) => {
      const childId = `${block.id}-b${i + 1}`;
      docBlocks[childId] = { id: childId, type: "list-item", props: {}, text: spans(line.replace(/^- /, "")), children: [] };
      return childId;
    });
    docBlocks[block.id] = { id: block.id, type: block.type, props: {}, text: spans(lead), children };
  }
  docBlocks.root = { id: "root", type: "paragraph", props: {}, children: blocks.map((b) => b.id) };
  return { schemaVersion: 1, id, title, root: "root", blocks: docBlocks };
}

/** Completes a page: findings after drop each Tier 1 finding an accepted change targets, and words after add each change's delta. */
function page(
  path: string,
  title: string,
  stats: PageResult["stats"],
  deep: boolean,
  findings: StyleFinding[],
  changes: BlockChange[],
  blocks: BlockSpec[],
): PageResult {
  const accepted = changes.filter((c) => c.status === "accepted");
  const fixed = (f: StyleFinding) => accepted.some((c) => c.blockId === f.blockId && c.ruleIds.includes(f.ruleId));
  const wordsAfter = accepted.reduce((words, c) => words + countWords(c.after) - countWords(c.before), stats.words);
  return {
    path,
    baseHash: `fixture:${path}`,
    title,
    stats,
    findings,
    deep,
    changes,
    findingsAfter: findings.filter((f) => f.tier === 1 && !fixed(f)),
    wordsAfter,
    after: afterDoc(`doc-${path.replace(/[^a-z0-9]+/g, "-")}`, title, blocks, changes),
  };
}

// ---------------------------------------------------------------------------------------------
// Page 1: Central Docs Service (deep)
// ---------------------------------------------------------------------------------------------

function centralDocsService(): PageResult {
  const p10 =
    "Keep one active runtime for browser and MCP writes; a replacement waits for requests, authoring tasks, and active editor leases to finish, and the supervisor activates it only after the readiness check passes.";
  const p10After =
    "Keep one active runtime for browser and MCP writes.\n- A replacement waits for requests, authoring tasks, and active editor leases to finish.\n- The supervisor activates it only after the readiness check passes.";
  const p15 =
    "A failed runtime build leaves the active API available. A crashed runtime is restarted using the prior successful artifact when available, and source updates do not guarantee preservation of unsaved browser state across a full page reload.";
  const p15Fast =
    "A failed runtime build leaves the active API available. The supervisor restarts a crashed runtime from the prior successful artifact when one is available. A full page reload can lose unsaved browser state.";
  const p15After =
    "A failed runtime build leaves the active API available. The supervisor restarts a crashed runtime from the prior successful artifact when one is available. Source updates do not preserve unsaved browser state across a full page reload.";
  const p5 =
    "The home page starts device discovery on its first visit and provides **Register docs on this device** for later scans. It searches the current user's home, shared user storage, mounted drives, and registered workspaces. Hidden folders, system storage, dependencies, backups, archives, and container storage are excluded. Each candidate uses the existing normalized-corpus discovery rules, including declared project members and custom docs roots. Canonical paths prevent symlink duplicates.";
  const p5Fast =
    "The home page starts device discovery on its first visit and offers a seamless way to register docs later.\n- It searches home folders, drives, and workspaces.\n- It skips hidden and system folders.\n- Canonical paths prevent symlink duplicates.";
  const p5Strong =
    "The home page starts device discovery on its first visit.\n- Discovery searches the user's home, shared storage, mounted drives, and registered workspaces.\n- It skips hidden folders, system storage, and dependencies.\n- Each candidate follows the normalized-corpus discovery rules.\n- Canonical paths prevent symlink duplicates.";
  const p14 =
    "Saved document changes publish change events without a source build, while frontend source changes use Vite HMR and runtime source changes trigger a debounced build and health-checked replacement.";
  const p14Fast =
    "Saved document changes publish change events without a source build. Frontend source changes reload seamlessly through Vite HMR, and runtime source changes trigger a debounced build and health-checked replacement.";
  const p16 =
    "Supervisor or package configuration changes restart the service in order to load the new `package.json` after active authoring work finishes.";
  const p16After =
    "Supervisor or package configuration changes restart the service to load the new `package.json` after active authoring work finishes.";
  const p3 =
    "Documents remain in their project's native Docs corpus. Registration changes how a project is reached, without copying its documents into a central data directory. Only normalized corpora are registered.";
  const p8 =
    "Bind the service to loopback. Browser requests must come from the same origin, and MCP requests must carry the local service access token.";
  const p9 = "Route every document request via its project ID. Browser preferences and session IDs are scoped to the project.";
  const p12 = "Restart the supervisor after you change the package configuration.";

  const changes: BlockChange[] = [
    autofix("central-16", "paragraph", "ste.replacement", p16, p16After),
    rewrite(
      "central-10",
      "list-item",
      ["writing.semicolon", "ste.sentence-length"],
      p10,
      [fast(2140, p10After)],
      checks(
        {
          "fact-ledger": "3 of 3 items found: MCP, readiness check, editor leases",
          "meaning-words": "only 1 → 1",
          "shrink-limit": "−1 word (−3%, limit −20%)",
          "smallest-edit": "skipped: one sentence, and it is flagged",
          "fixes-target": "fixed writing.semicolon and ste.sentence-length",
          "fact-check": "Jev P(drop or add) = 0.04",
        },
        [],
        ["smallest-edit"],
      ),
    ),
    rewrite(
      "central-15",
      "paragraph",
      ["ste.passive-voice", "ste.sentence-length"],
      p15,
      [fast(1910, p15Fast, ["meaning-words"]), strong(4420, p15After)],
      checks({
        "fact-ledger": "1 of 1 item found: API",
        "meaning-words": "not 1 → 1",
        "shrink-limit": "±0 words",
        "smallest-edit": "1 unflagged sentence unchanged",
        "fixes-target": "fixed ste.passive-voice and ste.sentence-length",
        "fact-check": "Jev P(drop or add) = 0.21",
      }),
    ),
    rewrite(
      "central-5",
      "paragraph",
      ["ste.paragraph-length", "ste.passive-voice"],
      p5,
      [
        fast(2380, p5Fast, ["fact-ledger", "shrink-limit", "slop", "fact-check"]),
        strong(5120, p5Strong, ["fact-ledger", "shrink-limit", "fact-check"]),
      ],
      checks(
        {
          "fact-ledger": "missing 1 of 2 items: “Register docs on this device”",
          "shrink-limit": "lost 37% of words (limit 20%)",
          "smallest-edit": "skipped: ste.paragraph-length flags the whole block",
          "fixes-target": "fixed ste.paragraph-length",
          "fact-check": "Jev P(drop or add) = 0.97: drops backups, archives, container storage, and custom docs roots",
        },
        ["fact-ledger", "shrink-limit", "fact-check"],
        ["smallest-edit"],
      ),
      "Both attempts failed fact-ledger, shrink-limit, and fact-check.",
    ),
    {
      blockId: "central-3",
      blockType: "paragraph",
      kind: "rewrite",
      before: p3,
      after: p3,
      ruleIds: ["ste.passive-voice"],
      status: "unchanged",
      attempts: [{ strength: "fast", model: "gpt-6-luna", ms: 1180, accepted: false, after: p3, failed: [] }],
      ops: [],
    },
    {
      blockId: "central-14",
      blockType: "paragraph",
      kind: "rewrite",
      before: p14,
      after: "",
      ruleIds: ["ste.one-topic", "ste.sentence-length"],
      status: "error",
      attempts: [fast(2610, p14Fast, ["slop"]), { strength: "strong", model: "", ms: 30000, accepted: false, after: "", failed: [] }],
      reason: "strong rewrite failed: codex-lb returned HTTP 502",
      ops: [],
    },
  ];

  const findings: StyleFinding[] = [
    finding("ste.replacement", "central-16", "in order to", "Replace “in order to” with “to”.", { sentence: p16, autofixable: true }),
    finding("ste.replacement", "central-9", "via", "Replace “via” with one of: through, by using, with.", {
      sentence: "Route every document request via its project ID.",
    }),
    finding("writing.semicolon", "central-10", ";", "The sentence uses a semicolon.", { sentence: p10 }),
    finding("ste.sentence-length", "central-10", p10, "Sentence has 33 words. The limit is 25.", { sentence: p10 }),
    finding("ste.sentence-length", "central-15", "A crashed runtime is restarted", "Sentence has 29 words. The limit is 25.", {
      sentence:
        "A crashed runtime is restarted using the prior successful artifact when available, and source updates do not guarantee preservation of unsaved browser state across a full page reload.",
    }),
    finding("ste.sentence-length", "central-14", p14, "Sentence has 28 words. The limit is 25.", { sentence: p14 }),
    finding("ste.passive-voice", "central-15", "is restarted", "Passive voice: “is restarted”.", {
      probability: 0.91,
      sentence:
        "A crashed runtime is restarted using the prior successful artifact when available, and source updates do not guarantee preservation of unsaved browser state across a full page reload.",
    }),
    finding("ste.passive-voice", "central-5", "are excluded", "Passive voice: “are excluded”.", {
      probability: 0.81,
      sentence: "Hidden folders, system storage, dependencies, backups, archives, and container storage are excluded.",
    }),
    finding("ste.passive-voice", "central-3", "is reached", "Passive voice: “is reached”.", {
      probability: 0.77,
      sentence: "Registration changes how a project is reached, without copying its documents into a central data directory.",
    }),
    finding("ste.passive-voice", "central-3", "are registered", "Passive voice: “are registered”.", {
      probability: 0.12,
      overruled: true,
      sentence: "Only normalized corpora are registered.",
    }),
    finding("ste.paragraph-length", "central-5", "The home page starts device discovery", "Paragraph has 5 sentences. The limit is 4."),
    finding("ste.one-topic", "central-14", p14, "One sentence carries two topics: change events and source builds.", {
      sentence: p14,
      tier: 2,
      probability: 0.83,
    }),
    finding("ste.condition-first", "central-12", "after you change the package configuration", "The condition comes after the instruction it guards.", {
      sentence: p12,
      tier: 2,
      probability: 0.74,
    }),
    finding("ste.modal-verbs", "central-2", "may", "Replace “may” with “can” or “must”.", {
      field: "props.rows[4][1]",
      sentence: "A replacement may wait for active editor leases before it starts.",
    }),
    finding("ste.noun-cluster", "central-8", "local service access token", "Noun cluster of 4 nouns. The limit is 3.", {
      sentence: "Browser requests must come from the same origin, and MCP requests must carry the local service access token.",
    }),
  ];

  const blocks: BlockSpec[] = [
    { id: "central-3", type: "paragraph", text: p3 },
    { id: "central-5", type: "paragraph", text: p5 },
    { id: "central-8", type: "list-item", text: p8 },
    { id: "central-9", type: "list-item", text: p9 },
    { id: "central-10", type: "list-item", text: p10 },
    { id: "central-12", type: "list-item", text: p12 },
    { id: "central-14", type: "paragraph", text: p14 },
    { id: "central-15", type: "paragraph", text: p15 },
    { id: "central-16", type: "paragraph", text: p16 },
  ];
  return page(
    "10-system-design/70-central-docs-service",
    "Central Docs Service",
    { blocks: 41, sentences: 63, words: 1184 },
    true,
    findings,
    changes,
    blocks,
  );
}

// ---------------------------------------------------------------------------------------------
// Page 2: Reading Surface (deep)
// ---------------------------------------------------------------------------------------------

function readingSurface(): PageResult {
  const r0 =
    "The reading surface is a left-justified full-width page where each top-level block claims its own layout lane, with stable page furniture and navigation that keeps context visible. This page defines its lane measures and spacing, derived title, numbered sidebar, reference peek, and backlinks footer. Per-block presentation remains in [Block vocabulary](../../40-block-vocabulary).";
  const r0After =
    "The reading surface is a left-justified full-width page. Each top-level block claims its own layout lane, and stable page furniture and navigation keep context visible. This page defines its lane measures and spacing, derived title, numbered sidebar, reference peek, and backlinks footer. Per-block presentation remains in [Block vocabulary](../../40-block-vocabulary).";
  const r3 = "Until that theme is first saved, projects utilize the stock defaults directly.";
  const r3After = "Until that theme is first saved, projects use the stock defaults directly.";
  const r7 = "Every lane is left-justified on the shared content rail unless a per-block theme override explicitly centers it.";
  const r7Fast = "Every lane sits left-justified on the shared content rail, and a per-block theme override can center it.";
  const r7Strong = "Every lane sits left-justified on the shared content rail. A per-block theme override can center it.";
  const r8 = "A lane is a maximum, so a block whose content is narrower than its lane might shrink to that content.";
  const r9 = "Secondary panes are layout siblings. Opening one pushes and reflows the document; it never covers content.";
  const r9After = "Secondary panes are layout siblings. Opening one pushes and reflows the document. It never covers content.";
  const r11 =
    "The title is navigation furniture derived from the bundle name: the numeric prefix is removed, hyphens become spaces, Title Case is applied, and domain acronyms are uppercased.";
  const r11After =
    "The title is navigation furniture that comes from the bundle name.\n- The numeric prefix is removed.\n- Hyphens become spaces.\n- Title Case is applied.\n- Domain acronyms are uppercased.";
  const r13 = "Clicking the title simply edits the bundle name in place.";
  const r13After = "Clicking the title edits the bundle name in place.";
  const r14 = "The sidebar walks the numbered bundle tree reading order defined by Numbering.";

  const changes: BlockChange[] = [
    autofix("reading-13", "list-item", "ste.filler", r13, r13After),
    autofix("reading-3", "paragraph", "ste.replacement", r3, r3After),
    rewrite(
      "reading-9",
      "list-item",
      ["writing.semicolon"],
      r9,
      [fast(1320, r9After)],
      checks(
        {
          "meaning-words": "never 1 → 1",
          "shrink-limit": "±0 words",
          "smallest-edit": "1 unflagged sentence unchanged",
          "fixes-target": "fixed writing.semicolon",
          "fact-check": "skipped: Jev did not answer (HTTP 503)",
        },
        [],
        ["fact-check"],
      ),
      "needs review: fact check unavailable",
    ),
    rewrite(
      "reading-11",
      "list-item",
      ["ste.sentence-length"],
      r11,
      [fast(2950, r11After)],
      checks(
        {
          "fact-ledger": "2 of 2 items found: Title Case, bundle name",
          "shrink-limit": "±0 words",
          "smallest-edit": "skipped: one sentence, and it is flagged",
          "fixes-target": "fixed ste.sentence-length",
          "fact-check": "Jev P(drop or add) = 0.05",
        },
        [],
        ["smallest-edit"],
      ),
    ),
    rewrite(
      "reading-7",
      "list-item",
      ["ste.passive-voice"],
      r7,
      [fast(1740, r7Fast, ["meaning-words", "fact-check"]), strong(3880, r7Strong, ["meaning-words"])],
      checks(
        {
          "meaning-words": "unless 1 → 0",
          "shrink-limit": "−1 word (−6%)",
          "fixes-target": "fixed ste.passive-voice",
          "fact-check": "Jev P(drop or add) = 0.41, under the 0.5 threshold",
        },
        ["meaning-words"],
      ),
      "Both attempts dropped “unless”.",
    ),
    rewrite(
      "reading-0",
      "paragraph",
      ["ste.sentence-length"],
      r0,
      [fast(2210, r0After)],
      checks({
        tokens: "1 of 1 token restored",
        "fact-ledger": "2 of 2 items found: link, reference peek",
        "shrink-limit": "−2 words (−4%)",
        "smallest-edit": "2 unflagged sentences unchanged",
        "fixes-target": "fixed ste.sentence-length",
        "fact-check": "Jev P(drop or add) = 0.03",
      }),
    ),
  ];

  const findings: StyleFinding[] = [
    finding("ste.filler", "reading-13", "simply", "Delete the filler word “simply”.", { sentence: r13, autofixable: true }),
    finding("ste.replacement", "reading-3", "utilize", "Replace “utilize” with “use”.", { sentence: r3, autofixable: true }),
    finding("writing.semicolon", "reading-9", ";", "The sentence uses a semicolon.", {
      sentence: "Opening one pushes and reflows the document; it never covers content.",
    }),
    finding("ste.sentence-length", "reading-11", r11, "Sentence has 27 words. The limit is 25.", { sentence: r11 }),
    finding("ste.sentence-length", "reading-0", "The reading surface is a left-justified full-width page", "Sentence has 28 words. The limit is 25.", {
      sentence:
        "The reading surface is a left-justified full-width page where each top-level block claims its own layout lane, with stable page furniture and navigation that keeps context visible.",
    }),
    finding("ste.passive-voice", "reading-7", "is left-justified", "Passive voice: “is left-justified”.", { sentence: r7, probability: 0.88 }),
    finding("ste.passive-voice", "reading-11", "is removed", "Passive voice: “is removed”.", { sentence: r11, probability: 0.72 }),
    finding("ste.passive-voice", "reading-3", "is first saved", "Passive voice: “is first saved”.", { sentence: r3, probability: 0.34, overruled: true }),
    finding("ste.noun-cluster", "reading-14", "numbered bundle tree reading order", "Noun cluster of 5 nouns. The limit is 3.", { sentence: r14 }),
    finding("ste.modal-verbs", "reading-8", "might", "Replace “might” with “can”.", { sentence: r8 }),
    finding("ste.undefined-term", "reading-0", "reference peek", "“reference peek” appears before the page defines or links it.", {
      sentence:
        "This page defines its lane measures and spacing, derived title, numbered sidebar, reference peek, and backlinks footer.",
      tier: 2,
      probability: 0.86,
    }),
  ];

  const blocks: BlockSpec[] = [
    { id: "reading-0", type: "paragraph", text: r0 },
    { id: "reading-3", type: "paragraph", text: r3 },
    { id: "reading-7", type: "list-item", text: r7 },
    { id: "reading-8", type: "list-item", text: r8 },
    { id: "reading-9", type: "list-item", text: r9 },
    { id: "reading-11", type: "list-item", text: r11 },
    { id: "reading-13", type: "list-item", text: r13 },
    { id: "reading-14", type: "list-item", text: r14 },
  ];
  return page(
    "10-system-design/50-editor-design/10-reading-surface",
    "Reading Surface",
    { blocks: 48, sentences: 70, words: 1318 },
    true,
    findings,
    changes,
    blocks,
  );
}

// ---------------------------------------------------------------------------------------------
// Page 3: Release Core Products (Tier 1 only)
// ---------------------------------------------------------------------------------------------

function releaseCoreProducts(): PageResult {
  const r4 = "Utilize the release script to tag every core package at the same version.";
  const r4After = "Use the release script to tag every core package at the same version.";
  const r6 =
    "Run `bun run release --dry-run` first, then read the plan it prints, because the script refuses to continue when any package has uncommitted changes or a version that is behind the registry.";
  const r8 = "Each package is published to the internal registry after the tag is pushed.";
  const r9 = "The changelog is generated from commit messages — write them in the imperative.";
  const r10 = "You should check the release notes before you announce the release.";

  const findings: StyleFinding[] = [
    finding("ste.replacement", "release-4", "Utilize", "Replace “utilize” with “use”.", { sentence: r4, autofixable: true }),
    finding("ste.sentence-length", "release-6", "Run \u0000 first, then read the plan it prints", "Sentence has 31 words. The limit is 20 for a procedure.", {
      sentence:
        "Run \u0000 first, then read the plan it prints, because the script refuses to continue when any package has uncommitted changes or a version that is behind the registry.",
    }),
    finding("ste.passive-voice", "release-8", "is published", "Passive voice: “is published”.", { sentence: r8 }),
    finding("writing.no-em-dash", "release-9", "—", "The sentence uses an em dash.", { sentence: r9 }),
    finding("ste.modal-verbs", "release-10", "should", "Replace “should” with “must”, or write a command.", { sentence: r10 }),
  ];

  const changes = [autofix("release-4", "list-item", "ste.replacement", r4, r4After)];
  const blocks: BlockSpec[] = [
    { id: "release-4", type: "list-item", text: r4 },
    { id: "release-6", type: "list-item", text: r6 },
    { id: "release-8", type: "paragraph", text: r8 },
    { id: "release-9", type: "paragraph", text: r9 },
    { id: "release-10", type: "paragraph", text: r10 },
  ];
  return page("40-guides/20-release-core-products", "Release Core Products", { blocks: 31, sentences: 44, words: 731 }, false, findings, changes, blocks);
}

/** A reviewer overlay for the fixture: 5 labels, 2 of them reasons to reject. */
export function fixtureReviewOverlay(): ReviewOverlay {
  const central = "10-system-design/70-central-docs-service";
  const reading = "10-system-design/50-editor-design/10-reading-surface";
  return {
    reviewer: "opus-reviewer",
    summary:
      "Most rewrites read better and keep every fact.\n\n- `central-15` turns “do not guarantee preservation” into “do not preserve”, a stronger claim.\n- The title list in `reading-11` reads choppier than the sentence it replaced.",
    labels: {
      [`${central}#central-10`]: { label: "improved", note: "Each clause now stands alone, and nothing is lost." },
      [`${central}#central-15`]: { label: "meaning-changed", note: "“do not guarantee preservation” became “do not preserve”." },
      [`${reading}#reading-9`]: { label: "neutral", note: "Splitting at the semicolon changes little." },
      [`${reading}#reading-11`]: { label: "worse-readability", note: "Four one-line bullets read choppier than one sentence." },
      [`${reading}#reading-0`]: { label: "improved", note: "The long first sentence is now two clear ones." },
    },
  };
}

export function fixtureSweepResult(): SweepResult {
  const pages = [centralDocsService(), readingSurface(), releaseCoreProducts()];
  return {
    startedAt: "2026-10-02T14:05:12.000Z",
    finishedAt: "2026-10-02T14:09:47.000Z",
    config: {
      judge: true,
      judgeError: "jev-1.13.0 returned HTTP 503 three times after 14:08:51 UTC",
      rewriter: true,
      models: ["gpt-6-luna", "gpt-6.1-sol", "jev-1.13.0"],
      deepPages: pages.filter((p) => p.deep).map((p) => p.path),
    },
    pages,
  };
}
