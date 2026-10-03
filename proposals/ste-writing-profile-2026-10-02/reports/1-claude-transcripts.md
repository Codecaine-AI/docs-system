# Codecaine STE research 1: Ford's own words in Claude Code transcripts

Source: `~/.claude/projects/` (51 project folders, 152 top-level session files, 1.9 GB).
Scripts: `/tmp/ste-research/scripts/01_extract.py` … `11_spelling_variants.py` (shared helpers in `common.py`).
Raw outputs: `/tmp/ste-research/raw/` (file list at the end).

## Key findings

1. **Ford names things by role, and the same word often carries 2–3 roles.** "agent" (433 uses), "doc" (255), "run" (235), "thread" (59), "check" and "pass" each mean different things in different projects. STE's "one word = one meaning" rule will hit these words first.
2. **There are near-tied synonym pairs that need a ruling.** "component" 59 vs "block" 56. "doc system" 20 vs "docs system" 17. "state shape" 9 vs "state structure" 9. "header/subheader" 23 vs "heading" 3. "sub-agent" is spelled 8 ways.
3. **Ford's style corrections are consistent and testable.** He wants bullets and sub-bullets instead of prose. He wants no em dashes ("should remain banned globally"), no "colon then sentence", title-case headings, short lines, no fluff, and no vague phase names. These map directly to lint rules.
4. **He renames things when the name stops matching the behavior.** Examples: Tailor → (renamed, "no longer tailing files"), knowledge bases → knowledge sources, attempts → submissions, "Semantic Knowledge Base" → "New Features". Precise naming is a felt need, not a style preference.
5. **Voice dictation adds noise the profile has to tolerate on input.** "like" is 24 per 1k words (about 10/1k as pure filler). Product names are misheard ("fire crawl", "agent colonel", "Curate" for Kurate, "cue" for queue, "unswap" for unslop). An input-side alias table is needed in addition to the output-side approved dictionary.

## 1. Method and corpus

| Item | Value |
| --- | --- |
| Session files scanned | 152 top-level `.jsonl` (776 subagent transcripts in `*/subagents/` skipped) |
| `type:"user"` entries | 24,688 |
| Kept as human-typed | **1,555 unique messages**, 92,773 words, 37 project folders |
| Date range | 2026-04-21 → 2026-10-02 |
| Entry points | claude-desktop 556, cli 520, sdk-ts (T3 Code) 479 |
| Message length | median 34 words, mean 59, p90 145 |

What was excluded:

- **Tool results** (19,548), plus `isMeta`, `isSidechain`, and compact summaries.
- **Task notifications and peer messages** (2,891).
- **Injected tag blocks.** `<system-reminder>`, `<command-*>`, `<local-command-*>`, `<task-notification>`, `<t3_context>` attachment metadata, `[Image …]` / `[Attached image …]` placeholders, skill/CLAUDE.md injections, and "This session is being continued…" summaries.
- **Model-written briefs pasted as prompts** (17), detected by heuristic: long, no speech markers, many em dashes, arrows, semicolons, or backticks.
- **Pastes over 4,000 characters** (18) and **exact duplicates** (139).

`<pasted_content>` blocks were kept only when they read as dictation (97 messages). Ford's voice app often delivers dictation as a paste. URL-only and structured pastes were dropped (6). Long mixed-alphanumeric tokens, key-like strings, and emails were replaced with `[REDACTED]` (22 spots).

Caveat: a few kept messages still contain short agent-written fragments that Ford pasted inline. They do not change the rankings.

## 2. Filler (dictation) stats

| Marker | Count | Per 1k words | Messages |
| --- | --- | --- | --- |
| "like" (all uses) | 2,224 | 24.0 | 635 |
| "like" as filler (", like", "it's like", …) | 904 | 9.7 | 350 |
| "just" | 777 | 8.4 | 474 |
| "please" | 415 | 4.5 | 389 |
| "I think" | 205 | 2.2 | 163 |
| "whatnot" | 168 | 1.8 | 133 |
| "kind of" | 165 | 1.8 | 123 |
| "and such" | 160 | 1.7 | 145 |
| "or something (like that)" | 160 | 1.7 | 139 |
| "things/stuff like that" | 153 | 1.7 | 122 |
| "actually" | 153 | 1.7 | 122 |
| "essentially" | 91 | 1.0 | 81 |
| "in the sense that" | 51 | 0.6 | 48 |

Vague nouns and hedges that a rewrite pass should remove (from `08_verbs_and_wordy.py`):

- **Vague nouns.** "thing(s)" 679, "whatever" 99, "stuff" 85, "pieces" 62.
- **Wordy phrases.** "make sure" 129, "figure out" 102, "a little bit" 83, "go through" 77, "as well" 63, "in the sense that" 51.
- **Hedging adverbs.** "fully" 55, "specifically" 39, "currently" 38, "generally" 35, "properly" 34, "honestly" 33.
- **Grammar patterns STE restricts.** About 355 progressive "is/are X-ing" forms and 222 passives.
- **Classic STE targets almost never occur in his speech.** "utilize" 0, "leverage" 0, "in order to" 1, "prior to" 6. The replacement table should come from his own habits (above), not from the aerospace list.

## 3. Top technical terms by domain

Counts are occurrences in the 1,555 messages (inflections folded), with the number of project folders (p). Full lists are in `raw/domain_terms.json`, `raw/ngrams_{1,2,3}.csv`.

### Agents and LLMs (≈30)

agent 433/25p · prompt 151/14p · eval 135/7p · context 128/17p · worker 125/9p · tool 90/11p · sub-agent 83/22p · librarian 73/1p · thread 59/15p · spawn 52/17p · model 49/17p · trace 49/11p · kernel 46/11p · skill 43/13p · system prompt 41/8p · turn 37/11p · Codex 31/13p · Opus 30/13p · Fable 28/6p · evaluation 28/6p · harness 28/9p · classification 27/4p · extractor 25/4p · LLM 23/9p · Jev 21/5p · MCP 20/5p · agent kernel 20/7p · transcript 19/9p · token 16/11p · Luna 15/4p · tool call 13/4p · summarizer 13/2p · Terra 12/3p · BAML 11/3p · context block 9/3p · runner 9/4p · judge 7/2p · structured output 5/4p

### Docs system (≈30)

doc/docs 294/25p · page 151/22p · section 105/18p · diagram 66/15p · component 59/10p · block 56/11p · canvas 45/7p · rule 42/13p · lint 41/7p · standard 39/8p · table 36/8p · markdown 23/11p · bullet point 22/10p · spec 22/8p · doc system 20/12p · docs system 17/11p · file tree 17/7p · header 16/8p · annotation 15/2p · unslop 15/2p · code block 14/3p · blog post 14/2p · sub-bullet 11/5p · technical writing 11/1p · state shape 10/4p · state structure 9/5p · JSON block 8/5p · callout 8/1p · sequence diagram 7/3p · writing style 7/3p · custom component 6/4p · subheader 6/4p · process outline 4/3p · lint gate 4/2p

### UI and frontend (≈28)

UI 143/20p · color 54/9p · sidebar 52/13p · icon 36/9p · app 33/15p · click 31/12p · card 29/10p · layout 28/12p · rendering 27/9p · tab 26/7p · HTML 25/9p · viewer 24/11p · screen 23/11p · UX 19/10p · dashboard 19/4p · editor 19/5p · styling 17/7p · border 15/6p · frontend 15/4p · panel 13/6p · font 12/2p · style sidebar 11/6p · tooltip 11/5p · dark mode 10/3p · light mode 7/4p · mockup 9/5p · agent viewer 6/3p · eyebrow 4/1p · zebra striping 3/2p · drag and drop 4/2p

### Infra and tooling (≈28)

PR 137/9p · push 56/17p · branch 52/14p · repo 51/18p · sync 41/5p · JSON 37/12p · commit 35/13p · local 35/11p · merge 30/5p · API 28/10p · queue 24/6p · dev 23/7p · sandbox 23/6p · config 22/9p · port 19/8p · UAT 19/3p · database 18/6p · Chrome 18/10p · restart 17/6p · concurrency 15/4p · Codex LB 12/5p · webhook 12/1p · server 11/5p · deploy 10/3p · GitHub 10/8p · merge conflict 9/2p · API key 8/4p · SQLite 6/4p · endpoint 6/5p

Frequent action trigrams: "commit and push" 19, "push to main" 11, "update the docs" 7, "run the full (eval)" 6.

### Code structure and data (≈25)

file 137/26p · target 129/5p · message 126/19p · state 118/15p · data 102/14p · type 82/21p · fact 69/7p · shape 65/16p · object 57/15p · structure 52/17p · folder 35/18p · function 33/7p · knowledge base 32/6p · entity 29/3p · record 29/9p · event 25/5p · variable 15/5p · field 14/8p · knowledge system 12/2p · knowledge record 12/1p · ledger 12/2p · node 10/4p · enum 8/5p · schema 7/3p · data model 5/3p · translation unit 5/1p

### Process and workflow (≈30)

run 235/23p · process 141/21p · review 126/18p · confirm 71/19p · test 61/19p · flow 57/13p · audit 48/12p · report 48/10p · clean up 48/15p · step 46/15p · attempt 43/2p · research 42/12p · pass 41/12p · criteria 38/6p · plan 35/9p · implement 33/16p · phase 30/9p · backfill 29/2p · goal 29/6p · objective 24/2p · QA 23/10p · draft 23/8p · feedback 21/10p · parallel 21/7p · verify 19/7p · epoch 18/1p · pipeline 16/9p · brainstorm 15/9p · status update 12/6p · handoff 9/3p · fan out 8/4p · blast radius 7/4p

Command verbs (word after "please" / "can you" / "let's"): make 61, do 42, say 28, give 22, **spawn 21**, look 20, update 20, write 17, use 16, remove 11, commit 9, apply 9, implement 8, run 8, move 8, push 8, kill 8, explain 8, check 7, audit 7, fix 6, open up 6, add 6, restart 5, fan out 4.

## 4. Synonym clusters

Format: variant = count (messages). The recommendation picks one canonical term per meaning. Where Ford uses one word for two meanings, the split is stated. Quotes are ≤15 words, verbatim.

### 4.1 Unit of documentation: doc / page / document / bundle

| Variant | Count | Example |
| --- | --- | --- |
| doc | 255 (175) | "can we make a doc that gives us these productization steps" |
| page | 151 (103) | "in the actual docs pages, things aren't lining up correctly." |
| document | 25 (22) | "Have a document that references each of these things." |
| bundle | 6 (2) | "Yeah, we can keep bundles for now." |
| markdown file | 4 (4) | "Then make a markdown file with the links" |

**Recommend "page"** for one unit in the docs system, matching the tools, the tree, and `docs_read`. "doc" is Ford's habit, but it also means the docs corpus, Markdown docs, and HTML docs. "bundle" is the on-disk folder only (internal). "document" is reserved for non-docs-system artifacts (HTML, PDF).

### 4.2 Product name: doc system / docs system

doc system 20 · docs system 15 (+ docs-system 1, Docs system 1) · docs tools 2.

- "where would this fit into our doc system context and whatnot?"
- "can you please write this into a docs system doc instead of markdown"

**Recommend "docs system"** (matches repo `docs-system` and `docs_*` tools). Add "doc system" to the replacement table.

### 4.3 Unit inside a page: component / block

| Variant | Count | Example |
| --- | --- | --- |
| component | 59 (40) | "can you please use the custom components we have like state shape" |
| block | 56 (49) | "Disable the zebra striping in all the code block type sections" |
| componentry | 2 | "call stack, componentry, and flowstrip are not process outlines." |
| element | 1 | (not about docs) |

**Open decision for Ford.** The doc model uses `blockType`, `blockId`, and "block vocabulary". Ford says "custom component" for typed blocks and "component type" for kinds. Proposed split: **"block"** = an instance in a page, **"block type"** = the kind (process outline, state shape), **"component"** = only the React or code implementation. "componentry" appears to be dictation for the component-tree block and should map to "component tree".

### 4.4 Delegated agent: agent / worker / sub-agent / thread

| Variant | Count | Example |
| --- | --- | --- |
| agent (bare) | 433 (262) | "The call flow agent would then steer the conversation and whatnot." |
| worker | 125 (76) | "How many epochs and worker runs have we done for it?" |
| sub-agent | 83 (71) | "please spawn opus sub agents to go implement this" |
| thread | 59 (46) | "can I have message for a new thread that would run this process" |

These are four different things, not synonyms:

- **"sub-agent"** is a helper that the coding assistant spawns. It is spelled 8 ways: sub-agents 28, subagents 18, sub agents 16, sub-agent 10, subagent 6, and others. Standardize on "sub-agent".
- **"worker"** is a runtime role in harnesses. In the decomp harness, the worker claims a target and makes submissions.
- **"thread"** is a separate top-level chat that Ford starts with a handoff message.
- **"agent"** without a qualifier is too broad for STE. Require a qualifier: call flow agent, canvas agent, librarian agent, layout-editor agent.

### 4.5 Writing-quality checks: lint / rule / standard / check

| Variant | Count | Example |
| --- | --- | --- |
| lint | 48 (27) | "Make sense, similar to how the worker lint gate works?" |
| rule | 42 (34) | "I feel like the voice rules are overly verbose." |
| standard | 39 (26) | "Some of this may go into the actual standards docs themselves." |
| check | 34 (30) | "Both pages pass docs_check with zero findings." (pasted status) |
| guideline / style guide | 1 / 0 | n/a |

**Recommend a hierarchy, not synonyms:**

- A **rule** is one requirement.
- A **standard** is a named set of rules (a standards page).
- A **lint** is an automated test of one rule.
- A **lint gate** is a blocking set of lints.
- A **check** is one run of the lints (`docs_check`).

Do not use "guideline" or "guidance" for rules.

### 4.6 Making sure something is right: review / confirm / audit / check / QA / verify / validate

| Variant | Count | Example |
| --- | --- | --- |
| review | 134 (84) | "Spawn some open sub-agents to go and review the UI." |
| confirm | 79 (71) | "Confirm all the evaluations are running through Codex LB now." |
| audit | 57 (47) | "Can you please do an audit on the purpose and goal?" |
| check | 41 (34) | "please check other env files and just copy them into the proper files" |
| QA | 23 (19) | "I want the QA pass to be visual, with a focus on:" |
| verify | 22 (16) | "verify that the librarian is actually doing what it's supposed to do" |
| validate | 8 (5) | "I would like you to just validate that they run." |

**Recommend:**

- **confirm** = state a yes/no fact about current state. This is Ford's usual question opener: "to confirm, …".
- **review** = read for quality.
- **audit** = full sweep that ends in a report.
- **QA** = hands-on UI testing.
- **check** = automated.

Fold "verify" and "validate" into "confirm". In this corpus they are used the same way.

### 4.7 Model instructions: prompt / system prompt / context / instructions

prompt 116 (85) · context 126 (79) · system prompt 41 (30) · instructions 8 (8).

- "In the extractor system prompt, do we really need the states definition?"
- "The output contract should be in the context block."
- "Yes, I'm making updates to the prompt right now, which is fine."

**Recommend:**

- **"system prompt"** = the fixed instructions.
- **"context block"** = the injected per-call data.
- **"prompt"** = the umbrella term only (as in Prompt Kit).

Never use "instructions" as a third name.

### 4.8 Record of what happened: trace / history / session / transcript / log

trace 49 · history 29 · session 25 · transcript 19 · log 5.

- "I'm looking at the traces for the agents that just ran."
- "I want you to look at the transcript and understand why it did this"
- "There is this agent, but we have multiple sessions with it."

**Recommend:**

- **trace** = Agent Kernel event record.
- **transcript** = the text of a conversation (phone call or chat).
- **session** = one runtime instance of an agent.
- **history** = only the named "Target History" view.

### 4.9 One execution: run / attempt / pass / epoch / cycle

run 235 (168) · attempt 43 · pass 41 · cycle 20 · epoch 18 · iteration 2.

- "Just stop or pause the run once the cue [queue] is filled."
- "Yeah, I like the term submission more, and the worker attempt is good."
- "For the previous epoch, how many targets did we actually process?"
- "The final thing would be a QA pass."

**Recommend "run"** as the general term. Keep "attempt" (parent) and "submission" (child), and "epoch" (batch of runs), as harness-specific defined terms. "pass" = one review sweep. Avoid "cycle" and "iteration".

### 4.10 Conversation unit: thread / session / conversation / chat

thread 59 · session 25 · conversation 21 · chat 1.

**Recommend:**

- **thread** = Ford's top-level chats with coding agents.
- **conversation** = phone-call content (CCBCU).
- **session** = runtime only (see 4.8).

### 4.11 Code container: repo / folder / project / workspace / codebase / directory

repo 51 · folder 35 · project 27 · workspace 18 · codebase 11 · directory 8 · repository 1.

- "Create a GitHub repo in Codecaine for this."
- "can you please just put this all in a folder on the desktop"
- "Please get the API from I believe a repo in the workspace called budget"

**Recommend:**

- **repo** (not repository or codebase).
- **folder** (not directory).
- **workspace** = the multi-repo root.
- **project** = a docs or prompt project ID only.

### 4.12 Planning artifacts: plan / objective / spec / handoff / proposal / brief

plan 35 · objective 24 · spec 22 · handoff 9 · proposal 4 · design doc 3 · brief 2.

- "Can you please update all of this in the plan doc?"
- "what is the link to the spec doc for this"
- "Can you please write a handoff message, like a short one, around this?"

**Recommend four defined terms:**

- **objective** = long-running goal bundle.
- **spec** = design page (90-specs).
- **plan** = implementation steps.
- **handoff** = the message that starts a new thread.

Ban "brief", "design doc", and "proposal" as synonyms.

### 4.13 Page heading: section / header / subheader / title / heading

section 105 · header 16 · title 9 · subheader 7 · heading 3.

- "We just need to say Tier 2, Tier 3, and Tier 1 as the headers there."
- "can we make it so that there's no subheader, just the header?"
- "I would like to use the heading case instead of sentence case"

**Recommend "heading" and "subheading"** in docs prose. "header" collides with C header files in the decomp harness ("instead of including/defining the header"). Ford says "header", so add header → heading to the replacement table. "title" = page title only.

### 4.14 Side UI region: sidebar / tab / panel / pane / rail

sidebar 53 · tab 26 · panel 13 · pane 2 · rail 2.

- "It either should be something in the sidebar or nothing at all."
- "I'd like all of this to be in the side details panel"

**Recommend:**

- **sidebar** = left navigation or the style sidebar.
- **details panel** = the right inspector.
- **tab**.

Avoid "pane" and "rail".

### 4.15 List items: bullet / sub-bullet / list

bullet / bullet point 49 · list 29 · sub-bullet 11 · "list item" 0.

- "Generally, across the librarian v2, I'd like to break this down to have sub-bullets a lot."

**Recommend "bullet" and "sub-bullet"** (Ford's terms). "list item" never appears in his speech.

### 4.16 Testing model output: eval / evaluation / test / judge

eval 135 · test 61 · evaluation 28 · judge 7.

- "These evals are qualitative, and it just isn't very consistent."
- "I restarted the agent, how do we test this worked?"

**Recommend:**

- **eval** (short form, about 5× more common) for model-output scoring.
- **test** for code tests and test calls.
- **judge** for the LLM grader.

### 4.17 Data contract: type / state shape / state structure / data shape / schema / data model

type 82 · state shape 9 · state structure 9 · schema 7 · data shape 5 · data model 5.

- "Okay, I think the state shapes look generally good."
- "The brand state structure is now split into a non-state structure component and the JSON block."

**Recommend "state shape"** (the block type name). Map "state structure" and "data shape" to it. Keep "schema" for database or JSON Schema.

### 4.18 Diagram surface: diagram / canvas / board / sequence diagram

diagram 66 · canvas 45 · sequence diagram 7 · board 6.

- "I'd also like a diagram in the docs that talks about this."
- "We recently rewrote the Canvas agent's system prompt and design context."

**Recommend:**

- **diagram** = generic.
- **Canvas** (capitalized) = the product or block.
- **board** = only inside Canvas tooling, where it means one canvas file.

### 4.19 Visual draft: mockup / design / preview / wireframe

design 46 · mockup 9 (spelled mockups 3, mock-up 3, mockup 2, mock up 1) · preview 3 · wireframe 1.

- "Can you please do an HTML mock-up of the proposed UI?"

**Recommend "mockup"**, one word with no hyphen.

### 4.20 User-facing surface: UI / app / viewer / dashboard / frontend

UI 118 · app 33 · viewer 24 · dashboard 19 · frontend 16 · interface 4.

**Recommend:**

- **UI** = generic.
- **viewer** = read-only renderer (docs viewer, trace viewer, agent viewer).
- **dashboard** = client operations screens.
- **app** = a deployable.

### 4.21 Make smaller: clean up / simplify / unslop / trim

clean up 27 + cleanup 12 (48 incl. inflections) · simplify 17 · unslop 14 · trim 1 · refactor 1.

- "Just simplify it down and clean up the UI."
- "I want to drastically simplify the UI."

**Recommend:**

- **simplify** = remove content.
- **clean up** (verb) / **cleanup** (noun) = fix inconsistencies.
- **unslop** = the skill name only.

### 4.22 Join parts: connect / integrate / wire up / hook up / tie in

connect 35 · integrate 15 · wire up 2 · hook up 2 · tie in 1. **Recommend "connect".** "integrate" is for systems. Ban the phrasal idioms.

### 4.23 Start delegated work: spawn / fan out / start / kick off / launch

spawn 54 · start 104 (generic) · fan out 8 · kick off 4 · launch 2.

- "Could you spawn a fable sub-agent to knock out this UI stuff?"
- "oaky can you please fan out the agents and do this process and come back"

**Recommend:**

- **spawn** = one agent.
- **fan out** = many agents in parallel. This is a defined term even though it is figurative.

Ban "kick off" and "knock out".

### 4.24 Change flow: PR / pull request; commit / push / merge / deploy / land / ship

PR 129 vs pull request 8 → **"PR"**.

push 63 · merge 59 · commit 39 · deploy 29 · land 13 (mostly the idiom) · ship 2. These are distinct git verbs, so keep them all except "land" and "ship". They are figurative.

### 4.25 Reviewer input: note / feedback / annotation / comment

note 42 · feedback 21 · annotation 15 · comment 8.

- "Did we drop the create annotation and such?"
- "I could then leave a comment on the diagram and stuff."

**Recommend "annotation"** for anchored threads on docs and canvases (matches the tool names). "note" is an annotation intent. Do not use "comment" for the same thing.

### 4.26 Stored knowledge: fact / knowledge base / record / knowledge system / knowledge source

facts 69 · knowledge base 32 · records 29 · knowledge system 12 · knowledge graph 4 · KB 1.

Ford's own ruling: "Instead of calling them knowledge bases, I'd like to call them knowledge sources".

**Recommend:**

- **knowledge source** = an input such as Discord, PRs, or the wiki.
- **knowledge base** = the store.
- **fact** = the unit.
- **knowledge record** = a stored row.

### 4.27 Defects: issue / error / bug / broken / problem

issue 50 · error 15 · bug 12 · broken 9 · problem 7.

**Recommend:**

- **bug** = code defect.
- **error** = an emitted failure message.
- **issue** = only a tracked item.

### 4.28 Setup: set up / setup / config / install

set up 105 · setup 34 · config 38 · install 6.

**Recommend** "set up" (verb), "setup" (noun), and "config" (the file or object).

## 5. Corrections and preferences (40 quotes)

Quotes are verbatim and trimmed to ≤25 words, with "…" marking a cut. All 195 filtered candidates are in `raw/corrections_strong.txt`; the full set is in `raw/correction_candidates.json`.

### Structure: bullets over prose

1. "with a fixed line length and very long prose, can you please adjust this to be in a bullet point with sub-bullet points" (Clients-…-ccbcu)
2. "Instead of using em dashes or two sentences and a thing, they go to a sub-bullet for that" (Codecaine-canvas)
3. "instead of a colon and then a sentence, it's a bullet point under the colon." (Codecaine-gamecube-decomp-harness)
4. "Every bold thing is like a header type … just like a head bullet … bring it down to sub-bullets." (oss-gamecube-decomp-harness)
5. "I want to make sure we maintain our current prompt structure, where we add things in bullet points and sub-bullets." (Codecaine-gamecube-decomp-harness)
6. "Generally, across the librarian v2, I'd like to break this down to have sub-bullets a lot." (Codecaine-gamecube-decomp-harness)
7. "Make it very clear for you're going through idea by idea instead of having to read long paragraphs" (Lascari-AI-agent-skills)
8. "except for maybe the pacing thing, where I like to have bullet points and short sentences." (Lascari-AI-agent-skills)
9. "Two separate documents that are almost like how-tos in Markdown and very, very concise and bullet-pointed" (Clients-HeyBubba-bubba-phone)

### Punctuation and case

10. "EM dashes should remain banned globally." (Lascari-AI-agent-skills)
11. "I would like to use the heading case instead of sentence case" (Lascari-AI-agent-skills)
12. "make sure that the headings and such are in title case so everything is consistent with my writing style." (Lascari-AI-agent-skills)

### Density, fluff, concision

13. "By simpler, I just mean there's too much wording on each of the lines." (lascari-ai-personal-site)
14. "I also want to drastically trim down a lot of it because there's just a lot of fluff content in here." (lascari-ai-personal-site)
15. "I feel like the voice rules are overly verbose." (Clients-…-ccbcu)
16. "Just like you're going through documentation, it can be very dense and hard to read." (Lascari-AI-agent-skills)
17. "The idea is to make things as readable as possible." (Lascari-AI-agent-skills)
18. "we probably need to reduce the number of texts on the screen … very concise." (Lascari-AI-Learning-presentations)
19. "I would just like to make sure that we don't overcomplicate them and make them have too much content" (codecaine-core-docs-system)
20. "I'm trying to make it a lot more digestible and consistent." (codecaine-core-docs-system)
21. "concisely, whats going on right now" (Codecaine-gamecube-decomp-harness). Variant: "so what is running right now, concisely" (Clients-…-kurate)
22. "Can we remove it saying still needed, we just say what it needs" (clients-active-…-ccbcu)

### Naming and nomenclature

23. "Instead of calling them knowledge bases, I'd like to call them knowledge sources" (Codecaine-gamecube-decomp-harness)
24. "We can maybe just call this target ledger if that makes more sense" (Codecaine-gamecube-decomp-harness)
25. "Maybe we don't even call it attempts, because here, it's each thing that we tried." (Codecaine-gamecube-decomp-harness)
26. "Yeah, I like the term submission more, and the worker attempt is good." (Codecaine-gamecube-decomp-harness)
27. "update all the nomenclature in the docs target and such around this called target, because I've been calling it target." (Codecaine-gamecube-decomp-harness)
28. "Would it be better to rename this to symbols or units, probably unit … so that we don't have any more of these … confusions?" (Codecaine-gamecube-decomp-harness)
29. "I feel like this should be renamed from Tailor because it's no longer tailing files." (Codecaine-agent-kernel)
30. "I don't like this fold naming convention." (Codecaine-Core-agent-kernel)
31. "I don't like Brand Triage." (Clients-…-kurate)
32. "Can we change "resolved brands" to "valid brands" in the filter there?" (Clients-…-kurate)
33. "For the section that says where plane goals break … call this constraints of vanilla goal mode" (lascari-ai-personal-site)
34. "call stack, componentry, and flowstrip are not process outlines. Like, process outline is the specific component type." (codecaine-core-docs-system)

### Vague or sloppy wording in model output

35. "The verbiage is a little confusing because it implies that this thing directly says that" (Codecaine-gamecube-decomp-harness)
36. "I want to remove this verbiage and just have it say, "decompile the claim target to 100%."" (Codecaine-gamecube-decomp-harness)
37. "for the out contract section can we remove the prose like: Return exactly one JSON object." (Codecaine-gamecube-decomp-harness)
38. "Yeah, I don't like the current phases because they're just very vague." (Codecaine-canvas)
39. "Stop slopping around, i believe in you that you can write a good prompt" (Codecaine-gamecube-decomp-harness)
40. "blends this ASD and whatnot and how we like to write things specifically for coding into … programmatic, JEV, and cheap LLM cleanups" (codecaine-core-docs-system)

### Recurring preferences (summary)

- **Bullet architecture.** A head bullet, then sub-bullets, one idea per line, instead of paragraphs, "colon + sentence", or bold run-in labels. This is the most repeated instruction across 5+ projects.
- **No em dashes, ever.** One audit Ford pasted counted "309 writing.no-em-dash errors" in legacy pages.
- **Title case for headings.** This is a stated personal preference over the unslop default of sentence case.
- **Short, concise, low density.** He asks for status "concisely" and says "too much wording on each line", "fluff", "overly verbose", and "too much going on". In UI copy he removes subheaders and helper copy ("we don't need the copy").
- **Names must match behavior.** He renames when a name is generic (attempts), misleading (Tailor, fold), or vague (phases, Brand Triage). He wants one consistent term once chosen ("I've been calling it target").
- **Consistency across surfaces.** The same code-block style, fonts, and theme everywhere ("there is not a consistent style").

## 6. Dislikes in model output and complaint themes

### Words and patterns Ford rejected

| Pattern | Evidence |
| --- | --- |
| Em dashes | "EM dashes should remain banned globally." Also "Instead of using em dashes…" |
| "Label: sentence" / bold run-in lead | "instead of a colon and then a sentence, it's a bullet point under the colon." "Instead of how it's bold and then at the same line…" |
| Long prose with fixed line length | "very long prose" → bullets |
| Boilerplate prompt prose | "remove the prose like: Return exactly one JSON object." |
| Vague stage names | "phases … just very vague" |
| Generic or misleading names | "attempts", "Tailor", "fold", "Brand Triage", "super seeds ID", "Semantic Knowledge Base" |
| Status labels that restate | "remove it saying still needed, we just say what it needs" |
| Subheaders and extra copy in UI | "no subheader, just the header", "we don't have the subheaders…", "We don't need the copy." |
| "Slop" in general | "Stop slopping around"; he has a dedicated **unslop** skill and banned-word list |
| Sentence-case headings | prefers title case |

### Complaint themes (messages matching, project count)

| Theme | Msgs | Projects |
| --- | --- | --- |
| Asking for precision ("exactly", "specifically", "vague") | 96 | 24 |
| Simpler / concise / clean up | 75 | 19 |
| Structure: bullets / sub-bullets / headers | 43 | 15 |
| Explicit dislike ("I don't like", "not great") | 41 | 13 |
| "Explain to me" / "walk me through" | 38 | 15 |
| Confusion ("I'm confused", "really confusing") | 37 | 13 |
| Naming / nomenclature / verbiage / rename | 28 | 11 |
| Readability ("hard to read", "easier to read") | 25 | 13 |
| Too much / overcomplicated / fluff | 21 | 12 |
| Consistency | 12 | 8 |
| Slop / unslop | 12 | 5 |

Confusion messages often follow model output that used internal terms without defining them. Examples: "What is this question, Path, and AskedPaths?", "What is this claim exclusivity for? What do you mean by that?", "What is this PR importer agent? I don't think we have one." This supports an STE rule: **define every internal term on first use, or link to the glossary.**

## 7. Coined and project-specific terms

Meanings are inferred from context. Counts are mentions in Ford's messages.

| Term | Count | Inferred meaning |
| --- | --- | --- |
| **Codecaine** | 18 | Ford's umbrella org/product line (core: docs-system, canvas, agent-kernel, prompt-kit; utilities: sotto; website) |
| **docs system** / doc system | 37 | Codecaine's typed documentation system (doc.json bundles, blocks, `docs_*` MCP tools, lints) |
| **Agent Kernel** / kernel | 46 | Codecaine runtime and tracing layer for agents (kernel state, traces, trace/agent viewer, prompt.json) |
| **Prompt Kit** | 13 | Codecaine package that holds prompt standards and formatting for model-facing prompts |
| **Canvas** | 45 | Codecaine diagram editor/board product with a layout-editor agent and MCP tools; also a docs block |
| **Jev** (JEV) | 21 | A structured/decision model family used for classification and judgment; planned for "Jev judgment rules" and cheap rewrite lints |
| **Sotto** | 2 | Codecaine utility forked from an upstream "sotto" project (likely the dictation app) |
| **Spectre** | 4 | Ford's "software factory"-type build; project with objectives and canvas-docs milestones |
| **unslop** | 15 | Ford's writing skill that removes AI-sounding wording; "unslopped" = cleaned by it |
| **P-Stack** | 3 | Upstream skill pack that the unslop and technical-writing skills came from |
| **GameCube decomp harness** | 21 | Agent harness that decompiles a GameCube game (Melee) with worker agents |
| **librarian** | 73 | Decomp-harness agent that maintains the knowledge base from PRs, Discord, and wiki on each sync |
| **target** | 129 | Unit of decomp work (a function or translation unit to match to 100%) |
| **entity** | 29 | Knowledge-base object (variable, struct field, game concept, pattern) |
| **epoch** | 18 | One batch of decomp worker runs between sync and reseed |
| **attempt / submission** | 43 | Worker attempt on a target (parent) and its individual tries (children) |
| **target history / target ledger** | 10 | Per-target record of every attempt and change |
| **tactic / pattern** | 21 | Reusable decomp techniques stored as knowledge |
| **knowledge record / knowledge source** | 12 | Linked fact rows / raw inputs (Discord, PRs, Smash wiki) |
| **drift** | 5 | Change upstream (renames in merged PRs) that makes stored facts stale |
| **Gale report** | 6 | External decomp progress report that lists targets and TUs |
| **TU** | 8 | Translation unit (one source file in decomp) |
| **worker summarizer** | 13 | End-of-run agent that summarizes a worker's run into the ledger |
| **lint gate / quality gate** | 5 | Blocking checks a worker or librarian output must pass |
| **Codex LB** | 12 | Local load balancer (fork) that routes AI calls through Codex accounts to save API spend |
| **Fable / Opus / Sol** | 28 / 30 / 1 | Model names used to pick sub-agents (Fable 5.1, Opus 5.5, GPT-Sol 6.1) |
| **Luna / Terra / Astra** | 15 / 12 / 5 | GPT model tiers used with effort ("Terra on low", "GPT-6 Luna", "GPT-6 Astra") |
| **T3 / T3 Code** | 2 (+479 sdk-ts msgs) | Desktop coding-agent app Ford uses, with an integrated browser |
| **BAML / Pi** | 11 / 12 | Structured-call library / multi-turn agent runtime used under the Agent Kernel |
| **Kurate** (dictated "Curate") | ~30 | Client project: skincare brand/product catalog with brand review, link finder, page classifier |
| **review bench** | 11 | Kurate evaluation UI for expert review |
| **brand review / brand criteria / brand gates** | 19 | Kurate pipeline stage that tests brands against ordered criteria |
| **product link finder / page fetcher / page classifier** | 8 | Kurate agents in the product-finding pipeline |
| **CCBCU** | 23 | Client project: voice/phone agent system (call flow agent, extractor, sales center, tiers, evals) |
| **call flow agent** | 16 | CCBCU agent that steers the live phone conversation |
| **tier (1–3)** | 43 | CCBCU incident severity levels |
| **objectives** | 24 | Long-running goal bundles (`objectives/`), also a blog post series on personal site |
| **goal mode** | 9 | Single-goal agent mode compared against the objectives system in a blog post |
| **AutoHDR** | 10 | Hackathon data-correction pipeline project; blog post subject |
| **company brain** | 8 | Presentation concept: company knowledge pipeline |
| **style sidebar** | 11 | Settings sidebar in Codecaine viewers for colors, borders, fonts |
| **eyebrow** | 4 | Small tinted label above a heading in the docs UI |
| **state shape / interaction surface / process outline / flow strip / call stack / component tree (componentry) / file explorer / pseudocode** | 1–10 | Docs-system block types |
| **context block** | 9 | Injected per-call context section in an agent prompt |
| **blast radius** | 7 | Set of files and systems a change touches (used in plan requests) |
| **fan out** | 8 | Spawn many sub-agents in parallel |
| **handoff (message)** | 9 | Message Ford pastes into a new thread to continue work |

### Speech-to-text mis-hearings (input alias table)

| Heard | Count | Intended |
| --- | --- | --- |
| fire crawl | 12 | Firecrawl |
| Curate | 8 | Kurate |
| cue | 7 | queue |
| eleven labs / 11 labs | 7 | ElevenLabs |
| CCPCU / "ccbc use" | 4 | CCBCU |
| band ingredients | 4 | banned ingredients |
| sql light | 3 | SQLite |
| unswap / on slop | 3 | unslop |
| CLAWD | 2 | CLAUDE(.md) |
| agent colonel, Tera, decob, Quinn, zebra scraping, emerge conflict, open sub-agents | 1 each | agent kernel, Terra, decomp, Qwen, zebra striping, merge conflict, Opus sub-agents |

## 8. What this means for the Codecaine STE word set

- **Seed the approved noun list from sections 3 and 4.** Use the canonical terms: page, block, block type, sub-agent, worker, thread, rule, lint, standard, check, eval, run, trace, transcript, system prompt, context block, state shape, heading, sidebar, details panel, mockup, PR, repo, folder, annotation, knowledge source, knowledge base, fact.
- **Seed the replacement table from Ford's own habits, not aerospace words.**
  - doc system → docs system
  - header → heading
  - subheader → subheading
  - state structure / data shape → state shape
  - mock-up → mockup
  - subagent / sub agent → sub-agent
  - repository / codebase → repo
  - directory → folder
  - verify / validate → confirm
  - wire up / hook up / tie in → connect
  - kick off / knock out → spawn or do
  - land / ship → merge or deploy
  - pull request → PR
  - "make sure" → confirm
  - "figure out" → find
  - "go through" → read/review
- **Delete these when rewriting dictation:** thing(s), stuff, whatever, pieces, and the hedges essentially, honestly, generally, specifically, properly, fully, currently, "a little bit", "in the sense that", "and such", "whatnot".
- **Every coined term in section 7 needs a glossary entry**, so that the "define on first use" rule can be checked. Confusion messages (37) mostly come from undefined internal names.
- **Format rules Ford already enforces** become lints:
  - no em dash
  - no "Label: sentence" lines
  - no bold run-in leads
  - bullets and sub-bullets over paragraphs
  - title-case headings
  - short lines
- **Open decisions for Ford.**
  - "block" vs "component".
  - "page" vs "doc" as the reader-facing word.
  - Title case vs the docs system's current heading case.

## Files

Scripts (`/tmp/ste-research/scripts/`):

| Script | Purpose |
| --- | --- |
| `common.py` | Loader, tokenizer, stopwords, filler patterns |
| `01_extract.py` | Streaming extraction, filtering, redaction, dedupe |
| `02_ngrams.py` | n-grams and filler stats |
| `03_synonyms.py` | Cluster counts and examples |
| `04_corrections.py` | Correction candidates |
| `05_coined.py` | Unknown and capitalized terms |
| `06_term_contexts.py` | Contexts for coined terms |
| `07_complaint_themes.py` | Complaint theme counts |
| `08_verbs_and_wordy.py` | Command verbs and wordy forms |
| `09_domain_table.py` | Domain term counts |
| `10_dictation_errors.py` | Speech-to-text mis-hearings |
| `11_spelling_variants.py` | Spelling variants |

Raw outputs (`/tmp/ste-research/raw/`):

- **Messages.** `messages.jsonl` (1,555 cleaned messages; contains Ford's full text, so treat as private) and `extract_stats.json`.
- **Term counts.** `ngrams_1.csv`, `ngrams_2.csv`, `ngrams_3.csv`, `domain_terms.json`, `filler_stats.json`, `verbs_wordy.json`.
- **Synonyms and spelling.** `synonym_clusters.json`, `spelling_variants.json`.
- **Corrections and complaints.** `correction_candidates.json`, `corrections_strong.txt`, `ste_and_naming.txt`, `complaint_themes.json`.
- **Coined terms and dictation.** `coined_candidates.json`, `term_contexts.json`, `term_contexts.txt`, `dictation_errors.json`.
- Files prefixed `codex-*` and `corpus-*` in the same folder come from other research workers, not this pass.
