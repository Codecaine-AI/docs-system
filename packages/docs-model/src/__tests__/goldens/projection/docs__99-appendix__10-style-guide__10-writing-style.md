Write matter-of-fact prose that states what is, in the order the reader needs it. This page defines sentence clarity, punctuation, and the Unslop pattern catalog for the corpus. The STE Profile adds stricter word and sentence limits to these rules.

- Lead with the fact.

  - The first sentence of a doc or section states the thing itself. No setup, no "the idea here is".

  - A lead sentence states a fact that its list supports. Never write a lead that only says a list follows, such as "These rules apply."

  - An opening that names the page's sections names them in the order the headings use. Leave the sections out when the headings already show them.

- One idea per sentence, one topic per block.

  - A plain lead sentence plus fact bullets beats a paragraph of prose.

- Concrete over vague.

  - Use real numbers, real paths, and real names. Write "Sixteen types", never "several".

- No preamble, no recap, no closing remarks.

  - Start at the answer. Stop when it is stated.

  - Write only what the page's task asks for. A tangent or a related task, such as undoing or maintaining what the page sets up, moves to its own page and gets a link.

  - Cut a section, a sentence, or a rule that the task does not ask for, even when it is true. A list never repeats a step that the page already gives.

    - Read every branch, then write the ones the reader can hit or must act on: an error they can see, an option they can pass, a limit they can reach. A retry count, a fallback id format, a helper's internal steps, or a plugin list stays in the source unless the task asks how the code works inside.

- Assume no memory.

  - A section stands alone or links to what it needs. Never `as mentioned above`.

- Present-state prose.

  - A finished doc describes what exists now. No change-log voice ("now", "previously", "no longer") unless the doc is explicitly about migration history.

## Match the Source

A reader acts on what the page says, so each claim must hold in the code or document it describes. Check these five faults against the source before you finish a page.

- A list of rules, routes, status codes, error causes, options, or files names every item the source has, and a complete list never calls itself partial.

  - Read each file before you say what it holds, even when only an import names it.

  - Leave items out only when the task does not ask for the whole set. Then say how many you leave out and name the file that holds them.

- A claim says only what the code checks. Before you write a guarantee, a failure result, or a cause, find the line that makes it true.

  - A guarantee names the check behind it. Write "loadConfig rejects a file with an unknown key", not "loadConfig keeps the config valid", when no check covers the other fields.

  - A claim about what code does names the function that does it, in inline code. When the reader reaches that code through a command, such as doctor or install, name the command, not the function behind it.

    - Before you write the claim, read that function's whole body. An early return, a thrown error, a guard for a missing value, a check for a repeated value, or a branch for another mode can change the claim.

    - A pseudocode line or a call-stack row keeps each condition and guard of the source line it condenses, such as `layout?.width` for a layout that can be missing.

    - A fix you tell the reader to make passes every check in the code that refused.

  - A failure result names the failures it covers. Write "A save that fails the hash check leaves the file unchanged", not "A failed save leaves the file unchanged", when a later step can fail after the write.

  - A status or error names every cause that sets it. Write "A cache miss means the key was never set, expired, or was evicted", not "A cache miss means the key expired".

  - Write "every", "all", "only", "never", "nothing", or "always" when a line of the source proves it. Otherwise name the condition, as in "every existing file" or "the planning checks".

- A choice the page offers holds through every later step the reader runs. Before you offer an option, a fix, or a partial path, follow it through each later step on the page.

  - Say what each later step does when the reader takes the choice. Write "`lint` checks every package, so after `build --only api` it reports `web` as stale", not only "Pass `--only` to build fewer packages".

  - A rule that keeps, removes, or allows a set names each case the source treats another way. Write "keeps every other key except a legacy entry it wrote", not "keeps every other key", when the source removes that entry.

- A condition, exception, or option you add leaves each sentence it changes with one reading. Add it by rewriting the sentence, not by appending a clause or a step.

  - Rewrite the title, heading, or lead that the exception narrows, so it still holds. Title a warning "Validation errors write nothing", not "Errors write nothing", when its body names an error after the write.

  - Give each result its own condition. Write "`load` returns null when the file is missing, and `parse` throws when it is empty", not "When the file is missing or empty, `load` returns null and `parse` throws".

  - Write an alternative with "or", in the step it replaces. Write "Run `deploy`, or for a dry run, run `deploy --plan`", not a step "Run `deploy`" followed by "For a dry run, pass `--plan` first".

- A code example runs as written when a reader copies it. Two commands in one block never write the same file, and each placeholder is marked as a placeholder.

  - Put a command in a code block only when the reader runs it and no other block on the page shows it. Show each command once: a code block never repeats the commands that a process outline, a numbered step, or a table on the page already shows whole.

## Write Sentences to the Reader

Use plain words and the real names from the codebase. Keep a longer sentence when it carries one thought clearly.

- Address the reader as "you" and use the present tense.

  - Reserve "will" for a later event. Do not announce uncommitted features.

- Name the actor and action.

  - Write "the compiler checks the schema" instead of "the schema is checked". Passive voice fits when the actor is unknown or irrelevant.

- Write instructions as direct commands.

  - Put the condition or warning before the action it guards. Put the common case before exceptions.

  - Give each sentence one instruction.

    - Review instructions over about 20 words and other sentences over about 25 words. Split at a second thought, not at an arbitrary count.

- Use the short, everyday word.

  - Replace "utilize" and "leverage" with "use", "facilitate" with "help", "numerous" with "many", and "in the event that" with "if".

  - Cut words that add nothing. Keep words that prevent a second reading.

- Write like a knowledgeable colleague.

  - Omit "please", "simply", "easy", and "quickly" from procedures. Read an awkward sentence aloud and rewrite it if it stays awkward.

  - Vary sentence lengths. Avoid consecutive sentences with the same opening.

  - Give a view when the document's purpose calls for judgment.

## Remove Ambiguity

Each sentence has one clear reading. Use the real symbol, file, flag, or command name instead of rotating synonyms.

- Keep modifiers next to the words they change.

  - "Fails only on growth" limits when failure happens. "Only fails on growth" can limit what happens.

- Give every pronoun one obvious referent.

  - Repeat the noun when "it", "they", "this", or "which" could name several things or a whole clause.

  - Break noun strings into relationships. Write "the script that checks the import budget" instead of "the import budget check script".

- Keep the small words that show sentence structure.

  - Keep articles and needed instances of "that". Write "Remove the backup file".

  - Give every clause its verb. Write "Phase 1 moves the converters and Phase 2 moves the runtime".

  - Repeat the article when two objects are separate, as in "the client and the host".

- Make logical grouping explicit.

  - Use "both ... and", "either ... or", or "if ... then" when conjunctions could group two ways.

  - Write "a, b, or both" instead of a slash construction. Write singular or plural directly instead of appending a parenthesized s.

- Give each term one meaning and each action one name.

  - Use "start" consistently instead of alternating with "initiate". Avoid ambiguous words ending in "-ing" when a direct verb is clearer.

  - Avoid idioms, Latin abbreviations, and figurative language. Preserve precise technical terms and literal code syntax.

  - Define each term where the page first uses it, in plain words or with a link. A phrase you build from a code name is a term too. Write "the retry budget, the number of retries left before `send` gives up", not only "the retry budget", for `retryBudget`.

  - Name the unit that a count, a length, or an offset uses in the code. JavaScript `length` and `slice` count UTF-16 code units, so write "UTF-16 code units" there, not "characters".

## Use Punctuation and Formatting Deliberately

Formatting identifies structure and exact syntax. It does not supply emphasis that the facts lack.

- Use periods or commas to separate thoughts.

  - Do not author em dashes. Do not substitute parentheses, en dashes, or hyphens as sentence separators.

  - Use periods instead of semicolons. Use colons before a list or example, not as a connector between thoughts.

  - Literal code and quoted source material keep their original punctuation.

- Use straight quotes and serial commas.

  - Drop "etc." and introduce a partial list as examples.

- Put code in code font and UI controls in bold.

  - Do not bold every proper noun or acronym. Remove decorative emojis from headings and bullets.

- Name link destinations.

  - Use the page title or a short description instead of "click here". Give enough local context for the reader to decide whether to follow the link.

- Preserve the corpus page shape.

  - Use Title Case headings, bullets, and nested supporting detail as defined in Structure.

  - A parent label and its supporting detail belong on separate list levels. Do not repeat the label in a bold label-colon opening.

## Remove Inflated Content

Unslop is part of this writing style. These patterns require an editorial check, not automatic deletion of every matching word.

- Cut puffery and promotional descriptions.

  - Replace "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", and "deeply rooted" with the event or fact.

  - Replace "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", and "must-visit" with concrete descriptions.

- Give attribution a source and a claim.

  - Do not list media outlets without saying what one reported. Replace "Experts believe", "Industry reports suggest", and "Some critics argue" with a named source or remove the claim.

- Remove unsupported trailing commentary.

  - "Highlighting", "ensuring", "reflecting", "showcasing", and "fostering" clauses need a specific mechanism or source. Supply it or cut the clause.

- Replace formulaic challenges with facts.

  - "Despite challenges, the project continues to thrive" needs the actual constraint, result, and evidence.

- Say what the system does.

  - Write "a column rename fails the build", not "types follow your schema".

  - If a claim could appear unchanged in another project's docs, supply the mechanism, instruction, or number that makes it useful here.

## Replace Formulaic Language

Words earn their place by naming something precisely. Familiar technical meanings are valid even when the same word is filler elsewhere.

- Review stock vocabulary.

  - Check "additionally", "crucial", "delve", "enduring", "enhance", "fostering", "garner", "interplay", "intricate", "landscape", "pivotal", "showcase", "tapestry", "testament", "underscore", and "vibrant" for a plainer word.

- Use "is" and "has" when they say enough.

  - Replace ornamental "serves as", "stands as", "boasts", and "features". State the point directly instead of "not just X, but Y".

- Use the natural number of ideas and one name per thing.

  - Do not force groups of three or cycle through synonyms to avoid repetition.

  - Use "from X to Y" only for a meaningful scale or range. Otherwise list the topics directly.

- Replace abstract metaphors with the mechanism's name.

  - Review "substrate", "wedge", "vector", "locus", "vantage", "nexus", "primitive", "harness", "surface", "bedrock", "scaffolding", "modality", "paradigm", "gold-plating", "ratchet", "evacuate", "endgame", "north star", and "flywheel" when used as metaphors.

  - Write "base", "add", "method", "move out", or "last phase" when that is the meaning. Name a limit that only tightens instead of calling it a ratchet.

- Cut filler and unsupported intensity.

  - Replace `in order to` with "to" and `due to the fact that` with "because". Delete `it is important to note that`.

  - Replace an adverb with a stronger verb or measured result. Keep uncertainty that the evidence requires, but reduce stacked hedges such as "could potentially possibly" to one.

## Remove Conversation Artifacts

Documentation states the answer. Personality comes from specific facts, useful judgment, and varied rhythm.

- Remove chatbot greetings, praise, and closers.

  - Cut "Of course", "Certainly", "Great question", "You're absolutely right", "I hope this helps", "Let me know if", and "Found the smoking gun".

- Replace cutoff disclaimers with evidence.

  - "While specific details are limited" does not support a claim. Find the source or remove the claim.

- Replace generic conclusions with specific plans or facts.

  - "The future looks bright" says nothing a reader can act on.

- Keep the voice human without making facts imprecise.

  - Acknowledge real complexity.

  - Use first person where ownership matters.

  - Allow natural variation instead of forcing every sentence into the same length or template.

## Sources

This page incorporates the existing Technical Writing and Unslop guidance. Source dates below record the prior Technical Writing attribution, not a new fetch.

- [Google Developer Style](https://developers.google.com/style) supplies the sentence and reader guidance.

  - The source skill records a fetch on 2026-07-18.

  - This corpus keeps Title Case headings.

- [ASD-STE100](https://asd-ste100.org), Issue 9, 2025, supplies transferable instruction principles.

  - The source skill records a fetch on 2026-07-18.

  - The full numbered rules and dictionary remain in the specification.

- John R. Kohl's The Global English Style Guide, SAS Press, supplies ambiguity guidance.

  - The source skill records the Internet Archive and SAS sample chapter as sources fetched on 2026-07-18.

- Technical Writing records its corpus structure guidance as merged from this style guide on 2026-08-19. Unslop supplies the pattern catalog integrated into this page.

## Worked Example

The revision names the actor, preserves the condition, and states the result. The first paragraph below is the original, and the second is the revision.

Configuration of the import budget script parameters is performed via budget.json. Note that it is important to remember that running with --write should only be done when lowering the budget. If exceeded, CI fails.

budget.mjs reads budget.json and counts the imports. If the count exceeds the budget, CI fails. Run budget.mjs --write only to lower the budget.

The filenames in this example are illustrative. In a real document, use the project's actual paths and symbols.

## Review Checklist

Read the rendered document before finishing.

1. Confirm one primary purpose inside the existing layer and template.

2. Check that the opening establishes relevance and bullet groups pass the join test.

3. Put conditions before commands and give each sentence one instruction or thought.

4. Resolve ambiguous pronouns, modifier placement, missing verbs, and inconsistent names.

5. Replace inflated language with facts, verify paths and claims, and repair required lint findings.
