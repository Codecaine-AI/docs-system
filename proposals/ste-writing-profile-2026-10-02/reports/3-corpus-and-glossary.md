# 3. Corpus vocabulary, domain glossary, and STE baseline

Scope: 108 real pages under `docs/**/doc.json` (`.changesets/` and dot-dirs skipped). Prose comes from docs-model `authoredProse()` (same fields the lints see; inline code and reference spans are removed and act as boundaries). 4,809 prose fields, 5,487 sentences, ~57.6k words.

Scripts: `/tmp/ste-research/scripts/corpus-extract.ts`, `corpus-vocab.ts`, `corpus-ste.ts`, `corpus-case.py`. Raw output: `/tmp/ste-research/raw/corpus-*`.

Re-run (from any dir): `cd /Users/Ford/workspace/codecaine/core/docs-system && bun /tmp/ste-research/scripts/corpus-extract.ts && cd /tmp/ste-research && bun scripts/corpus-vocab.ts && bun scripts/corpus-ste.ts` (about 15 s total).

---

## 1. Corpus vocabulary

### 1.1 Size and coverage

| Measure | Value |
|---|---|
| Tokens (prose words) | 57,616 |
| Distinct words (lowercase, singularized) | 4,304 |
| Words used once (hapax) | 1,750 (41%) |
| Words covering 80% / 90% / 95% of tokens | 640 / 1,233 / 1,989 |
| Distinct verb roots (compromise POS) | 942 |
| Distinct noun roots | 2,080 |

Reading: an approved list of ~1,200 general words plus registered technical names would cover 90% of today's text. ASD-STE100 has ~900 approved words, so the size is in range. The 942 verb roots is the number to cut hardest (STE wants one verb per action).

### 1.2 Top technical terms (count / pages)

- **Unigrams:** block 483/77, doc 391/79, theme 291/45, state 240/71, text 238/62, agent 236/66, document 227/71, code 216/58, file 216/67, type 203/54, page 201/62, path 201/60, source 199/64, component 190/54, action 188/51, change 182/65, surface 174/56, render 159/54, contract 134/61, tree 130/45, canvas 130/33, prop 127/39, schema 107/44, renderer 104/44, operation 105/36.
- **Bigrams:** global theme 57/23, typed action 46/32, state schema 38/34, block type 37/30, agent renderer 30/30, doc renderer 30/28, theme folder 26/21, prop patch 24/13, delta text 23/17, code block 21/11, node view 21/11, doc tree 19/12, active theme 19/19, css variable 18/17, state shape 16/11, agent adapter 15/14, slash menu 14/12, block id 13/9, process outline 13/8, style rail 13/8, operation signature 13/10, draft lock 12/7, closed schema 11/11, hash precondition 11/9, content hash 9/7, response envelope 9/9, atom leaf 9/9.
- **Trigrams:** active theme folder 16/16, real operation signature 9/9, worked component example 8/8, relevant state shape 8/8, shared global theme 6/6, non-editable atom leaf 6/6, exact inverse ops 4/3, doc apply ops 4/4, closed state schema 3/3, closed typebox schema 3/3, canonical block type 3/3, static doc export 3/3.
- **Top verb roots:** use 198, render 169, edit 168, keep 159, read 156, change 129, write 127, own 124, apply 118, carry 115, stay 95, remain 83, add 79, live 75, define 64, validate 63, show 59, save 55, return 53, nest 49, preserve 46, hold 46, undo 46, resolve 45, build 43, remove 43, replace 43, move 42, create 40, supply 39, derive 33, persist 27, expose 24, refuse 23, govern 21.
  - Metaphor verbs used as technical verbs: **carry** (115), **own** (124), **live** (75), **stay** (95), **land** (28), **govern** (21). These need a ruling: approve with one meaning each, or replace (`carry` → `hold`/`store`, `live` → `is stored in`).
- **Top code literals** (inline code, i.e. technical names already marked): `updateBlock` 33, `src` 20, `THEME_TOKEN_REGISTRY` 16, `componentAction` 15, `carriesText: false` 15, `doc.json` 8, `docs_check` 8, `splitBlock`/`mergeBlocks`/`insertBlock` 6, `moveBlock` 5, `docs_begin` 6.

Full lists: `raw/corpus-unigrams.csv`, `corpus-bigrams.csv`, `corpus-trigrams.csv`, `corpus-verb-roots.csv`, `corpus-vocab.json`.

### 1.3 Synonym clusters (where the docs are inconsistent today)

Counts are `total / pages`. "Mixed" = pages that use 3+ variants of the same cluster.

| Concept | Variants (total / pages) | Mixed pages |
|---|---|---|
| Page unit | **document 250/71**, page 212/62, docs 177/51, doc 128/48, bundle 81/36, article 11/6 | **52 of 108** |
| Pending change | edit 149/52, operation 113/36, op 89/33, patch 78/28, diff 36/17, mutation 30/17, proposal 19/5, change set 11/2, changeset 1/1 | 31 |
| Block unit | **block 503/78**, component 200/54, node 73/25, element 29/15, widget 4/1 | 25 |
| Block data | state 258/74, props 127/39, field 106/20, data 45/30, property 17/8, attribute 11/6 | 22 |
| Written words | text 278/63, content 108/49, body 49/17, prose 34/17, copy 26/16 | 19 |
| Label text | title 85/32, header 73/20, heading 72/25, label 52/20, caption 35/13 | 18 |
| Grouping | folder 115/35, section 70/35, layer 62/27, directory 61/22, group 35/17 | 15 |
| Editing UI | editor 130/51, workbench 57/29, studio 17/6, app 15/9 | 11 |
| Agent-facing output | agent renderer 31/30, projection 24/14, agent adapter 15/14, agent surface 8/8, agent view 1/1 | 11 |
| Invocable thing | action 193/51, command 62/23, tool 58/20, API 19/13, method 6/5, endpoint 5/4 | 11 |
| Lint result | rule 176/61, check 65/31, finding 24/7, warning 23/9, lint 16/5, issue 13/9, violation 6/4, diagnostic 4/4 | 10 |
| Human actor | reader 73/37, human 41/23, user 20/11, writer 17/9, author 16/12, person/people 10/7, operator 4/3 | 10 |
| Review note | note 108/27, annotation 81/29, request 42/20, comment 30/14, feedback 5/3, thread 1/1 | 10 |
| Reading UI | renderer 104/44, viewer 67/23, preview 38/13, reading surface 7/5, human surface 6/6 | 8 |
| Whole collection | project 132/33, corpus 67/26, site 26/5, docs/doc tree 16/10, docs root 9/7 | 8 |
| Pointer | reference 128/44, link 100/35, backlink 14/11 | 6 |
| Rulebook | guide 38/18, guidance 36/12, standard 35/18, policy 20/10, style guide 6/4, convention 5/5, principle 4/4 | 5 |
| Machine actor | agent 256/70, model 71/30, AI 12/3, Claude 9/6, worker 9/2 | 4 |
| Version marker | hash 80/28, version 25/8, snapshot 23/11, revision 21/11, baseline 18/8 | 4 |
| Side file | asset 63/21, sidecar 46/16, payload 21/13, attachment 2/2 | 3 |
| Diagram | canvas 146/35, diagram 45/18, board 9/3, figure 4/1 | 2 |

Worst offenders:
- **Page unit** is the top problem: 52 pages mix 3+ words. `10-doc-standards/10-structure` uses doc 17, page 3, docs 4, document 2, bundle 4. `50-canvas` uses doc 14, document 6, docs 4, bundle 3, page 1.
- **Pending change**: `30-data-model/60-change-sets` uses proposal 13, change set 9, operation 4, diff 3, patch 2, mutation 2, op 1. `50-mutation-model` uses op 23, patch 7, mutation 5, edit 4, change set 2.
- **Lint result**: `80-authoring-lints` uses rule 23, finding 16, check 14, warning 9, lint 8, violation 3, diagnostic 1 on one page.
- Per-page counts for every cluster: `raw/corpus-synonym-clusters.csv`.

### 1.4 Spelling and case variants of the same term

Hyphen vs space (most are block type ids written as prose; pick "display name in prose, id in code"):

| Term | hyphen / space / solid |
|---|---|
| process-outline | 38 / 13 / 0 |
| rich-text | 22 / 11 / 0 |
| state-shape | 14 / 16 / 0 |
| list-item | 12 / 16 / 0 |
| file-tree | 14 / 11 / 0 |
| in-place | 10 / 17 / 0 |
| style-rail | 10 / 13 / 0 |
| docs-system | 14 / 11 / 0 |
| docs-root | 7 / 9 / 3 |
| image-grid | 9 / 6 / 1 |
| interaction-surface | 10 / 6 / 0 |
| slash-menu | 7 / 14 / 0 |
| non-empty | 8 / 0 / 7 |

Case, mid-sentence, prose fields only (`raw/corpus-case-variants.json`): docs/Docs 101/37, canvas/Canvas 68/31, sequence/Sequence 34/21, id/ID 44/19, ids/IDs 25/14, Global/global 54/14, markdown/Markdown 37/9. Rule needed: product names (Canvas, Sequence, Docs) capitalized, generic nouns lowercase. ID vs id needs one form.

---

## 2. Existing domain terms

No GLOSSARY.md, CONTEXT.md, or ADR folder exists in `docs-system` or anywhere under `~/workspace/codecaine` (maxdepth 6). The only ADRs found belong to a vendored third-party project (`spectre/ai_docs/plannotator-main/adr/`). Terms are defined in prose across the data-model pages, three root design notes, and the schema types.

Full structured list (69 names, 40 verbs, 24 sources, 29 conflicts): `raw/corpus-glossary-candidates.json`.

### 2.1 Where terms are defined today

| Source | Terms it defines |
|---|---|
| `docs/10-system-design/30-data-model/10-document-tree` | document envelope, block, root, children, block ID, anchor contract, graph invariants, seven ops (signatures) |
| `docs/10-system-design/30-data-model/20-block-design` | block type, block contract, state schema, typed action, doc renderer, agent renderer, theming, agent adapter |
| `docs/10-system-design/30-data-model/30-annotations` | annotation, annotation target (block, text_range, visual_point, custom_element), intent, status, agentRun receipt, resolution, dangling target |
| `docs/10-system-design/30-data-model/40-serialization` | deterministic serializer, canonical key order, markdown render, content hash |
| `docs/10-system-design/30-data-model/50-mutation-model` | op algebra, inverse, patch_id, undo ledger, expected_hash, draft lock, session_id, write authority, validation gate, change event, discovery, forwarded action |
| `docs/10-system-design/30-data-model/60-change-sets` | change-set, change-set entry, tree op, accept protocol, compound ledger entry, move_blocks, merge_docs, split_doc |
| `docs/10-system-design/20-translation-layer` | document (one canonical state), translation layer, human surface, agent surface |
| `docs/10-system-design/10-doc-standards` | four layers, 00-foundation, 10-system-design, 20-agents, 30-implementation |
| `docs/10-system-design/10-doc-standards/10-structure` | doc, bundle, depth ladder L1-L6, section, parent doc, concept doc, extension tier, guides tier |
| `docs/10-system-design/10-doc-standards/60-implementation-layer` | area page, decision entry, lazy accretion |
| `docs/10-system-design/10-doc-standards/80-authoring-lints` | lint rule, finding, draft and complete phases, baseline, introduced finding, blocking finding, judgment rule, style gate |
| `docs/10-system-design/40-block-vocabulary` | block vocabulary, 23 block types, family, five groups |
| `docs/00-foundation/10-design-principles` | closed block contract, small vocabulary, theme knob, Global theme, stable identity |
| `BLOCK-ARCHITECTURE.md` | block vs component (D1a), component roster, bundle contract, apply vs forward, action rule |
| `CHANGESETS-DESIGN.md` | change-set as Doc PR, staged regions, propose_ops, PR card |
| `VIEWER-HOST-SEPARATION.md` | viewer, host, DocsClient seam |
| `packages/docs-model/src/doc-schema.ts` | DOC_BLOCK_TYPES, DocBlock, DocDocument, DeltaSpan, DeltaSpanAttributes |
| `packages/docs-model/src/annotations-schema.ts` | AnnotationTarget (block, canvas-object, text-range), AnnotationIntent, AnnotationStatus, DocAnnotation, AnnotationsDocument |
| `packages/docs-model/src/lint/types.ts` | LintPhase, LintSeverity, RuleMatch, LintFinding, LintReport, LintRule |
| `packages/docs-cli/src/audit.ts` | audit checks E1-E6 (errors), W1, W2, W4 (warnings) |
| `docs/40-guides/10-docs-mcp/40-recovery` | task context |
| `docs/10-system-design/50-editor-design/40-visual-system/30-themes` | Global theme |
| `../annotations/README.md` | annotation envelope, zone, target adapter, reply thread |

Reading: `10-system-design/30-data-model/*` is the de facto glossary. 33 of the 69 candidate names cite it as their source; 54 of 69 cite some docs page. A Codecaine STE technical-names list can be seeded from those six pages plus `doc-schema.ts`, `annotations-schema.ts`, and `lint/types.ts`.

### 2.2 Candidate TECHNICAL NAMES (nouns)

| Term | Definition | Source | Other words used for it |
|---|---|---|---|
| **document** | One canonical state, stored as a doc.json block tree, that humans and agents read through separate surfaces. | `docs/10-system-design/20-translation-layer` | doc, page, bundle, DocDocument, doc.json |
| **doc.json** | The file that stores one document as a normalized, id-keyed block tree. | `docs/10-system-design/30-data-model/10-document-tree` | document file, doc bundle file |
| **bundle** | A doc folder: the folder that holds doc.json plus its sidecars and assets. The folder name is the address of the doc. | `docs/10-system-design/10-doc-standards/10-structure` | doc folder, doc bundle, page |
| **corpus** | The complete tree of docs under one docs root. | `docs-kernel.corpora.json` | docs tree, project docs, documentation corpus |
| **docs root** | The directory that holds a corpus. It is the unit of write authority. | `docs/30-implementation/10-packages/30-docs-server` | docsRoot, --root |
| **project** | A repository that MCP discovery found with a normalized doc.json corpus. Tools address it by project ID. | `packages/docs-mcp/src/discovery.ts` | DocsProject |
| **block** | A node in the document tree. It has a stable ID, a type, props, optional text, and ordered child IDs. Tree order lives only in the children arrays. | `docs/10-system-design/30-data-model/10-document-tree` | DocBlock, node |
| **block type** | One of the registered type strings in DOC_BLOCK_TYPES, such as paragraph or file-tree. There are 23 today. | `packages/docs-model/src/doc-schema.ts` | type, DocBlockType, kind (retired key: flavour) |
| **block ID** | A stable ASCII ID that is unique in its document. Annotations, patches, and backlinks anchor to it. | `docs/10-system-design/30-data-model/10-document-tree` | id, blockId, anchor |
| **props** | The typed state fields of a block. The state schema of the block type validates them. | `docs/10-system-design/30-data-model/10-document-tree` | properties, block props |
| **delta span** | One unit of rich text: an insert string plus optional mark attributes. | `packages/docs-model/src/doc-schema.ts` | DeltaSpan, span, rich text, text |
| **mark** | An inline attribute on a span: bold, italic, strike, code, link, or reference. | `packages/docs-model/src/doc-schema.ts` | attribute, DeltaSpanAttributes, inline mark |
| **reference** | An inline span attribute that points at a doc or source file. It shows as a chip and feeds the backlinks index. | `docs/10-system-design/40-block-vocabulary/10-text-and-media/10-rich-text` | reference span, reference chip, SpectreRef, mention |
| **backlinks index** | A derived SQLite index of inbound references, stored under .index/ and rebuilt by rescan. | `packages/docs-index/src/backlinks.ts` | backlinks, docs index, backlink index |
| **component** | An editing world that owns one or more block types: state schema, actions, agent view, and user view. | `BLOCK-ARCHITECTURE.md` | component family, family, component bundle, block family, family (corpus: 15 families in 5 groups) |
| **block contract** | The parts every block type owns: state schema, typed actions, doc renderer, agent renderer, theme, and agent adapter. | `docs/10-system-design/30-data-model/20-block-design` | closed contract, bundle contract, four-part contract |
| **state schema** | The closed TypeBox schema over the props of a block type. A write that does not conform is refused. | `docs/10-system-design/30-data-model/20-block-design` | state.ts, schema, component-state schema |
| **action** | A named, validated change keyed <blockType>.<verb>, such as file-tree.addEntry. It returns a props patch. | `docs/10-system-design/30-data-model/20-block-design` | typed action, component action, componentAction, blockAction |
| **forwarded action** | An action that the owning engine (canvas or sequence) applies to its own sidecar instead of patching document props. | `docs/10-system-design/30-data-model/50-mutation-model` | forward, lifted action, forward action |
| **doc renderer** | The React component that shows a block type to a human and edits it in place. | `docs/10-system-design/30-data-model/20-block-design` | user view, human renderer, block renderer, DocBlockRenderer |
| **agent renderer** | The function that renders block state as deterministic markdown for agents. | `docs/10-system-design/30-data-model/20-block-design` | agent view, agent-view.ts, markdown projection, projection |
| **agent adapter** | The way an agent edits a block type when it processes an annotation. Canvas and sequence bring their own agents. | `docs/10-system-design/30-data-model/20-block-design` | context loader |
| **discovery payload** | The GET /api/blocks response that lists ops, components, block types, state schemas, and actions. | `docs/10-system-design/30-data-model/50-mutation-model` | discovery, GET /api/blocks, BlocksDiscovery |
| **theme knob** | A style capability that a component exposes and that each theme resolves. | `docs/00-foundation/10-design-principles` | token, theme token, knob, Global theme (the one shared theme) |
| **op** | One of seven document mutations: insertBlock, updateBlock, deleteBlock, moveBlock, splitBlock, mergeBlocks, componentAction. | `docs/10-system-design/30-data-model/50-mutation-model` | DocOp, operation, typed operation, document operation |
| **inverse** | The ops that exactly revert an applied batch. The ledger records them for undo. | `docs/10-system-design/30-data-model/50-mutation-model` | inverse op, inverse batch |
| **patch** | One applied op batch, recorded in the undo ledger under a patch ID. It is the unit of undo. | `docs/10-system-design/30-data-model/50-mutation-model` | patch_id, patchId |
| **undo ledger** | The in-memory store of inverse batches keyed by patch ID. It is not durable history. | `docs/10-system-design/30-data-model/50-mutation-model/10-undo-redo` | patch ledger, ledger |
| **content hash** | The SHA-256 hash of the canonical bytes of a file. A write names it as expected_hash and fails if the file changed. | `docs/10-system-design/30-data-model/40-serialization` | hash, revision hash, expected_hash, document hash |
| **draft lock** | An expiring, heartbeat-renewed write claim held by one session. A conflicting writer gets HTTP 423. | `docs/10-system-design/30-data-model/50-mutation-model` | lock, DraftLock |
| **session** | One editing actor, such as a browser tab or an agent run, identified by one session_id on all its writes. | `docs/10-system-design/30-data-model/50-mutation-model` | editing session, session_id, docs-edit session |
| **write authority** | The server part that runs read, check, apply, and write for each document in one critical section and refuses invalid writes. | `docs/10-system-design/30-data-model/50-mutation-model` | mutation authority, authority, DocsStore, store |
| **change event** | The SSE message {path, changedIds, patchId, actor} sent after a write commits. | `docs/10-system-design/30-data-model/50-mutation-model` | DocsChangeEvent, live update, SSE event |
| **validation issue** | A typed problem that a validator returns with a JSONPath-style path. Validators never throw. | `docs/10-system-design/30-data-model/10-document-tree` | issue, DocValidationIssue, AnnotationsValidationIssue |
| **sidecar** | A JSON file stored beside doc.json that holds non-content state, such as annotations.json, proposals.json, or a canvas file. | `docs/10-system-design/30-data-model/30-annotations` | sidecar file, component sidecar |
| **asset** | A file under the assets/ directory of a bundle: an image, video, attachment, canvas file, or sequence file. | `packages/docs-mcp/src/tools.ts` | bundle asset, attachment |
| **annotation** | A record in annotations.json that marks a target in a doc and states a request or a note. Its intent is note or agent-request; its status is open or resolved. | `docs/10-system-design/30-data-model/30-annotations` | comment, request, agent request, annotation thread, DocAnnotation |
| **annotation target** | The thing an annotation points at: a block, a text range, or a canvas object. | `docs/10-system-design/30-data-model/30-annotations` | target, AnnotationTarget |
| **intent** | The kind of annotation: note (a margin note) or agent-request (work for an agent). | `docs/10-system-design/30-data-model/30-annotations` | AnnotationIntent |
| **agent run** | The receipt on a handled annotation: session ID, patch ID, summary, and changed IDs. | `docs/10-system-design/30-data-model/30-annotations` | agentRun, receipt, AnnotationAgentRun |
| **dangling target** | An annotation target that no longer resolves, for example because its block was deleted, split, or merged. | `docs/10-system-design/30-data-model/30-annotations` | dangling annotation, stranded anchor |
| **proposal** | A staged batch of ops for one doc, stored in proposals.json until a reviewer accepts or rejects it. | `docs/10-system-design/30-data-model/60-change-sets` | staged proposal, DocProposal, DocsEditProposal, staged diff, staged region |
| **change-set** | A record that groups per-doc proposals and tree ops so that they are accepted, rejected, and undone as one unit. | `docs/10-system-design/30-data-model/60-change-sets` | changeset, change set, Doc PR, DocChangeSet |
| **change-set entry** | A pointer {docPath, proposalId} from a change-set to one staged proposal. | `docs/10-system-design/30-data-model/60-change-sets` | entry, DocChangeSetEntry |
| **tree op** | A document-level operation: create-doc, delete-doc, or move-doc. | `docs/10-system-design/30-data-model/60-change-sets` | treeOps, document-tree operation, DocChangeSetTreeOp, management change |
| **layer** | One of the four numbered root folders: 00-foundation, 10-system-design, 20-agents, 30-implementation. | `docs/10-system-design/10-doc-standards` | tier, root tier, doc layer |
| **extension tier** | A numbered root folder from 40 to 98 that holds non-normative procedure, such as guides. | `docs/10-system-design/10-doc-standards/10-structure` | guides tier, tier |
| **section** | A folder below a layer that is itself a doc and introduces its children. | `docs/10-system-design/10-doc-standards/10-structure` | section folder, XX-section |
| **parent doc** | The doc.json of a layer or section folder. It introduces each child in one line. | `docs/10-system-design/10-doc-standards/10-structure` | section doc, overview (retired 00-overview) |
| **concept doc** | A level-3 doc that covers one coherent idea. | `docs/10-system-design/10-doc-standards/10-structure` | leaf doc, page |
| **area page** | An implementation-layer page that mirrors one source directory and holds decision entries. | `docs/10-system-design/10-doc-standards/60-implementation-layer` | implementation page |
| **depth ladder** | The six levels L1 to L6, from the parent doc of a layer down to the code. | `docs/10-system-design/10-doc-standards/10-structure` | L1-L6, levels |
| **lint rule** | A registered writing or structure rule with an ID, a docsPath, a severity, enforcement phases, and a repair suggestion. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | rule, LintRule, check, audit check |
| **finding** | One match of a lint rule in a doc, with rule ID, severity, evidence, and suggestion. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | LintFinding, AuditFinding, style finding, violation, warning |
| **baseline** | The page state that a task's first write replaced. Findings already in the baseline are not introduced findings. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | edit baseline, pinned baseline |
| **judgment rule** | A model-judged style rule, such as packed-bullet or join-test, that reports a confidence score. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | Judgment Rules, judged finding |
| **style gate** | The gated findings that a task introduced and that make docs_check fail. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | style_gate, gated violation |
| **task** | One MCP authoring activity, from docs_begin to docs_end. It holds a pinned guidance snapshot and one baseline per page. | `docs/40-guides/10-docs-mcp/40-recovery` | task_id, task context, authoring task |
| **guidance** | The maintained authoring standards that docs_guidance serves by topic. | `packages/docs-mcp/src/guidance.ts` | guidance snapshot, style digest, standards, style guide, skill |
| **human surface** | The Notion-style editor where a person reads and edits rendered blocks. | `docs/10-system-design/20-translation-layer` | doc renderer, user view, read surface, workbench |
| **agent surface** | The rendered markdown and typed operations that agents use through the CLI, API, and MCP tools. | `docs/10-system-design/20-translation-layer` | agent view, markdown render, docs render |
| **viewer** | The embeddable React package that holds all doc-viewing and doc-editing UX. | `VIEWER-HOST-SEPARATION.md` | docs-viewer, editor |
| **host** | An app that embeds the viewer and supplies data through DocsClient and navigation through callbacks. | `VIEWER-HOST-SEPARATION.md` | host app, embedding app |
| **DocsClient** | The interface that a host implements to give the viewer its data. | `VIEWER-HOST-SEPARATION.md` | client, seam |
| **workbench** | The runnable host app that `docs serve` starts, with Edit and Annotate modes. | `README.md` | docs serve app, Docs Lab, app |
| **Central Docs Service** | The signed local service on port 4820 that routes projects and runs the docs MCP daemon. | `docs/40-guides/10-docs-mcp` | daemon, managed runtime, service |
| **board** | A canvas document: the spatial diagram stored in a .canvas.json file that a canvas block references. | `../canvas/README.md` | canvas, canvas document, canvas file |
| **canvas object** | A shape, sticky, or icon on a board that an annotation can target by objectId. | `docs/10-system-design/30-data-model/30-annotations` | object, node, custom_element |
| **participant** | A lifeline owner in a sequence diagram, such as a service or actor. | `../sequence/README.md` | lifeline, actor |

### 2.3 Candidate TECHNICAL VERBS

| Verb | Meaning | Source | Objects |
|---|---|---|---|
| **render** | Produce the deterministic markdown form of a doc for agents. | `packages/docs-cli/src/index.ts` | doc, page, block |
| **read** | Load a doc with its markdown, block IDs, hash, and findings. | `packages/docs-mcp/src/tools.ts (docs_read)` | doc, page, sidecar, asset, changeset |
| **search** | Find text across the rendered docs of a project. | `packages/docs-mcp/src/tools.ts (docs_search); docs grep` | corpus, page title |
| **apply** | Run a batch of ops on a document as one atomic write. | `docs/10-system-design/30-data-model/50-mutation-model` | op, batch, action, patch |
| **insert** | Add a new block under a parent at an index. | `docs/10-system-design/30-data-model/50-mutation-model (insertBlock)` | block, step |
| **update** | Change props or text of an existing item and keep its ID. | `docs/10-system-design/30-data-model/50-mutation-model (updateBlock)` | block, cell, entry, field, operation |
| **delete** | Remove a block, a page, or an asset. | `docs/10-system-design/30-data-model/50-mutation-model (deleteBlock)` | block, page, asset, subtree |
| **move** | Detach an item and attach it at a new place. | `docs/10-system-design/30-data-model/50-mutation-model (moveBlock)` | block, blocks, doc, asset, step |
| **split** | Divide a text block at an offset into two siblings, or divide a doc into two docs. | `docs/10-system-design/30-data-model/50-mutation-model (splitBlock)` | block, doc |
| **merge** | Combine contiguous sibling blocks into one fresh block, or combine two docs. | `docs/10-system-design/30-data-model/50-mutation-model (mergeBlocks)` | blocks, docs |
| **add** | Append an item to a structured collection in a block. | `packages/docs-model/src/components/*/actions` | entry, row, column, field, operation, annotation, reply |
| **remove** | Take an item out of a structured collection in a block. | `packages/docs-model/src/components/*/actions` | entry, row, column, field, operation, step, annotation |
| **set** | Replace one value in a block with a new value. | `packages/docs-model/src/components/*/actions` | annotation, example, step text, steps, title |
| **write** | Replace the inline markdown of one text block. | `packages/docs-mcp/src/tools.ts (docs_write_text)` | text, text block |
| **stage** | Record ops as a proposal for review instead of applying them, or group proposals into a change-set. | `packages/docs-mcp/src/tools.ts (docs_proposal_stage, docs_changeset_stage)` | ops, proposal, change-set |
| **accept** | Apply a staged proposal or change-set through the per-document write path. | `docs/10-system-design/30-data-model/60-change-sets` | proposal, change-set, entry |
| **reject** | Drop a staged proposal or change-set without changing content. | `docs/10-system-design/30-data-model/60-change-sets` | proposal, change-set |
| **undo** | Apply the inverse batch recorded under a patch ID. Redo is undoing the undo. | `docs/10-system-design/30-data-model/50-mutation-model` | patch, change-set, management change |
| **validate** | Check a document, sidecar, or props against its schema and return typed issues. | `docs/10-system-design/30-data-model/10-document-tree` | document, props, sidecar, params |
| **serialize** | Write a document as canonical bytes with a stable key order. | `docs/10-system-design/30-data-model/40-serialization` | document |
| **check** | Run validation and lint rules on a page, or verify that links resolve. | `packages/docs-mcp/src/tools.ts (docs_check); docs links check` | page, links, task |
| **lint** | Evaluate lint rules on a doc and report findings. | `docs/10-system-design/10-doc-standards/80-authoring-lints` | doc, block |
| **audit** | Run corpus-wide structure and content checks E1-E6 and W1-W4. | `packages/docs-cli/src/audit.ts` | corpus, bundle |
| **fix** | Apply safe, undoable automatic repairs for lint findings. | `packages/docs-mcp/src/tools.ts (docs_fix_lints)` | lint, finding |
| **annotate** | Mark a target in a doc with an annotation. | `docs/10-system-design/30-data-model/30-annotations` | block, text range, canvas object |
| **reply** | Add a message to the thread of an annotation. | `packages/docs-mcp/src/tools.ts (docs_annotation_reply)` | annotation, request |
| **resolve** | Close an annotation, with an optional resolution note. | `docs/10-system-design/30-data-model/30-annotations` | annotation, request |
| **anchor** | Attach an annotation, patch, or backlink to a block ID. | `docs/10-system-design/30-data-model/10-document-tree` | annotation, patch, backlink |
| **mint** | Create a fresh block ID. | `docs/10-system-design/30-data-model/10-document-tree` | id |
| **retarget** | Rewrite inbound references so that they point at a new doc path. | `docs/10-system-design/30-data-model/60-change-sets` | reference, link, backlink |
| **rescan** | Rebuild the backlinks index from the files on disk. | `packages/docs-cli/src/index.ts (backlinks rescan)` | backlinks index |
| **migrate** | Convert Markdown or MDX files into doc.json bundles without deleting the originals. | `README.md (docs migrate)` | Markdown file, corpus, annotation sidecar entry |
| **serve** | Start the read-and-write workbench on a local port. | `README.md (docs serve)` | workbench, corpus |
| **export** | Produce a static, read-only site from a corpus. | `README.md (docs export)` | corpus, site |
| **discover** | Find projects in a workspace, or learn the block roster from the discovery payload. | `packages/docs-mcp/src/discovery.ts; docs/10-system-design/30-data-model/20-block-design` | project, block type, action |
| **begin** | Start an authoring task and pin its guidance snapshot. docs_end finishes the task. | `packages/docs-mcp/src/tools.ts (docs_begin)` | task |
| **forward** | Hand an action to the engine that owns the referenced state. | `BLOCK-ARCHITECTURE.md` | action |
| **acquire** | Take a draft lock for a session. The lock is then renewed by heartbeat and given back by release. | `packages/docs-server/src/routes.ts (/api/draft-lock/*)` | draft lock |
| **preview** | Report what a page or asset management change would do, with a tree hash, before it is applied. | `packages/docs-mcp/src/tools.ts (docs_move, docs_delete preview)` | move, delete, rename, title change |
| **restore** | Revert a completed page or asset management change. | `packages/docs-mcp/src/tools.ts (docs_management_restore)` | management change |

Corpus verb usage (section 1.2) adds candidates that the code does not name: **render** 169, **carry** 115, **own** 124, **keep** 159, **stay** 95, **live** 75, **preserve** 46, **derive** 33, **persist** 27, **expose** 24, **refuse** 23, **govern** 21. Decide per verb: approve with one meaning, or map to an approved verb.

Stale facts found while extracting: `README.md`, `BLOCK-ARCHITECTURE.md`, and the document-tree page say 14 block types and 7 components; `DOC_BLOCK_TYPES` and the block-vocabulary page say 23 types in 15 families. README calls the seventh op `blockAction`; code calls it `componentAction`.

### 2.4 Naming conflicts (one thing, many names; one name, many things)

| Terms | Problem |
|---|---|
| page, doc, document, bundle, doc.json, DocDocument | One concept, six words. MCP tool descriptions say 'page'; the structure standard says 'doc' and 'bundle'; the data model says 'document'. 'document' is also used for SequenceDocument, canvas document, AnnotationsDocument, and ProposalsDocument. |
| block, block type, component, family, component bundle | BLOCK-ARCHITECTURE D1a says components are not 1:1 with block types, but block-design says 'A block type is a component' and 'A block is a component, not a snippet'. 'component' also means a React component, the component-tree block type's rows, and MCP 'component tools' (docs_component_create creates a canvas or sequence sidecar). |
| 14 block types / 7 components, 23 block types / 15 families | README.md, BLOCK-ARCHITECTURE.md, and the document-tree page say 14 types. DOC_BLOCK_TYPES and the block-vocabulary page say 23. A change-set backup says 24. BLOCK-ARCHITECTURE has a four-part contract; block-design has six parts. |
| componentAction, blockAction, component action, typed action, action | README names the seventh op blockAction. The data model and doc-ops use componentAction. Other code also uses 'action' for PeekAction, OutlineAction, and DocPeekAction. |
| sidecar, asset | Canvas and sequence files are 'sidecars' in docs_component_create and the annotations page, and 'assets' in docs_asset_move. annotations.json and proposals.json are sidecars but not assets. .changesets/ is a 'corpus-level sidecar' outside every bundle. |
| finding, issue, violation, lint, rule, check, audit check, warning, warn | LintFinding, AuditFinding, DocValidationIssue, style_findings, and 'style violation' overlap. LintSeverity uses 'warning'; AuditFinding uses 'warn'. 'check' means a rule function, the docs_check tool, an audit checkId, and 'docs links check'. |
| proposal, staged proposal, staged diff, staged region, proposals/ (design) | 'proposal' means a staged op batch in proposals.json, and also a design-change proposal ('files a proposal' on the implementation-layer page, and the root proposals/ folder). |
| change-set, changeset, change set, Doc PR | The corpus uses 'change-set' (about 128 times). MCP tool names and descriptions use 'changeset'. CHANGESETS-DESIGN.md also says 'Doc PR'. |
| op, operation, typed operation, tree op, management change | 'operation' is also the item type of the interaction-surface block (addOperation). Tree ops and MCP management changes are separate from the seven ops. |
| stage, propose | MCP uses docs_proposal_stage. The docs-kernel session tool for the same act is propose_ops. |
| add/insert, remove/delete, set/update, write | Same act, two verbs: insertStep vs addRow, removeRow vs deleteBlock, setStepText vs updateCell, write_text vs updateBlock text, set_props vs updateBlock props. |
| search, grep | The CLI says 'docs grep'. MCP says docs_search. Both find text in rendered docs. |
| human surface, doc renderer, user view, human renderer, read surface, viewer, workbench | Several names for the human side. Same for the agent side: agent surface, agent renderer, agent view, agent-view.ts, markdown render, projection, projectToMarkdown, docs render. |
| surface | Means human or agent surface, the interaction-surface block type, the read surface, and 'interaction surfaces for intelligence' in the Core README. The writing-style page lists 'surface' as a metaphor to review. |
| section | Means an L2 doc folder, a heading section, a canvas section (the board container), a prompt-kit section node, and 'page or entire section' in docs_move. |
| layer, tier | 'layer' means the four doc layers, the translation layer, stack block layers, and DocTargetingLayer. 'tier' is used for the same root folders ('implementation tier', 'extension tier'). |
| annotation, comment, line annotation | 'annotation' means an annotations.json record and also a code-block side note (props.annotations, code.setAnnotation). README and design principles call annotations 'comments'. |
| session, docs-edit session, agent run, task | session_id names any editing actor. docs-edit session is a docs-kernel agent session. agent-kernel has its own session and run model. MCP uses 'task' and 'connection' for its own scope. |
| patch | Means a ledger patch (patch_id), a props patch returned by an action, and a canvas patch (canvas_apply_patch). |
| hash, content hash, expected_hash, revision hash, tree hash, annotations hash, component hash | One SHA-256 definition, many parameter names: expected_hash, expected_tree_hash, expected_annotations_hash, expected_component_hash, expected_proposals_hash. |
| authority, write authority, mutation authority, store | README says mutation authority; the data model says write authority; code says DocsStore and store. The canvas and sequence engines are also 'authorities'. |
| resolve | Means close an annotation, compute a file path (resolveDocBundleJsonPath), and a target that still exists ('resolves' versus 'dangles'). |
| discover, discovery | Means GET /api/blocks block discovery and docs_discover project discovery. |
| project | Means an MCP docs project, the canvas project as authority, an Observatory registry project, and any project that renders the Global theme. |
| text-range, text_range, canvas-object, custom_element, visual_point | The schema uses text-range and canvas-object. The annotations page lists text_range, visual_point, and custom_element as target kinds. |
| model, agent | 'model' means the data model (docs-model) and also an LLM (model-judged rules, judgment engine). 'agent' is the AI reader, and 'agent-request' is an annotation intent. |
| registry | Means the component registry, THEME_TOKEN_REGISTRY, and Observatory registry.json. |
| entry | Means a change-set entry, a file-tree or file-explorer entry, a ledger entry, and an area-page decision entry. |
| view | Means a canvas view crop, the agent view, the user view, a node view, and LabView. |

Note on change-set counts: raw doc.json files hold 119 matches of "change-set/change set", but only 11 are in authored prose. The rest sit in paths, block ids, code spans, and code blocks. In authored prose the counts are "change set"/"change-set" 11 and "changeset" 1 (section 1.3).

### 2.5 Candidate one-name rulings (input for the profile, not decided)

Each ruling combines the corpus counts (section 1.3) with the definitions above.

| Concept | Keep | Retire in prose |
|---|---|---|
| The file-backed unit a reader opens | **page** (MCP tools, 212 uses), with **bundle** = its folder and **doc.json** = its file | doc (noun), docs (as count noun), article. **document** only for the data-model object or in "document tree" |
| One unit of content | **block**, **block type** | element, widget, node (except ProseMirror "node view") |
| Code that owns block types | **component** (or **family**: pick one) | component as a synonym for block |
| Mutation vocabulary | **op** (the seven), **patch** (applied batch, unit of undo), **proposal** (staged batch), **change set** (group) | diff, mutation, edit (as noun), operation (except interaction-surface operations) |
| Lint vocabulary | **rule** (definition), **finding** (one match), **check** (verb, and `docs_check`) | violation, issue (except validation issue), diagnostic, lint (as noun), warning (as a noun for a finding) |
| Files beside doc.json | **sidecar** (JSON state), **asset** (file under `assets/`) | payload, attachment (except video/attachment asset kind) |
| People and machines | **reader**, **author**, **agent** | user, writer, person, AI, worker, model (for an LLM) |
| Folders | **layer** (root), **section** (a folder that is a doc), **folder** (disk) | tier, directory, group, chapter |
| Apps | **workbench** (the app), **viewer** (the package), **editor** (the in-place edit mode) | studio, app |
| Agent-facing output | **agent renderer** (function), **agent view** (its output) | projection, markdown projection, agent surface (except the concept page) |

---

## 3. STE baseline (heuristic)

Method (`scripts/corpus-ste.ts`):
- Sentences use docs-model `sentences()`. Length counts each inline-code span as one word (STE counts a technical name as one word). Headings, titles, table column headers are labels and skip length, voice and tense rules.
- Procedural = sentence starts with an imperative verb (compromise tag), directly or after a leading `If/When/To …,` clause, with a guard against noun-first starts like "Code blocks hold…". Spot-check precision ~85%. 560 procedural, 4,927 descriptive.
- Passive, progressive, perfect: compromise verb-phrase grammar, plus a be + participle regex for passive. Noun clusters: 4+ consecutive Noun-tagged terms, punctuation breaks a run. "Strict" uses compromise tags only. "Permissive" also accepts verb-tagged words between nouns (compromise tags `index`, `rebuild`, `block` as verbs).
- Spot-check precision (15-hit random samples): passive ~90%, procedural ~85%, strict noun cluster ~60% (compromise tags verbs as nouns in "CSS handles column wrapping", "auto saves style rail"). Treat cluster counts as an upper bound; a production rule needs a better tagger or a technical-name lexicon.

### 3.1 Rule totals

| Rule (draft threshold) | Hits | Pages | Rate | Realistic? |
|---|---|---|---|---|
| Semicolon | 401 fields | 76 | 8% of fields | Already a lint (403). Largest existing debt. |
| Passive voice | 322 | 84 | 5.9% of sentences | Yes as warning. Top forms: "was rejected" 21, "is validated" 9, "is set" 9, "are rejected" 8. |
| Unapproved word (starter list) | 251 | 71 | | Yes, after list tuning (see 3.3). |
| Sentence > 25 words, descriptive | 226 | 61 | 4.6% | Yes. p95 = 25 today. |
| Noun cluster 4+ (strict) | 178 | 69 | | Only with a technical-name exemption (see 3.4). Permissive: 469 / 91 pages. |
| Sentence > 20 words, procedural | 35 | 22 | 6.2% | Yes. p90 = 18 today. |
| Progressive (be + -ing) | 12 | 11 | 0.2% | Yes, cheap to enforce. ~3 of 12 are false positives (gerund nouns). |
| Perfect (has/have/had + participle) | 10 | 7 | 0.2% | Yes, cheap to enforce. 4 of 10 are on the manifesto. |
| Paragraph > 6 sentences | 7 paragraphs | 4 | 1% of 703 | Too loose to matter. > 4 hits 58, > 5 hits 21. |
| Any -ing verb form (info only, STE rule 3.6) | 811 | 98 | | A full STE -ing ban would be expensive. Keep the profile limited to progressive. |

### 3.2 Sentence length distribution (words, literals = 1 word)

| Set | n | p50 | p75 | p90 | p95 | max | > 20 | > 25 | > 30 |
|---|---|---|---|---|---|---|---|---|---|
| All sentences | 5,487 | 10 | 15 | 21 | 25 | 91 | 552 (10%) | 240 (4.4%) | 95 |
| Procedural | 560 | 10 | 13 | 18 | 21 | 40 | 35 (6.2%) | 14 | 2 |
| Descriptive | 4,927 | 10 | 15 | 21 | 25 | 91 | 517 (10.5%) | 226 (4.6%) | 93 |
| Paragraph blocks | 1,658 | 13 | 17 | 23 | 28 | 56 | 243 | 122 | 39 |
| List items | 2,262 | 11 | 16 | 21 | 25 | 91 | 278 | 108 | 51 |
| Callouts | 64 | 16 | 21 | 27 | 32 | 59 | 17 | 9 | 5 |

Threshold sensitivity, descriptive: > 18 → 15%, > 20 → 10.5%, > 22 → 7.4%, > 25 → 4.6%, > 30 → 1.9%. Procedural: > 15 → 16%, > 18 → 8.6%, > 20 → 6.2%, > 25 → 2.5%. Counting each inline-code span as one word raises descriptive > 25 hits from 193 to 226 (+17%) compared with the current `wordCount()`, which drops literals. Callouts and paragraphs run long; tables, state-shape, file-tree notes, and process-outline steps are already short (p95 ≤ 13).

### 3.3 Unapproved-word hits

| Word | Hits / pages | Approved swap |
|---|---|---|
| require | 48 / 25 | need / must |
| may / might | 32 / 23 | can, or state the condition |
| whether | 24 / 19 | if |
| should | 22 / 18 | must, or imperative |
| allow | 19 / 14 | let |
| provide | 17 / 16 | give / supply |
| simply / just / easily | 14 / 11 | delete |
| multiple | 12 / 8 | many / more than one |
| via | 11 / 10 | through / with / by |
| e.g. / i.e. / etc. | 9 / 6 | for example / that is |
| really / very / actually / basically | 7 / 7 | delete |
| additional | 6 / 6 | more / other |
| modify | 6 / 5 | change |
| determine | 5 / 4 | find / decide |

The classic bloat words are almost absent: utilize, leverage, facilitate, ensure, numerous, initiate, and perform each hit once or twice. "In order to", "prior to", "approximately", "commence", "terminate", "sufficient", and "obtain" hit zero. Most single hits are in `99-appendix/10-style-guide/10-writing-style`, which **lists the banned words** (18 of its 30 STE hits). The vocabulary rule needs a mention-vs-use exemption (quoted words, or a "do not write" example marker). The real cost of an STE dictionary is in modals (`may`, `should`) and the verbs `require`, `allow`, `provide`, `whether`.

### 3.4 Noun clusters

Most frequent strict 4+ clusters are technical names that STE would allow as one unit: "multi document change sets" 3, "atom leaf node `x`" 3, "docs mcp style gate" 2, "delta span text model" 2, "child list item blocks" 2, "docs system package graph" 2, "docs cli export command" 2. Real clusters to rewrite look like "sidecar's canvas object target `x`", "entry proposal's base hash", "memory key insertion order". Hits sit mostly in list items (118) and tables (33). A cluster rule must treat a registered multiword technical name (e.g. "list item", "change set", "state schema") as one noun before it counts.

### 3.5 Top 10 offending pages

Score = sum of procedural > 20, descriptive > 25, paragraph > 6, semicolon, passive, progressive, perfect, strict noun cluster, unapproved word.

| Page | Sentences | Score | per 100 sent. | Semicolon | Passive | Long (desc+proc) | Cluster | Unapproved |
|---|---|---|---|---|---|---|---|---|
| `10-system-design/40-block-vocabulary/40-structured-reference/10-state-shape` | 156 | 76 | 48.7 | 37 | 4 | 10+2 | 10 | 13 |
| `10-system-design/40-block-vocabulary/40-structured-reference/30-structured-table` | 155 | 67 | 43.2 | 16 | 9 | 18+2 | 15 | 5 |
| `10-system-design/30-data-model/50-mutation-model` | 91 | 52 | 57.1 | 14 | 18 | 12+0 | 4 | 4 |
| `10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline` | 292 | 50 | 17.1 | 12 | 13 | 3+4 | 12 | 6 |
| `10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface` | 147 | 46 | 31.3 | 16 | 6 | 7+1 | 10 | 6 |
| `10-system-design/40-block-vocabulary/50-flow-and-diagrams/50-canvas` | 90 | 46 | 51.1 | 19 | 7 | 8+4 | 2 | 6 |
| `10-system-design/40-block-vocabulary/50-flow-and-diagrams/40-sequence` | 88 | 44 | 50.0 | 16 | 8 | 11+1 | 5 | 3 |
| `30-implementation/10-packages` | 44 | 37 | 84.1 | 9 | 9 | 11+0 | 4 | 4 |
| `10-system-design/40-block-vocabulary/20-code/10-code-block` | 171 | 31 | 18.1 | 12 | 4 | 7+1 | 1 | 6 |
| `99-appendix/10-style-guide/10-writing-style` | 165 | 30 | 18.2 | 0 | 5 | 1+3 | 3 | 18 (mostly mentions) |

Highest rate (pages with ≥ 30 sentences): `30-implementation/10-packages` 84.1, `50-mutation-model` 57.1, `30-implementation/20-workbench` 51.4, `50-canvas` 51.1, `40-sequence` 50.0, `10-state-shape` 48.7, `60-implementation-layer` 44.4, `30-structured-table` 43.2, `30-annotations` 42.6, `10-document-tree` 41.4.

The block-vocabulary reference pages dominate. They share boilerplate. One sentence, "When creating or revising a worked component example, show the relevant state shape with a concrete instance, the real operation signature…" (28 words), repeats on 8+ pages. Fixing shared boilerplate clears many hits at once.

Per-page CSV: `raw/corpus-ste-pages.csv`. Every hit with evidence: `raw/corpus-ste-hits.json`. Every sentence with length and procedural flag: `raw/corpus-ste-sentences.csv`.

### 3.6 Which thresholds are realistic

- **Keep as drafted:** procedural ≤ 20 (6% over), descriptive ≤ 25 (4.6% over), no progressive, no perfect (both under 0.3%).
- **Tighten:** paragraph ≤ 6 sentences almost never fires (7 of 703). ≤ 4 sentences fires on 58 and would actually shape text.
- **Ship as warning first:** passive (5.9% of sentences), unapproved words (once the list is tuned and mentions are exempt), noun clusters (only after technical names are registered).
- **Highest-value single rule:** "one name per thing" for the page unit and pending-change clusters. 52 pages mix page/doc/document/bundle today.

---

## 4. Existing `bun run docs audit`

Exit 1. **225 errors, 809 warnings** (`raw/corpus-audit.txt`, `raw/corpus-audit-by-rule.txt`).

| Rule | Severity | Count |
|---|---|---|
| writing.semicolon | warn | 403 |
| writing.no-em-dash | error | 221 |
| structure.label-colon-opener | warn | 210 |
| writing.sentence-length (> 30 words) | warn | 80 |
| structure.list-item-sentences | warn | 56 |
| structure.heading-title-case | warn | 52 |
| structure.list-length | warn | 4 |
| writing.dense-paragraph (> 120 words) | warn | 2 |
| structure.deep-list | warn | 2 |
| E2 (bad dir name: `docs/assets`, `docs/assets/sequences`) | error | 2 |
| E4 (`docs/assets/sequences` missing doc.json) | error | 1 |
| bundle-relative-src | error | 1 |
| writing.filler | warn | 0 |

Top pages by audit findings: `30-implementation/10-packages` 71, `40-structured-reference/10-state-shape` 48, `10-packages/10-docs-model` 45, `30-implementation/40-theming` 44, `10-packages/80-external-canvas` 35.

Notes:
- 221 of the 225 errors are em dashes. The other 4 come from a stray `docs/assets/` folder at the docs root.
- `writing.filler` fires 0 times. Its 4 phrases are already gone from the corpus.
- The STE semicolon rule duplicates `writing.semicolon` (401 vs 403). The STE sentence rule supersedes `writing.sentence-length` (> 30, 80 hits).
