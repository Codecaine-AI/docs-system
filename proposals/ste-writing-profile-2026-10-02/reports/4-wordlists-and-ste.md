# 4. Word lists and ASD-STE100: research for the Codecaine STE profile

Research date: 2026-10-02. Companion data: `/tmp/ste-research/raw/replacements.csv` (220 rows).

## Key findings

1. **The current standard is Issue 9, dated 2025-01-15.** It has 53 rules in 9 sections plus 8 General Recommendations. The FAQ schedules Issue 10 for January 2028. Issue 9 renamed "technical name" to **"technical noun"** everywhere. Use that term in the profile.
2. **Do not commit the official dictionary, or a bulk derivative of it, to the repo.** Issue 9 forbids reproduction "in whole or in part" without written ASD authority. The free-use grant covers aerospace bodies, their customers, and universities used for education. We are not in that list. A safe pattern exists: a short, attributed list of pairs from public style guides, plus an optional "bring your own PDF" extractor that runs locally.
3. **Issue 9 already covers software better than older issues.** Technical-noun category 19, "Computer science, information and communication technology", lists *large language model, token, hallucination, prompt engineering, embedding, chatbot, metadata, plug-in*. Technical-verb category 2, "Computer processes and applications", lists *click, enter, delete, copy, save, enable, disable, validate, filter, install, debug, upload, download, process, update*.
4. **Many core software verbs are unapproved in the STE dictionary.** Examples: *run, create, call, return, build, render, link, store, load, search, test, check, need, fail, handle, define*. The profile must whitelist these as technical verbs. If it does not, the linter fights every page.
5. **The best open word data is OpenSTE v1.01 (MIT).** It has 1,951 headwords and 1,589 alternative pairs. Its provenance is not stated. It agrees with Issue 9 on 96% of overlapping headwords and contradicts it on 57. It looks derived from an older issue. Use it only as a cross-check, not as the shipped source of truth.

---

## 1. ASD-STE100 facts

### 1.1 Issue, date, availability

| Fact | Value | Source |
|---|---|---|
| Current issue | Issue 9, 2025-01-15. It fully replaces all earlier issues. | Issue 9 PDF title page and Highlights |
| Status | International standard from Issue 9 (it was a specification from 2005) | [asd-ste100.org FAQ](https://www.asd-ste100.org/STE_faq.html), [tcworld](https://www.tcworld.info/e-magazine/technical-writing/asd-ste100-issue-9-setting-a-standard-for-technical-documentation) |
| Next issue | Issue 10, "scheduled for January 2028". The issue cycle is about 3 years. | [FAQ](https://www.asd-ste100.org/STE_faq.html) |
| Size | 53 writing rules (Part 1) and about 900 approved words plus about 1,200 unapproved entries (Part 2). My parse of the dictionary found 729 approved and 1,227 unapproved headwords. The parse is approximate. | Issue 9 PDF, [Wikipedia](https://en.wikipedia.org/wiki/Simplified_Technical_English) |
| How to get it | Free of charge since Issue 6 (2013), PDF only. You fill in a request form at [STE_downloads](https://www.asd-ste100.org/STE_downloads.html). A direct PDF URL also resolves: [ASD-STE100_ISSUE9.pdf](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf). | [FAQ](https://www.asd-ste100.org/STE_faq.html) |
| Trademark | "ASD-STE100 Simplified Technical English" is an EU trademark: 004901195 (2006) and 017966390 (2018) | Issue 9 copyright page |
| Tool endorsement | ASD and the STEMG "DO NOT endorse or certify" any tool sold as "fully compliant". Vendors have no authorization to use the ASD logo, copyright, or trademark. | [FAQ](https://www.asd-ste100.org/STE_faq.html) |

### 1.2 Copyright: can we embed approved/unapproved mappings in our repo?

The Issue 9 copyright notice says the information is ASD property and that "no reproduction or publication of it, in whole or in part, shall be made without the written authority of an officer of ASD". Irrevocable free-use rights go only to these groups:

1. ASD national associations and their member companies
2. Members of AIA and AIAC
3. Members of ICCAIA
4. Customers of the companies in groups 1 to 3
5. Ministries of Defense of ASD, AIA, and AIAC member countries
6. Airlines for America (A4A)
7. Airworthiness authorities
8. Universities and research institutes, for educational purposes

**Assessment (not legal advice):**

- **Don't** vendor the dictionary, a bulk extract, or the rule text with examples. ASD is in Brussels, so the EU *sui generis* database right (Directive 96/9/EC) can also protect a "substantial part" of the dictionary, even when single entries are facts.
- **Low risk:** a small, attributed set of common pairs that many public style guides also publish, such as *utilize → use*, *ensure → make sure*, *in order to → to*. Each row in our CSV lists its public sources. The STE9 tag means "status checked against Issue 9", not "copied from Issue 9".
- **Precedent from open-source projects:**
  - [AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) and [stuffbucket/vale](https://github.com/stuffbucket/vale) deliberately ship no ASD dictionary.
  - SimpleEnglish ships `tools/ste-dictionary/`, which extracts the word list from the user's own free PDF. Copy this pattern: a `codecaine ste import-dictionary <pdf>` command that writes to a git-ignored cache.
- **Rule names:** paraphrase them, such as "STE 5.1: max 20 words per procedural sentence". Rule numbers and short paraphrases are fine. Verbatim rule text with its examples is not.

### 1.3 Writing rules: sections and counts (Issue 9)

| Section | Title | Rules | Rules our profile can enforce |
|---|---|---|---|
| 1 | Words | 14 (1.1–1.14) | 1.1 approved words, technical nouns, or technical verbs only. 1.2 part of speech. 1.3 approved meaning. 1.4 approved verb and adjective forms. 1.5–1.11 technical nouns (1.10: no slang or jargon; 1.11: one noun per item). 1.12–1.13 technical verbs. 1.14 American English spelling. |
| 2 | Multi-word nouns | 2 (2.1–2.2) | 2.1 no more than 3 words in a noun cluster. 2.2 write longer technical nouns in full. Old rule 2.3 moved to 4.5. |
| 3 | Verbs | 7 (3.1–3.7) | 3.2 only infinitive, imperative, simple present/past/future, and past participle as adjective. 3.4 no complex verb constructions. 3.5 "-ing" only in technical nouns. 3.6 active voice (passive only in descriptive text when the agent is unknown). 3.7 use a verb for an action, not a noun. |
| 4 | Sentences | 5 (4.1–4.5) | 4.2 no omitted words, no contractions. 4.3 vertical lists. 4.4 connecting words. 4.5 (new) use articles and demonstratives. |
| 5 | Procedural writing | 5 (5.1–5.5) | **5.1 max 20 words per sentence.** 5.2 one instruction per sentence. 5.3 imperative. 5.4 condition first. 5.5 notes give information, not instructions. |
| 6 | Descriptive writing | 6 (6.1–6.6) | **6.3 max 25 words per sentence.** 6.5 one topic per paragraph. **6.6 max 6 sentences per paragraph.** |
| 7 | Safety instructions | 3 (7.1–7.3) | Signal word, command or condition first, then the risk. Maps to warning and caution callouts. |
| 8 | Punctuation and word count | 7 (8.1–8.7) | **8.1 no semicolons.** 8.2 hyphens. 8.3 parentheses uses. 8.4–8.7 word counting (see 1.4). |
| 9 | Writing practices | 4 (9.1–9.4) | 9.1 restructure sentences, do not translate word for word. 9.2 use each word correctly. **9.3 no phrasal verbs.** 9.4 consistent terminology. |
| **Total** | | **53** | |

General Recommendations (not counted as rules):

- GR-1 "that"
- GR-2 "with"
- GR-3 pronouns
- GR-4 "this"
- GR-5 false friends
- GR-6 Latin abbreviations
- GR-7 inclusive language (new in Issue 9)
- GR-8 possessive form (new in Issue 9)

**Notable Issue 9 changes:**

- "technical name" became "technical noun" (Rule 1.1 Highlights)
- noun categories 21 and 22 were added
- verb category 3 was restructured into subject-field subcategories, and a new category 4 (law) was added
- word count now covers numbers together with units and proper nouns (8.6)

### 1.4 What counts as one word (Rules 8.4–8.7)

STE sentence-length rules (5.1, 6.3) count each of these as **one word**:

- Numbers. Do not count paragraph or step numbers.
- A number together with its unit of measurement ("20 kg", "10 °C")
- Abbreviations, acronyms, and initialisms (VPN, NASA, a.m.)
- Alphanumeric identifiers ("36L7", "No. 1")
- Quoted text, including UI text in quotes, text in caps or a distinct font, and formulas
- Titles, headings, and text on placards and labels
- Proper nouns of people, groups, organizations, and geopolitical entities
- Text in parentheses counts as one word (8.5)
- Hyphenated words count as one word (8.7)
- In a vertical list, a colon works like a period and ends a sentence (8.4)

**How this maps to our block model:**

- inline `code` span → 1 word (alphanumeric identifier or quoted text)
- link text that is a page title → 1 word
- UI labels in bold or quotes → 1 word
- a parenthetical → 1 word
- a list lead-in that ends in a colon → its own sentence

### 1.5 Technical noun categories (Rule 1.5, Issue 9: 22 categories)

1. Official parts information
2. Vehicles or machines, and locations on them
3. Tools and support equipment, their parts, and locations on them
4. Materials, consumables, and unwanted material
5. Facilities, infrastructure, and logistic procedures
6. Systems, components and circuits, their functions, configurations, and parts
7. Mathematical, scientific, engineering terms, and formulas
8. Navigation and geographic terms
9. Numbers, units of measurement and time (and their symbols)
10. Quoted text (labels, display text, button names)
11. Professional roles, individuals, groups, organizations, and geopolitical entities
12. Parts of the body
13. Common personal effects, food, and beverages
14. Medical terms
15. Official documents, parts of documentation, standards, and guidelines
16. Environmental and operational conditions
17. Colors
18. Damage terms
19. **Computer science, information and communication technology.** The standard's own examples include AI, authentication, backup, chatbot, cursor, cybersecurity, database, deep learning, embedding, field, file, firewall, hallucination, HTML, interface, large language model, machine learning, memory, menu, metadata, network, operating system, plug-in, prompt engineering, screen, search engine, status bar, token, toolbar, tuning, update, and XML.
20. Civil and military operations
21. Law and regulations (new)
22. Animals, plants, and other life forms (new)

Category 15 matters too. Its examples include *data module, figure, flowchart, font, note, page, paragraph, section, table, revision*. That covers docs-about-docs vocabulary such as block, component, and page.

### 1.6 Technical verb categories (Rule 1.12, Issue 9: 4 categories)

1. **Manufacturing processes**, with subcategories:
   - a) remove material
   - b) add material
   - c) attach material
   - d) change properties
   - e) change surface finish
   - f) change shape
2. **Computer processes and applications**
   - a) Input and output: click, digitize, enter, press, print, swipe, tap, type
   - b) User interface and application: clear, close, copy, cut, delete, deselect, disable, drag, drag and drop, enable, encrypt, erase, filter, highlight, invalidate, maximize, minimize, navigate, open, paste, save, scroll, sort, store, tweet, validate, zoom in/out
   - c) System operations: abort, boot, communicate, debug, download, format, install, load, manage, process, reboot, update, upgrade, upload
3. **Instructions and information for applicable subject fields**, with subcategories:
   - a) engineering, mathematical, and scientific
   - b) medical
   - c) civil and military operations
   - d) navigation
   - e) automotive and railway
   - f) energy, oil, and gas
4. **Law and regulations** (legal and regulatory texts only): comply with, conform to, enforce, notify, supersede, waive, and others

**Limits that apply to all technical verbs:**

- If an approved dictionary verb works, use it. A technical verb is only for the case where no approved verb fits.
- Technical verbs must follow the Section 3 verb-form rules.
- Do not use a technical verb as a noun (1.13).
- Do not use a technical noun as a verb (1.7). For example, write "apply grease", not "grease".

### 1.7 STE vs software docs: words STE rejects that we need

Checked against the Issue 9 dictionary. Each status below is a fact. No definitions or examples are reproduced.

| Software word | Issue 9 status → STE alternative | Profile decision |
|---|---|---|
| run (v) | unapproved → OPERATE | **Whitelist** as a cat-2c technical verb |
| create (v) | unapproved → MAKE | Whitelist (create a file, page, block) |
| call (v) | unapproved → TELL | Whitelist (call a function or tool) |
| return (v/n) | unapproved → GO | Whitelist (a function returns) |
| build (v/n) | unapproved → ASSEMBLE / STRUCTURE | Whitelist |
| render (v) | unapproved → MAKE | Whitelist |
| link (v) | unapproved → CONNECT | Whitelist (also a technical noun) |
| store / load (v) | unapproved → KEEP / INSTALL. Both are listed as category-2 technical verbs. | Allowed by the standard itself |
| search (v) | unapproved → EXAMINE | Whitelist (search engine is a cat-19 noun) |
| test / check (v) | unapproved → (do a) TEST / MAKE SURE | Whitelist *test*. Map *check* → *make sure* in prose. |
| delete / copy / enter / save / click (v) | unapproved in general, but listed as cat-2 technical verbs | Allowed only in software and UI contexts |
| need (v) | unapproved → NECESSARY (adj) | Flag only. Hard to autofix. |
| fail (v) | unapproved → "if ... not" | Flag only. Consider whitelisting (tests fail). |
| handle / define / generate | unapproved | Whitelist the software senses (handle an event, define a type, generate code) |
| option (n) / choose (v) | unapproved → ALTERNATIVE / SELECT | Keep *option* as a technical noun. Swap *choose* → *select*. |
| happen (v) | unapproved → OCCUR | Autofix *happen* → *occur* |
| should / may / would | unapproved → MUST / CAN / CAN | Flag. Map to explicit must/can. |
| previous, sufficient, transmit, deploy, install, access, select | **approved** in Issue 9 | Do not flag. Plain-language lists flag *previous*, *sufficient*, and *transmit*. |

Conflicts with mainstream style guides:

- **Click vs select:** STE allows *click*. Microsoft prefers device-neutral *select*.
- **Enough vs sufficient:** STE approves *sufficient* and rejects *enough*. Microsoft and plainlanguage.gov say the opposite.
- **Ensure:** STE requires *make sure*. Microsoft allows *ensure*.
- **Will:** STE allows the simple future. GitLab prefers present tense.

Pick one side per conflict and record the choice in the profile.

### 1.8 STE for software/IT

- Issue 9 itself is the main extension. It adds category 19 (computing, including LLM terms) and verb category 2 (computer processes). A practitioner source says Issue 7 (2017) first added the computer-verb category. I did not confirm this against Issue 7.
- Rule 1.8 tells each organization to define approved technical nouns. Vendors build on that with custom dictionaries: Acrolinx, Congree, HyperSTE, and TechScribe "project terms" ([TechScribe design](https://www.simplified-english.co.uk/design.html), [HyperSTE](https://idratherbewriting.com/2017/01/25/hyperste-simplified-technical-english-asd-ste100/)).
- [dandye/ste-writing-style](https://github.com/dandye/ste-writing-style) (MIT) has a useful schema to copy:
  - a repo-level `.ste-dictionary.yaml` with `technical_names` (term, category, definition), `technical_verbs`, and `forbidden_project_words` (word → replacement)
  - a per-document `ste_vocabulary:` frontmatter block
  - precedence: document > project > core

---

## 2. Public STE word data

| Source | Content | License | Notes |
|---|---|---|---|
| [openste/openste](https://github.com/openste/openste), vendored in [stuffbucket/vale](https://github.com/stuffbucket/vale) as `third_party/openste/openste.json` | v1.01: 1,951 headwords (909 approved, 1,042 unapproved), 1,589 unapproved→alternative pairs, spaCy POS per entry | MIT (© 2026 openSTE.org) | **Provenance not stated.** My cross-check: 1,642 headwords overlap with Issue 9. Of the 1,572 with clear status, 1,515 agree (96%) and 57 disagree. Examples: OpenSTE says *occur → happen* (Issue 9 says the reverse); it marks *create*, *appear*, *therefore*, *choose*, *option* approved; it marks *previous* and *sufficient* unapproved. This pattern points to derivation from an earlier issue. The MIT license may not clear upstream ASD rights. |
| [stuffbucket/vale](https://github.com/stuffbucket/vale) | Go STE linter and MCP server (not the errata-ai Vale). Generates a vocabulary rule from OpenSTE. Exempts built-in software terms. | MIT | Says it is "an approximation… not certified". |
| [TechScribe term checker](https://www.simplified-english.co.uk/design.html) | LanguageTool fork with `disambiguation-ste9.xml` (POS-aware approved/unapproved) and `grammar-ste9.xml` | Commercial. The ste9 rule files sit behind password-protected links. | Best public description of POS-gated STE checking: *work* is approved as a noun, not as a verb. Precision 0.86, recall 0.98. |
| [AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish) | Agent skill: paraphrased 53-rule catalog, Plain and Strict modes, a local PDF→word-list extractor | MIT | Ships no dictionary on purpose. |
| [dandye/ste-writing-style](https://github.com/dandye/ste-writing-style) | `ste-general-dictionary.md`, dictionary schema, vocabulary discovery from code | MIT | Dictionary provenance not stated. |
| [johnsaigle/ste-lint](https://github.com/johnsaigle/ste-lint), [bajpainaman/ste-writing](https://github.com/bajpainaman/ste-writing), [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill) | Structural checks only (sentence length, passive voice, -ing, semicolons) | MIT | No word list. |
| [Boeing Simplified English Checker](https://www.boeing.com/company/key-orgs/licensing/simplified-english-checker) | Commercial checker | Licensed product | Reference only. |

**Starter set.** The CSV has 61 rows tagged `STE9` and/or `OSTE`. Each row's status was checked against Issue 9, and each also appears in public plain-language or style-guide lists unless the row notes otherwise. Examples:

- utilize→use, ensure→make sure, obtain→get, commence/initiate/begin→start, terminate/cease→stop, attempt→try
- assist/facilitate→help, modify/alter→change, indicate/display(v)→show, retain/maintain→keep, permit/allow→let
- provide→give, require→need, however→but, therefore→thus, whether→if, via→through, happen→occur
- should→must, may/would→can, additional→more, locate→find, choose→select, execute→run (software profile; Issue 9 says DO)

Filter with `grep -E 'STE9|OSTE' replacements.csv`.

---

## 3. Software-domain word lists

### 3.1 Sources and licenses

| Source | What it gives | License | Machine-readable form |
|---|---|---|---|
| [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) (A–Z word list, [simple words](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences)) | utilize/make use of → use, in order to → to, inform → tell, establish connectivity → connect, simply (do not use to mean easy), please (avoid), execute → run, once ≠ after, while ≠ although, allow/enable (rewrite around), and/or | CC BY 4.0 for the [GitHub repo](https://github.com/MicrosoftDocs/microsoft-style-guide), archived 2025-07-28 | [Vale Microsoft](https://github.com/errata-ai/Microsoft) (MIT): `Wordiness.yml` (~110 swaps), `Terms.yml`, `Adverbs.yml`, `UIVerbs.yml`, `Avoid.yml` |
| [Google developer documentation style guide word list](https://developers.google.com/style/word-list) | allows you to → lets you, leverage → use, utilize (not for *use*), via (don't use), in order to → to, functionality (caution), performant (avoid), once → after, e.g./i.e. → for example/that is, kill/abort/terminate → stop/exit/cancel/end, sanity check (don't use), please (don't), easy/just (delete), may → can/might | CC BY 4.0 (code samples Apache 2.0) | [Vale Google](https://github.com/errata-ai/Google) (MIT): `WordList.yml`, `WordListCase.yml`, `Latin.yml` |
| [plainlanguage.gov "Use simple words and phrases"](https://github.com/GSA/plainlanguage.gov/blob/main/_pages/guidelines/words/use-simple-words-phrases.md) (now archived; the live site redirects to [digital.gov](https://digital.gov/guides/plain-language)) | 237 "Don't say / Say" pairs, including a bold "dirty dozen" | Public domain (US Government work) | Markdown table, easy to parse. [retext-simplify](https://github.com/retextjs/retext-simplify) (MIT) ships 327 similar patterns. |
| [Red Hat (vale-at-red-hat)](https://github.com/redhat-documentation/vale-at-red-hat) | `SimpleWords.yml` (~110 swaps), `TermsErrors.yml` (~460), `TermsWarnings.yml` (leverage → use, execute → run, kill/terminate → end/stop, click on → click), `TermsSuggestions.yml` (via → through/by using, launch → start), `Using.yml` (POS sequence: NOUN + using → "by using"), `ConsciousLanguage.yml` | MIT | Vale YAML |
| [GitLab docs Vale rules](https://gitlab.com/gitlab-org/gitlab/-/tree/master/doc/.vale/gitlab_base) and [word list](https://docs.gitlab.com/development/documentation/styleguide/word_list/) | `Wordy.yml`, `Simplicity.yml` (easy/simply/useful), `SubstitutionWarning.yml`, `LatinTerms.yml` (via → with/through/by using), `Ability.yml`, `FutureTense.yml`, `CurrentStatus.yml` | **CC BY-SA 4.0** (everything under `doc/`). Share-alike: cite pairs, do not copy files. | Vale YAML |
| Vale prose packages: [write-good](https://github.com/errata-ai/write-good), [proselint](https://github.com/errata-ai/proselint), [alex](https://github.com/errata-ai/alex), [Readability](https://github.com/errata-ai/Readability), [Joblint](https://github.com/errata-ai/Joblint) | Passive voice (regex), TooWordy (216 tokens), Weasel, ThereIs, E-Prime, inclusive-language swaps, readability metrics | MIT; proselint BSD-3 | Vale YAML |

### 3.2 The candidate list (`raw/replacements.csv`)

- **220 rows.** Columns: `unapproved,approved,autofix_safe,category,sources,note`
- **`autofix_safe` values:**
  - `yes` (110 rows): a 1:1 swap. The engine must handle inflection (utilizes → uses) and re-capitalize after a deletion.
  - `pos` (15 rows): safe only when the POS tagger confirms the stated part of speech. Examples: *leverage* (v), *display* (v), *permit* (v), *whitelist* (n).
  - `no` (95 rows): flag only. The engine raises the finding, and an LLM rewrite or a human fixes it.
- **Categories:**

  | Category | Rows |
  |---|---|
  | simple-word | 72 |
  | wordy-phrase | 51 |
  | ui-verb | 17 |
  | shorthand | 15 |
  | ste-core | 13 |
  | filler | 11 |
  | latin-abbrev, process-verb, inclusive | 8 each |
  | conjunction, hype, modal | 4 each |
  | tense-time | 3 |
  | idiom | 2 |

- **Source codes:**
  - MS = Microsoft style guide
  - MSV = Vale Microsoft
  - G = Google style guide
  - GV = Vale Google
  - RH = Red Hat Vale
  - GL = GitLab
  - PL = plainlanguage.gov
  - WG = write-good
  - PS = proselint
  - alex
  - ASKL = AminBlg/SimpleEnglish
  - OSTE = OpenSTE
  - STE9 = status checked against Issue 9
  - `derived:` = inferred from a rule, not from a published list (1 row: *kick off → start*, from Rule 9.3)

**Autofix rules that came out of the data:**

1. **Skip code spans, code blocks, link URLs, and UI-label spans.** *ALTER TABLE*, *INSERT*, *kill -9*, and *master* in git commands must survive.
2. **Treat these as never safe to autofix:**
   - words with a technical software sense: *acquire (a lock), notify, implement, generate, spawn, insert, verify, request, maintain, evaluate, assume (a role)*
   - meaning-dependent conjunctions: *once, since, while, as*
3. **Deletions need re-capitalization.** For *simply*, *please*, and *note that*, "Simply run X" becomes "Run X".
4. **Multi-option replacements are never autofix.** Rows with `|` in `approved` go to the LLM rewrite tier with the options as hints.

---

## 4. Tooling

### 4.1 Vale

- **What it is:** [vale-cli/vale](https://github.com/vale-cli/vale), MIT, a Go single binary. v3.22.0 (Sep 2026) is listed as latest. The npm package `vale` was unpublished in 2023, so ship the binary or use a system install.
- **Rule format:** YAML. There are 12 check types ([docs](https://docs.vale.sh/checks/substitution)):

  | Check type | What it does |
  |---|---|
  | existence | flags a pattern that is present |
  | substitution | flags a pattern and carries a `swap` map |
  | occurrence | counts matches (sentence length) |
  | repetition | flags repeated words |
  | consistency | flags mixed spellings of one term |
  | conditional | for example, an acronym used before its definition |
  | capitalization | heading and term case |
  | metric | numeric formulas over counts |
  | readability | readability scores |
  | spelling | dictionary spell check |
  | sequence | POS-tag sequences |
  | script | runs a Tengo program |

- **Plain-text input works:** `cat block.txt | vale --ext=.txt --output=JSON`. With `--ext=.md`, Vale skips code. `--path` applies path-specific config.
- **JSON output:** each alert includes `Line`, `Span`, `Check`, `Severity`, `Match`, `Action`, and `Suggestions`.
- **No fix command.** The CLI reports actions (`replace`, `remove`, `edit`, `convert`, `suggest`) but never rewrites files. Editors apply them through `vale-ls` ([actions](https://docs.vale.sh/topics/actions), [CLI](https://docs.vale.sh/topics/cli)).
- **Pros:**
  - mature
  - every style package above plugs in directly
  - LSP and editor support
  - writers outside our engine can use the same rules
- **Cons:**
  - an extra binary and process per lint call
  - offsets must be mapped back to block IDs
  - no knowledge of our block types (callout vs procedure)
  - English-only POS tagging through Go `prose`
  - rule logic would be split across two engines
- **Recommendation:** keep rules in our TypeScript engine as the source of truth. Generate Vale YAML from the same CSV and JSON data as an *export*, for editors and CI outside the docs app. Do not make Vale a runtime dependency.

### 4.2 JS/TS libraries

| Library | License, version | Use | Pros | Cons |
|---|---|---|---|---|
| [wink-nlp](https://github.com/winkjs/wink-nlp) + `wink-eng-lite-web-model` | MIT, 2.4.0 | POS tags for `pos`-gated autofix, sentence split, passive detection (be + VBN) | about 95% POS accuracy on WSJ (vendor claim); about 650k tokens/s; [bake-off](https://github.com/cameronsjo/yaae/pull/44): macro-F1 87.8% vs 76.1% for compromise on UD-EWT | ~1 MB gzipped model |
| [compromise](https://github.com/spencermountain/compromise) | MIT, 14.17.0 | Light POS, verb conjugation (utilize → uses), sentence API | ~200 KB; conjugation helps inflection-aware swaps | lower tagging accuracy; rule-based |
| [write-good](https://github.com/btford/write-good) | MIT, 1.0.8 (2022) | Passive voice, weasel words, "there is", too wordy | tiny; same lists as the Vale write-good package | regex passive detection gives false positives on adjectival participles; unmaintained |
| retext family (unified): [retext-passive](https://github.com/retextjs/retext-passive), [retext-simplify](https://github.com/retextjs/retext-simplify), [retext-readability](https://github.com/retextjs/retext-readability), [retext-equality](https://github.com/retextjs/retext-equality) (alex), retext-intensify | MIT | Ready-made checks over an nlcst tree with positions | positions map well to blocks; 327 simplify patterns | last releases 2023–2024; English only |
| [textlint](https://github.com/textlint/textlint) + [textlint-rule-prh](https://github.com/textlint-rule/textlint-rule-prh) / [prh](https://github.com/prh/prh) | MIT, 15.8 / 6.1 | Pluggable linter. prh is a YAML replacement dictionary *with autofix* and regex and inflection patterns. | autofix built in; TS ecosystem | Markdown-centric AST; a second plugin model |
| [harper.js](https://github.com/Automattic/harper) | Apache-2.0, 2.10.0 | Grammar and spelling in WASM, offline | fast (Rust/WASM), maintained by Automattic | grammar checker, not a controlled-language checker; English only |
| [text-readability](https://www.npmjs.com/package/text-readability) | ISC, 1.1.1 | Flesch, FK grade, and other readability scores | simple | readability scores are weak signals for STE |

**Recommended stack:**

- **Tokenization and POS:** wink-nlp
- **Inflection for autofix:** compromise
- **Replacement data:** our own CSV/JSON, in prh-like semantics
- **Passive voice:** a rule built on wink POS (be-form + VBN, skipping adjectival participles), not write-good's regex
- **Not recommended:** textlint and Vale as runtime dependencies

---

## 5. ASD-STE100 as an LLM output constraint

- **Karpathy (X, 2026; [post](https://x.com/karpathy/status/2105819303471976479), quoted verbatim in [zackees/ci.yml#207](https://github.com/zackees/ci.yml/issues/207)):** "Ask your LLM to explain something in ASD-STE100… LLMs well-versed in this language and it comes with heavy constraints on clean writing style that I often find a lot more readable. Sometimes I've tried to soften it a bit e.g. ask for '80% of the way to ASD-STE100' because the spec is quite stringent." The same post ranks diagrams, then HTML pages, then explainer videos as "even better". The issue's risk note matches finding 4: the aerospace dictionary needs a fleet-specific technical-noun and technical-verb list.
- **[AminBlg/SimpleEnglish](https://github.com/AminBlg/SimpleEnglish)** (MIT) is the most measured public attempt.
  - **Rules:**
    - max 20 words per instruction and 25 per description
    - condition before command
    - simple tenses and active voice
    - no should/would/may/might
    - one meaning per word
    - no bold lead-ins
    - no "crucial" or "robust"
  - **Modes:** Plain is the default. Strict adds vocabulary rules.
  - **Results:** STE-linter violations per 100 words fell from 4.09 to 0.91 (−78%) on 8 tasks with Sonnet 4.6. An earlier run reported −81% over 144 generations. Press coverage says −72.9% across 96 generations ([aiweekly](https://aiweekly.co/alerts/simpleenglish-agent-skill-cuts-claude-ste-violations-729)). Output tokens fell on every model.
  - **Caveats from the authors:** single runs vary by about 0.5. A 2026-09-02 audit found the metric measures rule obedience, not reader experience. The judges are Claude models.
- **[Hacker News thread](https://news.ycombinator.com/item?id=49114639):** commenters report that a one-line prompt, "Use ASD-STE100 simplified technical english", gets most of the effect.
- **Academic work:** no peer-reviewed paper found on STE as an LLM generation constraint. Related work:
  - instruction-verbalized constraints: InstructCTG, [arXiv:2304.14293](https://arxiv.org/abs/2304.14293)
  - grammar-constrained agents: Formal-LLM, [arXiv:2402.00798](https://arxiv.org/abs/2402.00798)
  - constrained-generation evaluation: [arXiv:2310.16343](https://arxiv.org/abs/2310.16343), CoDI-Eval [arXiv:2401.00690](https://arxiv.org/abs/2401.00690)
  - a warning that simplification loses word senses: [arXiv:2507.11981](https://arxiv.org/abs/2507.11981). This matters for STE's one-meaning-per-word rule.
  - the CNL survey [arXiv:1507.01701](https://arxiv.org/abs/1507.01701) classifies STE
- **ASD's own FAQ** now says controlled STE text is easier to translate "by translators, neural machine translation engines, or Large Language Models (LLMs)".

**Implications for our three tiers:**

1. **Prompt:** "Write about 80% of the way to ASD-STE100" plus our technical-verb whitelist and 5–6 hard limits (sentence length, no semicolons, active voice, condition first, must/can only).
2. **Deterministic lint:** catches what prompts miss, such as length, semicolons, the CSV swaps, and noun clusters of 4 or more words.
3. **Cheap-LLM rewrite:** only for `no` rows and structural findings.

---

## 6. Open decisions for the profile

These conflicts are documented above. Each needs one owner decision.

1. click vs select
2. sufficient vs enough
3. ensure vs make sure
4. future tense allowed?
5. *run* / *create* / *call* / *return* as whitelisted technical verbs (recommended: yes)

Next: approve or reject the 5 decisions, then filter `replacements.csv` to `autofix_safe=yes` for the first lint pass.
