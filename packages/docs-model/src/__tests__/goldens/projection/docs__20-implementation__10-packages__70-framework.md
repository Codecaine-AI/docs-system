# framework — the loadable skill

`@codecaine-ai/docs-framework-skill` is the agent-loadable skill for working inside a docs corpus: how to navigate it, produce new docs, and maintain existing ones. It is deliberately imperative and rationale-free — rules, workflows, and templates an agent loads and follows at authoring time.

## What it owns

At `packages/framework/`: the `SKILL.md` entry point host repositories symlink into their agent tooling, the intent cookbook (navigate / produce / maintain), the imperative structure standards (layers, numbering, linking), document templates, and maintenance workflows.

## What it deliberately does not own

The why. Every structural rule's rationale lives in doc standards; the intent behind the whole system lives in the manifesto. The skill states rules; the corpus defends them. When a structural decision changes, both update in the same change — the design doc carries the reasoning, the skill carries the new instruction.

## Why it is a package at all

Distribution convenience, honestly. Being a workspace package lets a host repository resolve, version, and symlink the methodology like any other dependency. It has zero dependencies, imports nothing, and ships in no runtime — a running docs installation behaves identically whether the package is present or absent.

> **DECISION: Boundary under review: this may not need to be a package** — Framework-as-package is itself under review. The same material could live as plain repository content or use its own distribution channel; the packaging is a convenience, not an architectural layer.

> **INFO: North star: the skill as a render** — By this system's own model, the skill is a render of the corpus: the canonical rules and their reasons live in the docs, and the skill is the authoring surface an agent loads. Generating the skill from the corpus — so the two can never drift — is the intended end state.
