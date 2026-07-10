# Manifesto

This repository exists to make documentation the shared medium between humans and agents. Code is a lossy projection of intent. These docs keep the intent close enough to rebuild from it.

The agent-read markdown projection is the primary consumer of every document. An agent should never have to parse `doc.json` to read a doc. The JSON is the stable storage form; markdown is the reading contract.

Humans get the same blocks rendered in the workbench. Both readers move through the system by progressive disclosure: intent first, concepts next, implementation only when the task calls for it. The structure should let a reader find the relevant subsystem without reading the whole manual.

> **Prime directive: Markdown is the contract** — Write every document for the agent that will read it as markdown. If the projection reads wrong, the document is wrong.

---

## The authoring model

The authoring model is deliberately small: **fourteen block types, and no more**. A minimal vocabulary keeps the projection stable, the editor learnable, and the agent edit surface enumerable.

> State is an annotated JSON code block; the ways to change that state are an interaction-surface block.

Text blocks edit as text. Object blocks edit through typed, discoverable actions. Discovery belongs in the system, not in tribal memory; `GET /api/blocks` exists so an agent can learn the available moves before it mutates state.

This repo is the proving ground for that rule. Its own documentation must be clear to agents, pleasant for humans, and constrained enough that edits can be made by operation instead of by guesswork.

## The layers

Foundation is the why. It captures the north star, the constraints, and the beliefs that should survive rewrites. This document belongs there because it says what docs-system is trying to preserve.

System Design is the concept layer: the data model, the block vocabulary, and the mutation model. It says how the system should behave independent of any particular codebase.

Implementation is the current projection into packages, routes, commands, and UI. It starts at the implementation overview, and it is expected to change as the code changes.

A reader starts here and descends only as far as the task requires. If the task is about purpose, stay in Foundation. If it is about behavior, move into System Design. If it is about current mechanics, continue into Implementation.

---

## The conviction

The docs are the durable artifact. The code is the current projection. When they disagree, the right question is not which file is newer; the right question is where the intent is most clearly preserved.

If a better model arrives next year, you should be able to hand it Foundation plus System Design and get a better implementation back. That is the bet: intent outlives any one projection.
