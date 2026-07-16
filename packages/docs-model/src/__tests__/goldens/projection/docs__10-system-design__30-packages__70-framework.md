# framework — the methodology

`@codecaine-ai/docs-framework-skill` is the documentation methodology: the how-to-run-docs-in-a-project layer. It contains guidance and reusable authoring material, not runtime code.

## What it owns

At `packages/framework/`, it owns the manual—architecture reference, standards, hierarchy conventions, and setup guide—plus document templates and the skill definition that host repositories symlink into their agent tooling.

## Why it is a package at all

The honest reason is distribution convenience. Being a workspace package lets a host repository resolve, version, and symlink the methodology like any other dependency; the packaging is not an architectural layer.

## Dependencies

None. The package has zero dependencies and imports nothing. Nothing depends on it at runtime, and it does not ship in the server, viewer, or CLI. A running docs installation behaves identically whether the package is present or absent.

## Using it alone

A repository can adopt the manual, templates, and skill without running any of the software. In that mode, it uses only the documentation method.

> **Boundary under review: This may not need to be a package** — Framework-as-package is itself under review. It may not need to remain a workspace package at all; the same material could live as plain repository content or use its own distribution channel.
