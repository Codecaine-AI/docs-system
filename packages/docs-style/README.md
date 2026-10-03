# docs-style

This package checks and cleans up writing style across the docs corpus. It applies the STE Profile (`docs/99-appendix/10-style-guide/30-ste-profile`) and the Vocabulary page (`40-vocabulary`), following the design in Style Enforcement (`docs/10-system-design/10-doc-standards/85-style-enforcement`).

Everything for this feature lives in this one package. Start with `src/types.ts`, which holds every contract.

## The Pipeline

```
page ─► Tier 1 lint ─► autofix ─► Tier 2 judge ─► Tier 3 rewrite ─► guardrails ─► change set
        (code)        (safe swaps)  (Jev yes/no)    (cheap model)      (keep content, no slop)
```

- **Tier 1 lint** runs code rules on every page. It is free and exact.
- **Autofix** applies swaps that cannot change meaning, such as `in order to` to "to".
- **Tier 2 judge** asks Jev one cached yes/no question per block.
- **Tier 3 rewrite** sends only blocks with structure findings to a cheap model.
- **Guardrails** reject any rewrite that loses content or adds slop.

A sweep changes nothing on disk. It returns the changes, and a later step stages them as proposals for review.

## Folder Map

| Folder | What It Holds |
| --- | --- |
| `src/types.ts` | Every shared contract: rules, findings, adapters, guardrails, sweep results |
| `src/profile/` | The STE profile as data: limits, the deny list, naming groups, technical nouns and verbs |
| `src/text/` | Prose helpers: sentences, STE word count, part-of-speech tagging, instruction detection, quotes, safe span edits, inflection, page context, markdown bridge |
| `src/rules/` | One folder per rule. Each folder is a complete slice of one rule. |
| `src/judge/` | The Tier 2 adapters: the Jev client and a fake |
| `src/rewrite/` | The Tier 3 adapters: the BAML client and a fake, plus span protection and markdown-to-ops |
| `src/guardrails/` | The rewrite checks: no lost content, no added slop |
| `src/sweep/` | The pipeline that runs every tier over a set of pages |
| `src/report/` | The A-B report: one HTML file with counts and before-and-after diffs |
| `src/cli.ts` | The `docs style` command |
| `baml_src/` | The rewrite prompt and model clients. `baml_client/` is generated from it. |

## The Rules

Thirteen STE rules live in `src/rules/`. The sweep also runs the core docs-model rules, such as `writing.semicolon` and `writing.no-em-dash`.

| Rule | Layer | Tier | What It Catches |
| --- | --- | --- | --- |
| `sentence-length` | structure | 1 | Instructions over 20 words, descriptions over 25 |
| `paragraph-length` | structure | 1 | Paragraphs over 4 sentences |
| `verb-forms` | structure | 1 | Progressive ("is running") and perfect ("has run") tenses |
| `passive-voice` | structure | 1, confirmed by 2 | Passives with a "by" actor, or inside an instruction |
| `one-topic` | structure | 2 | A sentence that joins two complete sentences |
| `one-instruction` | structure | 2 | A step that gives two instructions |
| `condition-first` | structure | 2 | "Run X if Y" instead of "If Y, run X" |
| `replacement` | vocabulary | 1 | Deny-list words, with autofix for safe swaps |
| `filler` | vocabulary | 1 | Filler words, with autofix for safe deletions |
| `modal-verbs` | vocabulary | 1 | should, may, might, could, would |
| `one-name` | vocabulary | 1 | Two names for one concept on a page |
| `noun-cluster` | vocabulary | 1 | Four or more nouns in a row |
| `undefined-term` | vocabulary | 2 | An internal term with no definition or link |

## One Rule, One Folder

Each rule in `src/rules/<name>/` exports one `StyleRule` and owns four parts.

- **Detect** finds the problem with code (Tier 1).
- **Autofix** fixes the safe cases (Tier 1).
- **Judge** asks Jev a yes/no question (Tier 2).
- **Hint** tells the rewrite model how to fix it (Tier 3).

A rule uses only the parts it needs. To add a rule, create its folder and add it to `src/rules/index.ts`. The pipeline needs no change.

Each rule has a layer.

- **Structure** rules shape sentences and blocks. Their findings trigger a model rewrite.
- **Vocabulary** rules suggest words. They never block a page, and they never trigger a rewrite on their own.

## Adapters

The pipeline takes two adapters as arguments, so tests run with fakes and real runs use services.

- **Judge** answers yes/no questions. The real adapter calls Jev (TypeSafe System One, `TYPESAFE_API_KEY`).
- **Rewriter** rewrites one block. The real adapter calls GPT-6 Luna through codex-lb (`127.0.0.1:2455`) and retries on GPT-6.1 Sol.

## Commands

Run these from the `docs-system` folder.

```sh
bun run docs style lint                     # Tier 1 counts for the whole corpus
bun run docs style sweep --pilot            # all tiers on the pilot pages, no writes
bun run docs style report <sweep.json>      # the A-B HTML report
```

## The Local STE Dictionary

The full ASD-STE100 Issue 9 dictionary is copyrighted. It stays local in `proposals/ste-writing-profile-2026-10-02/ste100/`, which git ignores. The profile can read it for information-only counts. No rule depends on it.
