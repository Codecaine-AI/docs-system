# Codex transcript mining: Ford's vocabulary for a Codecaine STE profile

Source: `~/.codex/sessions/2026/` (10,684 rollout files, 15 GB, Feb to Oct 2026).
Scripts: `/tmp/ste-research/scripts/codex-*.py`. Aggregates: `/tmp/ste-research/raw/codex-*`.

## 0. Method and sample

**No sampling.** Every file was streamed. A byte prefilter (`"role":"user"` in the first 300 bytes of a line) meant only user lines were JSON-parsed. The full scan takes about 11 s on 12 processes.

**Schema.** This Codex version writes no `event_msg/user_message` records. User text lives in `response_item` → `payload.type=message`, `role=user`, `content[].input_text`. Each session's first line (`session_meta`) has `originator`, `source`, and `thread_source`. Those three fields decide who wrote the session.

| Session class (from `session_meta`) | Files | Treatment |
|---|---|---|
| Interactive: `codex-tui`/cli, T3 Code, Codex Desktop, codex_work_desktop | 1,237 | Mined |
| `codex_exec` / `source=exec` (Claude-driven `codex exec`) | 3,016 | Excluded as agent-authored |
| Sub-agent / guardian_review threads | 6,428 | Excluded (13,902 parent-agent messages) |
| Agent-created threads, pi-subagents | 3 | Excluded |

**Exclusions inside interactive sessions**

| Reason | Count |
|---|---|
| Injected wrappers: `<environment_context>`, `# AGENTS.md`, `<turn_aborted>`, `<codex_internal_context>`/goal, `<subagent_notification>`, image tags, `<recommended_plugins>`, browser context, question-reply JSON | 5,601 parts |
| Agent-authored text pasted or relayed by the user (see below) | 111 unique |
| UI button text ("Implement the plan.") | 20 |
| Exact duplicates (forked sessions replay history) | 245 |
| Pastes > 4,000 chars | 54 |
| Messages that were only code or logs after stripping | 18 |

Wrappers that carry real user text (`## My request for Codex:`, `[Image: …]`, `<t3_context>`) were unwrapped, not dropped. In 88 messages a pasted log, code fence, or markdown doc was cut off and the human lead-in kept.

**Agent-authored, total: 3,033 unique prompts excluded**
- 2,920 from `codex exec` sessions, plus 102 duplicates. Of these, 1,353 contain "Use sub-agents / parallel execution".
- 2 from agent-created threads.
- 111 inside interactive sessions:
  - 54 handoff or kickoff prompts. Heuristic: backticks, em dashes, label lines like `Repo:` or `Context:`, "Do not" rules, and no voice markers.
  - 34 structured specs.
  - 11 skill-prompt pastes.
  - 6 "A previous agent produced the plan".
  - 6 others: 3 "PLEASE IMPLEMENT THIS PLAN", 2 "You are…" openers, 1 goal XML.

**Kept corpus.** 8,821 human messages, 441,074 words, median 170 chars.
- By month: May 2,801, Jun 3,021, Sep 1,962, other months < 400 each.
- By client: codex-tui 6,645, T3 Code 1,367, Codex Desktop 496, codex_work_desktop 313.

**Known limits**
- A few agent-written kickoffs with low structure still got through. Example: an audit brief that itself asks for "Simplified Technical English". These are excluded from the quotes below.
- Project-specific vocabulary inflates some counts. Examples: AutoHDR image grouping (images, groups, prune, shards), Melee/GameCube decomp (epoch, matches), a client voice-agent hotline (call flow, escalation).
- All counts are **messages containing the term** (document frequency), not raw hits, unless marked otherwise.

## 1. Filler (voice dictation)

Ford dictates with Wispr Flow. Rate per 1,000 words:

| Filler | Hits | /1k words |
|---|---|---|
| just | 3,668 | 8.3 |
| okay | 1,199 | 2.7 |
| like (comma-bound filler only) | 896 | 2.0 |
| whatnot | 874 | 2.0 |
| and such | 818 | 1.9 |
| essentially | 699 | 1.6 |
| kind of | 657 | 1.5 |
| or something | 638 | 1.5 |
| really | 577 | 1.3 |
| actually | 453 | 1.0 |
| stuff | 428 | 1.0 |

Notes:
- "basically" appears only 2 times. His intensifier is "essentially".
- "whatnot", "and such", "or something", and "stuff" are **vague list terminators**. Together they appear about 2,760 times. An STE rule of "write the full list or stop the list" would catch his most common speech habit.

## 2a. Top technical terms by domain (162 terms)

Counts are messages out of 8,821. Regexes fold plural and spelling variants (see `scripts/codex-terms.py`).

**Agents / LLMs**: agent 808 · prompt 371 · worker 336 · tool 260 · context 235 · skill 217 · session 195 · model 171 · eval 122 · trace 119 · thread 115 · codex 102 · sub-agent 100 · conversation 87 · orchestrator 85 · harness 74 · pi agent 67 · system prompt 65 · LLM 53 · knowledge base 52 · prompt kit 49 · MCP 45 · agent kernel 39 · reasoning/thinking level (low/xhigh) 33 · main agent 29 · user prompt 23 · rate limit 19 · tool call 10 · judge 7

**Docs system**: docs 518 · page 449 · section 254 · markdown/.md 254 · doc 214 · component 127 · diagram 104 · block 92 · bullet point 87 · html 87 · header/subheader 87 · standards 79 · file tree 76 · canvas 69 · docs system/doc system 61 · documentation 59 · readme 45 · lint/lint rule 43 · ASCII diagram 32 · design doc 17 · sub-bullet 15 · writing style 14 · sequence diagram 13 · docs framework 13 · process outline 7

**UI / frontend**: UI 436 · sidebar 208 · row/column 185 · viewer 179 · color 177 · render 175 · tab 152 · layout 150 · click 145 · button 115 · screen 104 · card 101 · table 95 · dashboard 63 · frontend 55 · main menu 48 · collapsible/collapsed 42 · top bar 25 · dropdown 25 · padding 23 · tooltip 21 · side panel 18 · popup/modal 16 · full width 14 · light/dark mode 13 · landing page 10 · title case 7

**Infra / tooling**: PR 348 · config 229 · repo 225 · push 188 · merge 181 · cache 169 · command 129 · database/db 100 · branch 99 · API 95 · server 85 · commit 79 · json 75 · script 68 · git 62 · work tree 49 · CLI 46 · CI 42 · docker 36 · local machine 33 · env 28 · draft PR 27 · endpoint 27 · merge conflict 19 · hot reload 18 · dev server 9

**Code structure**: file 625 · folder 332 · code 300 · type 294 · state 238 · structure 215 · directory 158 · top level 150 · logic 125 · implementation 105 · package 102 · function 58 · vertical slice 50 · codebase 49 · refactor 25 · module 24 · folder/file structure 23 · schema 17 · utils 17 · enum 15 · source of truth 13 · naming convention 11 · data model 9 · backwards compatibility 9

**Process / workflow**: run 1,327 · update 649 · phase 398 · fix 383 · review 340 · test 311 · issue 304 · report 289 · objective 252 · error 220 · step 191 · goal 168 · plan 153 · epoch 151 · baseline 147 · kill/restart 134 · stage 104 · audit 98 · sweep 95 · regression 80 · brainstorm 77 · batch 76 · named pass (first/full/cleanup…) 70 · new thread 61 · parallel 57 · full run/pass 45 · success/completion criteria, definition of done 42 · optimization loop 19 · edge case 17 · smoke test 15 · status update 13

**Most frequent multi-word requests** (trigrams, message counts):
- Docs and code: update the docs 39 · commit and push 25 · update the UI 18 · run the full 16 · update the objective 12 · create an objective 10 · remove the old 9 · restart the process 9 · compile a report 8
- Thinking and design: source of truth 13 · help me brainstorm 12 · help me figure (out) 11 · set up properly 11 · side by side 10
- Readability: easier to read 13 · hard to understand 12 · easier to understand 11

## 2b. Synonym clusters

Format: variant **count** (messages) · example quote (≤ 15 words). The recommended canonical term is in bold in each heading. "Split" means the variants turned out to be two real concepts, so both get a definition.

### Sub-agent: **sub-agent**
| Variant | Msgs | Example |
|---|---|---|
| worker | 336 | "I'm just trying to understand how the workers are doing things and learning." |
| sub-agent | 48 | "Can you please spawn some sub-agents to go out and start handling this?" |
| subagent | 30 | "can you please use subagents to go update the docs" |
| sub agent | 24 | "please make it so each sub agent has a tab for itself" |

Split. Use **sub-agent** for a child agent that a main agent spawns; it matches his CLAUDE.md spelling. Keep **worker** only for decomp-orchestrator worker processes, where it is a real role.

### Agent conversation: **session**
| Variant | Msgs | Example |
|---|---|---|
| session | 195 | "Are there any hanging memory sessions that are eating up memory and hidden away?" |
| thread | 115 | "Please give me a message or I can pick this up in a new thread" |
| conversation | 87 | "...have longer turn values, like 20 to 30, because these are longer conversations?" |
| chat | 17 | (mostly the `/chat/completions` API path) |
| context window | 4 | "if we can get a fresh context window to do something" |

He corrected this one explicitly: "instead of saying threads it should say sessions." "New thread" (61 msgs) is the UI action. The thing that is stored and resumed is a session.

### Model-facing text: **prompt**
| Variant | Msgs | Example |
|---|---|---|
| prompt | 371 | "To note, in the prompt creation we don't need user prompts." |
| message | 149 | "Can you now give me a message I could send to a new thread" |
| instructions | 31 | "Can you see where the instructions are on how to update the current state" |
| handoff / kickoff | 22 | "...any handoff artifacts for our current run." |

Split.
- **prompt**: persistent model-facing text, such as a system prompt or user prompt.
- **kickoff message**: the one-off text he pastes to start a new session. He asks for this in about 60 messages ("give me a message I can send in a new thread").

### Planned work: **objective** / **goal** / **plan** / **task** (keep all four, define each)
| Variant | Msgs | Example |
|---|---|---|
| objective | 252 | "can we redo the objective now with significantly more configuration options" |
| goal | 168 | "Can you please trim back the goal file slightly or by a thousand characters?" |
| plan | 153 | "Could you just make a quick plan to get, I guess, verbose logging" |
| task | 47 | "Can you please make another background task that pulls every three minutes" |
| spec | 42 | "where I could then use the spec command to do the fuller spec phase" |
| todo / ticket | 8 | (rare) |

These are distinct artifacts in his tools, not loose synonyms:
- **objective**: a repo-local bundle made by the setup-objective skill.
- **goal**: `goal.md`, the target statement inside an objective.
- **plan**: the proposed steps produced before code is written.
- **task**: one background job.
- **spec**: a Spectre phase.

The STE dictionary must define each one so they are not used interchangeably.

### Code container: **repo**
| Variant | Msgs | Example |
|---|---|---|
| repo | 220 | "please add and push all these changes to decomp orchestrator repo" |
| project | 212 | "Can you create a new project in t3 code for me that links to this" |
| codebase | 49 | "value based off of the actual code base and such" |
| workspace | 38 | "In the workspace, I think in reference, there's like something called..." |
| repository | 12 | "Do you not have a make command to run this from the repository root?" |

Split. A **project** is a T3 Code or scene-engine entity and must not stand for repo. Spell codebase as one word ("code base" is a variant).

### Folder: **folder**
| Variant | Msgs | Example |
|---|---|---|
| folder | 332 | 'We rename this folder to "past prs"' |
| directory | 158 | "Decomp orchestrator should be top-level, not in the tools directory." |
| dir | 13 | "we already have the run output dir runs" |

### Folder listing: **file tree**
| Variant | Msgs | Example |
|---|---|---|
| file tree | 76 | "Could you suggest a possible file tree that's a little cleaner than this?" |
| folder structure | 11 | "Could we make the folder structure actually like the solution folder" |
| file structure | 10 | "Can we please brainstorm a better file structure here?" |
| directory structure | 2 | "do we have a readme that explains the directory structure and such" |

"File tree" is also the name of a docs-system block, which reinforces the choice.

### Root of a hierarchy: **top level**
top level / top-level **150** ("Decomp orchestrator should be top-level, not in the tools directory.") vs root **12** ("run this from the repository root?"). Use "top level" for docs and folders. Keep "root" only for the git repository root.

### Documentation corpus: **docs** (corpus) and **page** (one unit)
| Variant | Msgs | Example |
|---|---|---|
| docs | 518 | "okay can you now clean up the spectre docs as I see a lot of empty folders" |
| doc (one document) | 129 | "everything to do with this doc rendering components should be at the top" |
| document(s) / to document | 113 | "can we now document somewhere to our versioning structure and whatnot?" |
| documentation | 59 | "Can you search the fireworks documentation and such for models" |
| page | 449 | "Please make the content of this page into bullet points for each item." |

### The product: **docs system**
| Variant | Msgs | Example |
|---|---|---|
| docs system | 34 | "Okay, have we centralized the Docs system and then run this for the Docs?" |
| doc system | 29 | "Can you please migrate the docs to the Codex doc system setup?" |
| docs framework | 13 | "is the current docs framework in the tools directory the actual docs framework?" |
| doc viewer / docs site | 6 | "can we now make the doc viewer content slightly wider" |
| documentation system | 3 | "migrate the Spectre docs to use the new documentation system" |

Split. "Docs framework" is also the name of an older skill. "Viewer" is the read-only UI of the docs system.

### Content unit in a page: **block**
| Variant | Msgs | Example |
|---|---|---|
| component | 127 | "do this back and forth on a file tree component in the docs system" |
| block | 92 | "for these JSON blocks and such, can we make them render with text" |
| element | 10 | "I can't copy and paste something into an element" |
| widget | 5 | "For the actual widget, can we make the card that it's in centered" |

Split.
- **block**: one instance in a page.
- **component**: the block type and its code.

He uses "component" for both today.

### Picture of a structure: **diagram**
| Variant | Msgs | Example |
|---|---|---|
| graph | 141 | "Could you please compute the full graph and then use that for the first pass" |
| diagram | 104 | "Can you give me an ASCII diagram or something showing how this process is running" |
| canvas | 69 | "I'm trying to add it in a canvas" |
| visual(s) | 61 | "could you look at the visual sheets for these to understand" |
| visualization | 30 | "You make a visualization or something that kind of explains the pattern here" |
| chart / flow chart | 4 | "it should be a vertical DAG in mermaid, so it's a flow chart." |

Split.
- **diagram**: any drawn picture.
- **canvas**: the editable docs-system diagram block.
- **graph**: only a node/edge data structure. This is his dominant meaning (AutoHDR edge graphs).

### Headings: **heading** (text), **header** (UI region), **title** (name of a page)
| Variant | Msgs | Example |
|---|---|---|
| header | 68 | "make sure everything in the selectors and headers is title case" |
| title | 52 | "The title to menu is a little bit too long now." |
| label | 42 | 'We don't need the "Needs" label.' |
| subheader | 27 | "we remove the headers completely and subheaders from this page?" |
| heading | 3 | "remove this secondary Heading 1 because once we have the actual name" |

He says "header" for document headings 20× more often than "heading". The STE profile must pick one deliberately; it is the biggest naming conflict found.

### Side area of the screen: **sidebar**
| Variant | Msgs | Example |
|---|---|---|
| sidebar | 194 | "Can we make the sidebar collapsible so that it can then be popped back out?" |
| panel | 47 | "the animation of the Shapes panel: can we make it animate away" |
| side panel | 18 | "In the side panel as well, there is this text that goes vertical" |
| side bar | 16 | "I kinda want the side bar to contain the projects" |
| side peek | 4 | "Don't love this side peek stuff." |

### Overlay surface: **pop-up**
pop-up/popup **18** ("the right pop-up that, when we click an image, should always be there.") · modal **8** ("Can we add a modal pop-up for each viewer pane of the images") · dialog **1**.

### UI in general: **UI** (and **viewer** for read-only UIs)
UI **436** ("On the pipeline UI, can we make it so that projects is just like a list") · viewer **179** ("can we now make the doc viewer content slightly wider") · dashboard **63** ("the client dashboard is for stakeholders who are non technical") · frontend **55** ("in the sidebar of the frontend can you make it so the selected item") · interface **7**.

### Remove: **remove** (content, code), **delete** (files, data), **stop** (processes)
| Variant | Msgs | Example |
|---|---|---|
| remove | 377 | "then we can remove this agent_state-shared.db because we don't need it" |
| clean up / clear out | 152 | "I am just wanting to clean up this flow" |
| kill | 85 | "what I want you to do is to kill this process" |
| drop | 62 | (mixed senses) |
| delete | 52 | "or does it get deleted after each run?" |
| get rid of | 12 | "Okay, why did we get rid of the custom component for the call sequence?" |
| rip out | 1 | |

### Stop a process: **stop**
stop **155** ("Why did we stop then?") · kill **85** · pause **38** ("none seem to be being paused after the tool call") · cancel **4** · abort **1**.

### Start a process: **run** (jobs), **start** (servers, UIs)
| Variant | Msgs | Example |
|---|---|---|
| run | 1,327 | "Okay, how many of them were run?" |
| start | 491 | "should we start the optimization loop" |
| trigger | 40 | "does the small threshold ever get triggered by any of our data sets?" |
| kick off | 17 | "a new thread that would kick off the director and monitor it" |
| launch / execute / spin up | 27 | "Docker container that we can then spin up" |

### Create: **add** (into something that exists), **create** (new artifact), **set up** (configure; noun **setup**)
| Variant | Msgs | Example |
|---|---|---|
| make (a/the) | 650 | "please make this app be intelligently designed with like _components folders" |
| set up / setup | 616 | "We need all of the tools set up." |
| add | 597 | "I'm asking you to do is add the logic in" |
| build | 411 | "we would build and such after that in the epoch" |
| create | 192 | "I'd like you to create another folder similar to the “resolution” folder" |
| generate | 102 | "go through and generate and cache the phase 2 values for candidates" |
| spin up / scaffold | 7 | |

### Change: **change** (general), **update** (bring to current state)
| Variant | Msgs | Example |
|---|---|---|
| change | 693 | "I need you to change the default model for the canvas agent" |
| update | 649 | "can we update the docs using the docs framework skill" |
| adjust | 226 | "allows us to adjust whether the text in these is left justified" |
| edit | 166 | "I can edit the project name and such as well?" |
| modify / tweak | 9 | "it's okay to modify any file as long as the primary motivation" |

### Verify: **make sure** (an STE-approved verb phrase); **audit** only for a full review with a written result
| Variant | Msgs | Example |
|---|---|---|
| make sure | 488 | "can we make sure everything in the selectors and headers is title case" |
| confirm | 287 | "So to confirm, we now have this set up in our production-based system" |
| check | 184 | "Then run the gate check again, fix any regressions" |
| audit | 98 | "come back with an audit of yourself having done this?" |
| verify | 91 | "on this PR can you verify that all the changes were made for the comments" |
| ensure | 64 | "Did you ensure things merged in and we didn't break things" |
| validate | 52 | "then you can validate the changes?" |

### Investigate: **find** (STE-approved), in place of figure out / look into / dig into
figure out **378** ("I need to figure out better how these exterior groups should look") · explore **60** · look into **18** ("Are we able to look into the pi sessions to see if they're actually making") · investigate **12** ("a new thread that would go investigate the linkages issue") · dig into **8** ("dig into a review more.").

### Something wrong: **problem** (general), **error** (reported message), **bug** (code defect), **regression** (a result that got worse)
| Variant | Msgs | Example |
|---|---|---|
| issue | 304 | "a big issue here is the server.ts file contains literally all the" |
| error | 220 | "Clicking the button gives the following error" |
| regression | 80 | "if we lose matches, that's fine as long as we don't have any regressions." |
| failure | 54 | "error counts (like number of failure types)" |
| broken | 43 | "requeuing the broken things into the system" |
| problem | 30 | "Could that also be the problem?" |
| bug | 29 | "this is adding a lot of just weirdness and bugs to the system." |

STE does not approve "issue" as a noun meaning problem. This is his most-used word in the cluster, so the mapping will fire often.

### Configuration: **config**
config **157** ("for the config, can you add xhigh thinking and make that the default") · configuration **104** ("significantly more configuration options") · options **72** · settings **40** ("adjust the number of snakes and similar settings as well.") · env **28**.

### Reusable agent capability (keep all, define each)
tool **260** ("like you added all of the tools, like using MWCC") · skill **217** ("You didn't use the Docs Framework skill.") · command **129** ("we could just have a special command to run this shard on this cache?") · script **68** ("make this like a batch script") · CLI **46** · MCP **45** ("do you see the prompt kit mcp") · plugin **4**.

### Written result: **report** (finished), **status update** (in progress)
report **289** ("run the eval process and report back") · results **101** · overview **49** ("It would have an overview file and then a separate file for each") · summary **33** ("concisely summarize what we've been talking about so far") · status update **13** ("Please give me status updates every three minutes, just saying what the progress is") · findings **13** ("Can you please write up these findings into a top-level markdown document").

### Part of a process: **phase** (named, ordered), **step** (one action), **pass** (one traversal over data), **epoch** (orchestrator cycle)
phase **398** ("we now make it to this phase so that the phase we are in is") · step **191** ("each step you said should have its own workflow prompt") · pass **184** ("then use that for the first pass") · epoch **151** ("the ui now says the epoch is 384") · stage **104** ("whatever we find at this stage is very generalized.") · round **60** ("to have to start with in Round 1 and such").

"Stage" and "phase" name the same thing ("stage one" vs "phase three"). Map stage → phase.

### Smaller clusters
- **dataset** 186 vs data set 120 ("this would run on the full dataset" / "if I just ran any data set through the production system").
- **worktree** 18 vs work tree 33 ("can you wipe the old worktrees" / "do we clean up the work trees for a worker epoch"). Prefer the git spelling, "worktree".
- **standards** 112 / rules 184 / conventions 14 / guidance 7 / guidelines 5. Use **standards** for the set and **rule** for one lintable item ("Have these been implemented as separate lint rules and standards").
- **agent** 808 / model 171 / AI 164 / LLM 53. Use **agent** for the acting system (model + tools + loop) and **model** for the LLM. Avoid bare "AI" ("we should just name them AI and Reviewer, not AI Activated and Reviewer Added.").

## 2c. Corrections and wording preferences

Phrase-family counts:

| Phrase family | Msgs |
|---|---|
| "clean up" / "cleaner" | 170 |
| "confusing" / "unclear" | 111 |
| bullet / sub-bullet | 87 |
| naming / rename | 90 |
| "I meant…" corrections | 74 |
| "easier/hard to read/understand" | 62 |
| "too long/too much/way too" | 55 |
| "simplify" | 46 |
| "concise" | 34 |
| "readable" | 32 |
| "what does X mean?" | 30 |
| verbose/wordy | 17 |
| "slop" | 7 |

**Quotes: brevity and slop**
1. "okay, be more concise, that is slop"
2. "please tighten up the wording"
3. "I feel like this is way too wordy."
4. "I just feel like we're being very overly verbose in both the system prompt and the context."
5. "the prompt should be more bullet-pointed and more concise."
6. "I don't need the implementation section to be heavily worded or way too long."
7. "We don't need all of this copy in there."
8. "That is all. Stop slop this."
9. "I don't need this language around "oh, maybe it's this.""

**Quotes: bullets over prose**

10. "each line should be like bite-sized bullet points."
11. "it should be very snappy instead of this long prose that is going into each line"
12. "The majority of the time, I wouldn't even use paragraphs." / "I would be using bullet points."
13. "Everything should be bullet points."
14. "instead of using like these semicolons, could that be then put onto a sub-bullet?"
15. "Can we make it so that sentences are on new lines and whatnot?"
16. "it's just adding a bullet to things doesn't make it better; you need to, in the pros content, split it into bullet points."
17. "can you update README.md to be bullet point format, the content itself is fine"

**Quotes: readability and level**

18. "almost like this seems like 6th or 7th grade reading level"
19. "In plain English, what is the point of this phase three edge table?"
20. "Make the description much more concise and vertically slice-oriented, as though it is written for someone with ADHD."
21. "The content is fine; it just needs to be more readable."
22. "Can you make these like H2s or H3s … so it's just easier to read?"
23. "can you update it to be more of an ASCII diagram layout so it's easier to read and visualize?"
24. "The wording, how the agent talks, is a little too unfeeling"

**Quotes: tighten wording, don't cut content**

25. "We need to keep all of the contents in there, but we just need to tighten up the wording"
26. "I see the proposal, but you trimmed out so much context around all of the formatting"

**Quotes: enforcement**

27. "Unslop is mostly writing style to me, and structure there would be things like:"
28. "is there a way that we could build in lints on structure, slop things"
29. "we should really then have these lint setups so that there is not drift"

**Quotes: naming**

30. "In the UI, instead of calling it a "pi-agent", can we just call it "Agent"?"
31. "we should just name them AI and Reviewer, not AI Activated and Reviewer Added."
32. "can we name this "border text" and "border caption", not "shield", because it's just not actually a shield?"
33. "It's not like an entire product name, so I don't need this crazy naming."
34. "instead of saying threads it should say sessions."
35. "can we rename the agents and such to match the docs, ie caller would need to be named conversation engine"
36. "you did not revert all the names, I still see all the non literal namings"
37. "Now, for the auxiliary features, I'd like to not name them auxiliary."
38. "make sure everything in the selectors and headers is title case"
39. "By "computer use," I meant being able just to click things on my screen."
40. "I did not mean leave comments in the code, I meant leave comments on the PR"

**Recurring preferences**
1. **Bullets, not prose.** One idea per line, sub-bullets instead of semicolons, sentences on separate lines. This applies everywhere: PR comments, emails, Discord messages, prompts, READMEs, and UI descriptions.
2. **Short, but complete.** "Concise" means tighter wording, not less content. He objects when context or formatting is cut.
3. **Readability is the test.** "Easier to read/understand" is his most common acceptance phrase. The stated targets are a 6th to 7th grade reading level, plain English, and ADHD-friendly text.
4. **Undefined terms trigger questions.** "What does X mean?" appears 30 times, and "confusing" or "unclear" 111 times. This supports the STE dictionary rule: define every term once.
5. **Literal names.** He wants:
   - descriptive, not branded or metaphorical ("not shield", "crazy naming")
   - no redundant prefixes (clientIncidentRuleFires → incidentRuleFires)
   - the same name in UI, docs, and code
   - consistent casing: kebab-case folders, title case for headers and selectors
6. **No hedging and no AI filler ("slop").** The tone should be direct but not cold.
7. **Structure as a reading aid.** H2/H3 sections, ASCII and sequence diagrams, and title case. He is ambivalent about tables: "I don't know if I love the idea of using a table".
8. **Enforce with lints, not reminders.** Structure and slop rules should fail a write, so the docs cannot drift.

## 2d. Coined and project-specific terms

Spelling variants are listed where they matter for the dictionary.

| Term | Msgs | Inferred meaning |
|---|---|---|
| Codecaine (also CodeCane, Codecane) | 45 / 22 | His org and brand for the tool suite and site. Spelling varies. |
| docs system / docs framework | 61 / 13 | The Codecaine documentation tool: typed blocks, a viewer, lints. "Docs framework" is the older skill name. |
| Prompt Kit / PromptKit | 49 | Tool for writing model prompts as structured documents, with an editor and an MCP server. |
| Observatory | 9 | App inside Prompt Kit: prompt editor plus trace views. |
| Agent Kernel | 39 | Agent runtime and tracing layer (its own repo). |
| Spectre | 46 | Older spec and session system with a docs and spec-phase inspector. He calls it "very outdated". |
| Variator | 9 | Tool that generates design variations of docs blocks (State Shape, Interaction Surface). |
| process outline / state shape / interaction surface | 7 / 10 / 11 | Docs-system block types. "Interaction surface" also means any surface an agent or user acts on. |
| objective / setup-objective skill / goal file | 252 / 15 / 14 | Repo-local bundle for long-running agent work. `goal.md` holds the target and has a character limit. |
| vertical slice / vertically sliced | 50 | Organize code and docs by feature, not by layer. He also applies it to writing ("vertically slice-oriented"). |
| decomp orchestrator / decomp harness / GameKeep Decomp | 43 / 13 / 2 | System that runs parallel worker agents to decompile GameCube games (Melee, Super Mario Sunshine). |
| epoch | 151 | One batch cycle of orchestrator workers. |
| matches and improvements | 8+ | Orchestrator outcome metrics: exact matches and score gains. |
| worker reports | 12 | What each orchestrator worker reports back. |
| pi agent / Pi SDK | 67 | Agents built on the Pi agent SDK, often run one per item. |
| Codex LB | 29 | His central Codex proxy that load-balances across several Codex accounts. |
| Astra sub-agents | 18 | Sub-agents on the gpt-6-astra model. |
| low / xhigh thinking | 33 | Reasoning-effort levels that he names when picking models. |
| kickoff message ("a message I can send in a new thread") | about 60 | A prompt the agent writes for him to paste into a fresh session. |
| slop / unslop | 7 / 3 | Slop: verbose, generic AI text. Unslop: his writing-style skill. |
| knowledge base / knowledge curator | 52 / 10 | Indexed knowledge from PRs and docs, and the agent that fills it. |
| scene engine / main menu | 23 / 48 | Rendering engine for the Codecaine site's Melee-style menu. |
| drive screen | 7 | Skill for computer use (desktop control). |
| agent viewer / trace viewer | 27 / 9 | UIs to inspect agent runs and traces. |
| research kernel ("simple research kernel") | 7 | Minimal example agent harness. |
| Wispr Flow / Wispr Sync | 22 / 18 | His voice-dictation tool, and a sync tool for its data. |
| side peek | 4 | Notion-style side preview panel. He dislikes it. |
| AutoHDR terms: feature cache, run ladder, truth groups, rescues, prune, contact sheet | 35 / 10 / 24 / 44 / 97 / 17 | Hackathon image-grouping pipeline. Domain-only; keep out of a general dictionary. |

## 2e. Draft STE mappings suggested by the data

| Use (approved) | Instead of (unapproved) |
|---|---|
| sub-agent | subagent, sub agent, child agent |
| session | thread (stored conversation), chat, conversation |
| folder | directory, dir |
| file tree | folder structure, file structure, directory structure |
| top level | root (except the git repository root) |
| docs system | doc system, documentation system, docs framework |
| block | widget, element (for content in a page) |
| diagram | visual, visualization, chart, flow chart |
| sidebar | side bar, side panel (when it is the same region) |
| pop-up | modal, dialog, popover |
| remove | get rid of, rip out, drop, clean out |
| stop | kill, halt, abort |
| run | kick off, launch, fire off, spin up, execute |
| make sure | ensure, double check, sanity check, validate |
| find | figure out, look into, dig into |
| problem | issue (noun) |
| change | modify, tweak |
| phase | stage |
| dataset | data set |
| worktree | work tree |
| config | configuration, settings (the file or object) |

Filler to ban outright: whatnot, and such, or something, stuff, essentially, kind of, just, actually, really.

## Files
- Scripts, in run order:
  - `scripts/codex-meta-survey.py`
  - `codex-extract.py`
  - `codex-clean.py`
  - `codex-ngrams.py`
  - `codex-synonyms.py`
  - `codex-terms.py`
  - `codex-prefs.py`
- Aggregates in `raw/`:
  - `codex-clean-stats.json` (exclusion counts)
  - `codex-filler.json`
  - `codex-ngrams-{1,2,3}.tsv` (df ≥ 3)
  - `codex-synonyms.json`
  - `codex-terms.json`
  - `codex-meta.json` (per-file originator and source)
- Full-text dumps were deleted for privacy. To rebuild them, run `python3 codex-extract.py && python3 codex-clean.py` (about 15 s).
