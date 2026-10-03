# Codecaine STE: Research Report

Date: 2026-10-02. This report merges 5 research passes. Each source report is listed in the [Source Files](#source-files) section at the end.

## Design: Prime, Then Verify

- **Prime.** Writers (agents) are told to write in ASD-STE100 plus our house style. Models already know STE, so one line of prompt brings a full, consistent rule set.
- **Verify.** Lints, Jev judgment rules and a cheap rewrite model check the output and clean it up. Every change is staged as a proposal for review.
- **Base vocabulary.** The full STE approved-word dictionary is the base. A word that our docs or your speech rarely use is still allowed. Our technical nouns and verbs extend the base, and the replacement tables sit on top.
- **Local only.** The full STE Issue 9 dictionary and rules are extracted to `ste100/`. That folder is gitignored and is never pushed.

## Summary

1. **These are the problems that fire most in our docs today.** The counts below show where cleanup work is, not which words are allowed. Classic STE targets ("utilize", "in order to") are rare here:
   - **One thing, many names:** 52 of our 108 pages mix page, doc, document and bundle.
   - **Semicolons:** 401.
   - **Passive voice:** 322.
   - **Long sentences:** 261.
   - **Modal and vague verbs:** may, should, require, allow, provide.
2. **The word set has four layers we build ourselves:**
   - technical nouns, which is our glossary
   - technical verbs
   - a replacement table
   - a list of banned filler words

   STE's own rule structure supports this. Issue 9, the current STE edition, already lists LLM and computing nouns, but it rejects core software verbs: run, create, call, return, build, render.
3. **The STE dictionary stays local.** It's copyrighted (ASD), so the full extract lives in the gitignored `ste100/` folder and is never pushed. Public style guides (Google, Microsoft, Red Hat, plainlanguage.gov) supply a 220-pair replacement list on top of it. 110 of those pairs are safe to autofix.
4. **The cheap rewrite model works today: GPT-6 Luna through codex-lb.**
   - Cost: $0 extra.
   - Time: about 5 minutes for a full pass over the corpus.
   - Quality: 40 of 40 test rewrites kept every code span and link.
   - Draft BAML file: compiles and passes its tests.
   - Qwen is a poor fit. It's slow, it reasons by default, and its slowest 10% of calls take 18 seconds.
5. **The highest-value single rule is "one name per thing."** It needs the naming decisions in section 1 first. Everything else plugs into the existing lint engine, Jev, and proposal and changeset system.

---

## 1. Decisions You Need to Make

### 1a. Naming

Your transcripts and the docs corpus agree on most of these. The recommendation comes first.

| Concept | Recommendation | Retire in prose | Evidence |
|---|---|---|---|
| What a reader opens | **page**. The folder is the **bundle** and the file is **doc.json**. | doc (noun), article; **document** is kept only for the data-model object | The MCP tools say "page". 52 pages mix the words today. You say "doc" 255 times and "page" 151 times. |
| Content unit in a page | **block** is one instance and **block type** is the kind. **component** means code only. | widget, element, node | All 3 sources agree. You use "component" for both meanings today (59 vs 56). |
| Page heading | **heading**. **header** means the UI region only. | header and subheader for page headings | You say "header" about 20 times as often, but "header" also means C header files in the decomp harness. **This is the biggest conflict.** |
| Stored agent conversation | **session**. "New thread" stays only as the UI action. | thread, chat, conversation (for agents) | You corrected this yourself: "instead of saying threads it should say sessions." |
| Spawned helper agent | **sub-agent**. **worker** is kept only for the harness worker role. | subagent, sub agent (8 spellings) | |
| Problem words | **bug** is a code defect, **error** is a message, **problem** is anything else | issue (as "problem") | STE doesn't approve "issue" in this sense. You use it 304 times. |
| Lint vocabulary | **rule** is the definition and **finding** is one match. **check** is the run (`docs_check`). | violation, diagnostic, issue, warning (as a noun) | One page (`80-authoring-lints`) uses 7 different words for these. |
| Change vocabulary | **op** (the 7 ops), **patch** (an applied batch), **proposal** (a staged batch), **change set** (a group) | diff, mutation, edit (noun), operation | 31 pages mix these. Also decide between "change-set" and "changeset". |
| Repos and folders | **repo**, **folder**, **workspace** (the multi-repo root) | repository, codebase, directory, dir | |

### 1b. STE Conflicts

STE and the mainstream style guides disagree on these. Pick one side for each.

1. **Should "run", "create", "call", "return", "build" and "render" be allowed as technical verbs?** Recommend yes. Without them the linter flags every page.
2. **Ensure vs make sure?** Recommend "make sure". STE approves it, and you say it 488 times.
3. **Click vs select?** Recommend "click" for mouse actions and "select" for choosing an option.
4. **Sufficient vs enough?** STE approves "sufficient" and Microsoft prefers "enough". Recommend "enough", because it is plainer.
5. **Simple future tense ("will")?** STE allows it and GitLab bans it. Recommend allowing it.

### 1c. Thresholds

The STE limits barely constrain our pages today, based on the baseline below.

- **Procedural sentences: 20 words.** Keep this. 6% of procedural sentences are over.
- **Descriptive sentences: 25 words.** Keep this. 4.6% are over.
- **Paragraphs: 6 sentences.** Tighten to 4. A limit of 6 fires on only 7 of 703 paragraphs. A limit of 4 fires on 58, enough to change how pages read.

---

## 2. The Word Set

| Layer | What it holds | Seed source | Size now |
|---|---|---|---|
| **Technical nouns** | Our project nouns, each with one definition | Corpus pages `30-data-model/*` (de facto glossary), `doc-schema.ts`, `lint/types.ts`, plus coined terms from your transcripts | 69 from the corpus + about 45 coined terms |
| **Technical verbs** | Verbs with one software meaning each | Code and tool names (render, stage, accept, resolve, lint…) plus the STE-rejected software verbs | 40 + about 12 |
| **Replacement table** | Unapproved word → approved word, marked autofix-safe or flag-only | `data/replacements.csv` (220 rows), plus your naming canon (1a), plus spelling variants | 110 autofix-safe · 15 safe only after a part-of-speech check · 95 flag-only |
| **Banned filler** | Words to delete | Your transcripts | ~12 |

Decisions to make about the word set:

- **No full approved-word allowlist in v1.** 1,233 distinct words cover 90% of our text, so an allowlist is feasible later. A deny-list plus registered nouns and verbs gets most of the value with far less false-positive noise. The MIT-licensed OpenSTE word list can serve as a v2 cross-check.
- **Verbs need rulings.** The corpus has 942 distinct verb roots. The metaphor verbs need one ruling each:
  - carry (115 uses)
  - own (124)
  - live (75)
  - stay (95)
  - govern (21)
- **Mention vs use.** The style guide page *lists* banned words, which accounts for 18 of its 30 hits. Words inside quotes or "do not write" examples must be exempt.
- **Multi-word technical nouns count as one noun.** Examples: "list item", "change set", "state schema". The noun-cluster rule needs this or 40% of its hits are false.

### Your Speech vs Your Docs

Your transcripts show three things: what you want to read, the names you actually use, and the filler you dictate. Filler like "whatnot", "and such" and "essentially" barely reaches the docs; `writing.filler` fires 0 times today. The banned-filler list matters most for two places:

1. **Rewrite-model inputs.** Agents echo your dictation into what they write.
2. **Prompts.** These include the kickoff messages you paste into new sessions.

Your stated reading targets, which the profile should encode:

- 6th–7th grade reading level, ADHD-friendly.
- Bullets and sub-bullets over prose. Put each clause after a semicolon on its own sub-bullet; don't just split it into two sentences.
- Literal names, the same in the UI, docs and code.
- **"Concise" means tighter wording, not less content.** The rewrite tier must not delete information.
- Define each internal term on first use. 37 + 30 "what does X mean" and "I'm confused" messages followed undefined terms.

---

## 3. Where Each Rule Runs

| Rule | Tier 1: Lint | Tier 2: Jev | Tier 3: Rewrite |
|---|---|---|---|
| Replacement table, autofix-safe rows | **autofix** | | |
| Naming canon (doc system → docs system, subagent → sub-agent, mock-up → mockup…) | **autofix** where 1:1 | | when context-dependent |
| Banned filler (whatnot, and such, essentially…) | **autofix**, with re-capitalization | | |
| One name per thing (mixing page/doc/document on one page) | **flag**, per page | | yes |
| Sentence length 20 / 25 (a code span counts as 1 word) | flag | | yes |
| Paragraph ≤ 4 sentences | flag | | yes, split |
| Semicolons, em dashes | flag (rules exist) | | yes, **to sub-bullets** |
| Progressive / perfect tense | flag (<0.3% of sentences, cheap) | | yes |
| Passive voice | flag as a warning | "Is this passive necessary?" | yes |
| Modals: should / may / might | flag | | yes, to must / can |
| Noun cluster ≥ 4 | flag (after technical nouns are registered) | | yes |
| Flag-only replacement rows | flag | | yes, with the options as hints |
| One topic per sentence | | **judge** | yes |
| One instruction per step | | **judge** | yes |
| Condition before instruction | | **judge** | yes |
| Internal term used before it is defined | glossary lookup | judge if ambiguous | add a link or definition |

**A design point the research surfaced:** you want semicolons and long prose turned into bullets and sub-bullets. That changes the block structure, for example one paragraph becoming a list. The rewrite tier therefore needs two kinds of output:

1. `updateBlock` ops, for in-place rewrites.
2. `insertBlock`, `deleteBlock` or `moveBlock` ops, for a paragraph that becomes a list.

The current `LintFinding` has no fix field, so a `fix?: DocOp[]` field must be added in either case.

---

## 4. The Rewrite Model Stack

| Role | Model and route | Reasoning | Cost per full pass | Time per pass, 16 calls at once |
|---|---|---|---|---|
| Primary, local | `gpt-6-luna` via codex-lb (`127.0.0.1:2455/v1`) | low (0 reasoning tokens measured) | **$0 extra** | **4.9 min measured**, 2.8 min on the priority tier |
| Primary in CI | `openai/gpt-6-luna` on OpenRouter | none | $0.13–0.29 | ~2.2 min |
| Fallback from another vendor | `mistralai/mistral-small-2603` | none | $0.16–0.41 | ~2 min |
| Strong retry, for the ~10–15% of blocks that fail verification | `gpt-6.1-sol` | low | $0 via codex-lb | +1–2 min |

How one block is handled:

1. **Protect.** Mask code spans and links as `⟦n⟧`, so byte identity holds by construction.
2. **Rewrite on Luna.**
3. **Verify.**
   - Every protected token is restored exactly once.
   - Length changes by no more than ±40%.
   - The lint re-run fixes at least one targeted finding and adds none.
   - Ignore the model's own fix claims: Luna over-claimed once.
4. **Retry on Sol** if verification fails. If that fails too, skip the block and report it.
5. **Stage** one proposal per page, and group the proposals into changesets for your review.

Problems found during testing that change the build:

- **A BAML fallback chain fails without every client's key.** It needs every key up front, so a missing `OPENROUTER_API_KEY` breaks the Luna calls too. Build the chain at runtime from the routes that are actually available.
- **Bad output does not trigger a BAML fallback.** The retry with the stronger model has to live in TypeScript.
- **JSON mode through codex-lb needs the word "json" in the user message.**

**Policy check before bulk runs:** codex-lb traffic uses the same ChatGPT-plan quota as your interactive Codex work. Make sure the plan terms cover bulk programmatic rewriting. The OpenRouter route avoids this question and costs under $1 per pass.

The only existing BAML pattern to copy is `canvas/packages/eval-suite/runner/baml_src/clients.baml`. It already points at codex-lb.

---

## 5. Baseline: The Corpus Today

There are 108 pages: 5,487 sentences and about 57.6k words.

| Problem | Hits | Pages |
|---|---|---|
| Semicolons | 401 | 76 |
| Passive voice | 322 | 84 |
| Unapproved words (starter list) | 251 | 71 |
| Descriptive sentences > 25 words | 226 | 61 |
| Noun clusters ≥ 4 (about 60% are true problems) | 178 | 69 |
| Procedural sentences > 20 words | 35 | 22 |
| Em dashes (existing error) | 221 | |
| Label-colon openers (existing warning) | 210 | |

Worst pages:
- the block-vocabulary reference pages: state-shape, structured-table, canvas, sequence and interaction-surface
- `50-mutation-model`
- `30-implementation/10-packages`, which has 84 hits per 100 sentences

**Quick wins:**
1. Fix the 221 em dashes. That clears 221 of the 225 lint errors.
2. Rewrite the one 28-word boilerplate sentence that repeats on 8+ block-vocabulary pages.
3. Fix two stale facts:
   - The README and BLOCK-ARCHITECTURE say "14 block types". The code has 23.
   - The README says `blockAction`. The code says `componentAction`.
4. Remove the stray `docs/assets/` folder at the docs root. It causes 3 more lint errors.

---

## 6. Build Plan

| Step | Work | Who | Time |
|---|---|---|---|
| 1 | Make the decisions in section 1 | You | 30 min |
| 2 | Profile data file and a generated glossary page (the source for lints, Jev, the style digest and the rewrite prompt) | Opus sub-agents | ~1 day |
| 3 | Tier 1 lints + `fix?: DocOp[]` on findings + autofix through `docs_fix_lints` | Opus sub-agents | 1–2 days |
| 4 | Tier 2 Jev rules, calibrated with `jev-lint-sample.ts` | Opus sub-agent | ½ day |
| 5 | `packages/docs-rewrite` (BAML + pipeline + a `docs rewrite <section>` command), pilot on the 10 worst pages, then the full corpus | Opus sub-agents | ~1 day + review |

On step 2, keep the word set as typed data in `docs-model`, for example `writing/ste/profile.ts`, and generate the glossary page from it. The existing corpus-contract test already ties rule IDs to the docs this way. The alternative is to parse the word set from a docs page. That is attractive, but lints would then break whenever someone edits the page.

---

## Source Files

All under `/tmp/ste-research/`. This folder is wiped on reboot, so move anything you want to keep.

| File | What it holds |
|---|---|
| `reports/1-claude-transcripts.md` | Your Claude Code messages: terms, 28 synonym clusters, 40 correction quotes, coined terms, dictation errors |
| `reports/2-codex-transcripts.md` | Your Codex messages: 162 terms, ~30 clusters, 40 quotes, draft mappings |
| `reports/3-corpus-and-glossary.md` | Corpus vocabulary, 69 technical nouns, 40 verbs, 29 naming conflicts, STE baseline per page |
| `reports/4-wordlists-and-ste.md` | STE Issue 9 facts, copyright, public word data, tooling choices |
| `reports/5-rewrite-model-stack.md` | codex-lb, BAML, model table, cost, pipeline design |
| `data/replacements.csv` | 220 candidate replacement pairs |
| `rewrite-draft/rewrite.baml`, `rewrite-draft/rewrite-pipeline.ts` | Draft rewrite function and pipeline |
| `raw/messages.jsonl` | **Private.** Full text of your Claude Code messages. Delete it when you're done. |
| `dl/ASD-STE100_ISSUE9.pdf` | The official STE spec. **Don't commit it.** |
