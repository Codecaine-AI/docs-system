# Docs Authoring Guidance

Generated from Codecaine Docs sources. Snapshot: `sha256:bdf029c4c9e6c8f0ae4c1490c10f0446719bcd2a331b4623e486469d36733107`. Refresh the installation to regenerate these files.

<docs_visual_components source="docs-model component manifests">
  Choose the visual that answers the reader's question. For a layered explanation, use Canvas for system connections, Process Outline for the expected execution trace, and Sequence for a detailed interaction. Link the views with consistent participant and phase names. Include only the views the explanation needs; do not repeat the same detail in all three.

  Canvas answers "What connects to what?" Use it for a high-level system map: major subsystems, ownership boundaries, dependencies, and the data or control connections between them. Group related parts and label connections with what crosses each boundary. For a decomp harness, show the orchestrator, workers, tool service, sandboxes, and evidence store, with their responsibilities and connections. Keep individual tool calls, waits, and shutdown ordering for a Sequence diagram. The block references a canvas sidecar managed through typed canvas tools.

  Process Outline answers "What should happen, and what should the trace look like?" Use its ordered, nested steps to describe the expected execution path from phases down to meaningful operations. Give steps concrete actor-and-action names that a reader can map to trace events; use leaf notes for conditions, expected results, or diagnostic context. For a decomp harness, outline dispatch, worker execution, validation, evidence capture, and cleanup, with substeps where they clarify the expected trace. Use Canvas for the system map and Sequence when interactions between participants, waits, or precise ordering need to be visible. The stored form is an ordered step tree; process-outline notation is its import and projection format.

  Sequence answers "Who calls whom, in what order, and what must finish before the next action?" Use it to explain a bounded interaction in detail: tool calls, request and return paths, sandbox execution, asynchronous work, waits, retries, failures, and shutdown. For a decomp harness, identify the worker, tool service, sandbox, and any other actual participants; show who requests work, who waits for completion, where results return, and when sandbox shutdown occurs relative to those events. Use synchronous calls, asynchronous messages, returns, and guarded fragments to express the documented behavior. Vertical position shows event order, not measured elapsed time; state durations or timing constraints explicitly when supported. Participant order is consistent at the top and bottom. The block references a sequence sidecar managed through typed sequence tools.

  Distinguish intended behavior from an observed trace. Verify participants, calls, cleanup ownership, and timing against source or trace evidence before describing them as current behavior. Mark a proposed flow as proposed. The harness examples above illustrate the choice of visual; they do not establish its actual execution order.
</docs_visual_components>
<docs_component_catalog source="docs-model component manifests">
  ### rich-text

  Block types: paragraph, heading, list-item, quote, callout, divider, image, image-grid, video, html

  Use paragraphs for explanation, headings for hierarchy, lists for steps or parallel facts, quotes for attributed text, and callouts for a distinct note. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.

  Example: Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.

  Details: 10-system-design/40-block-vocabulary/10-rich-text

  ### code

  Block types: code

  Use annotated source listings as evidence of the actual implementation. Put a state instance in State Shape alongside its field definition.

  Example: Show the real validation function and annotate the branch that rejects an invalid write.

  Details: 10-system-design/40-block-vocabulary/20-code-block

  ### file-tree

  Block types: file-tree

  Use a File Tree to explain where files live and what each directory owns. Add notes or change markers when location or a migration is the subject.

  Example: Show the service entry point, skills directory, and generated references with a note for each.

  Details: 10-system-design/40-block-vocabulary/40-file-tree

  ### structured-table

  Block types: structured-table

  Use a Structured Table for a comparison, index, or mapping with the same properties across rows. Use State Shape for nested typed fields.

  Example: Compare supported clients by installation path and connection method.

  Details: 10-system-design/40-block-vocabulary/30-structured-table

  ### interaction-surface

  Block types: interaction-surface

  Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation has its own kind-labeled card. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.

  Example: Document openDocument, applyOperations, and checkDocument with their parameters and results.

  Details: 10-system-design/40-block-vocabulary/60-interaction-surface

  ### state-shape

  Block types: state-shape

  Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it.

  Example: Define an edit task with its project, revision, and status, then show one valid task instance.

  Details: 10-system-design/40-block-vocabulary/50-state-shape

  ### canvas

  Block types: canvas

  Use Canvas for system connections, ownership boundaries, and dependencies. Use Sequence for individual calls and waits.

  Example: Map the external client, shared docs service, and project corpora, labeling the read and write connections.

  Details: 10-system-design/40-block-vocabulary/80-canvas

  ### sequence

  Block types: sequence

  Use Sequence for a bounded interaction where participant order, calls, returns, waits, retries, or failures explain the behavior. Verify the sequence against source or trace evidence.

  Example: Show a client opening a task, reading a document, applying an operation, and receiving validation findings.

  Details: 10-system-design/40-block-vocabulary/70-sequence

  ### process-outline

  Block types: process-outline

  Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace.

  Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

  Details: 10-system-design/40-block-vocabulary/90-process-outline
</docs_component_catalog>
<docs_structure_standards source="docs-system corpus · 10-system-design/10-doc-standards">
  <doc path="10-system-design/10-doc-standards/10-structure" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/10-structure/doc.json" title="Structure">
    Within every layer, the docs keep the same substructure.

    A tree of bundle folders descending L1–L6

    - Three levels in the doc tree

    - Three in the source

    This page states the depth ladder, the folder rules, and why the shape holds.

    ## Structure

    ```
    10-system-design/  # L1 — the layer's parent doc: summary plus an index of every section
    └── 10-doc-standards/  # L2 — a section: the folder is itself a doc introducing its children
        └── 10-structure/  # L3 — a concept doc: one coherent idea (this one)
    30-implementation/
    ├── 20-workbench/  # a single doc — one concept covers it
    └── 40-theming/  # a folder — themes split four ways
    ```

    ## The Depth Ladder

    Six levels — three in the doc tree, three in the source:

    | Level | Lives at | Carries |
    | --- | --- | --- |
    | L1 | A layer's parent doc (00-foundation, 10-system-design, 20-agents, 30-implementation) | Layer summary plus a section index linking every L2 |
    | L2 | XX-section (the section's parent doc) | Section scope and its children, one line each |
    | L3 | A concept doc | One coherent idea — atomic, link-rich, code-connected |
    | L4 | Top of a source file | The file's contract: responsibilities, dependencies, invariants — kept under 50 lines |
    | L5 | Function docstrings | The function's contract: purpose, inputs, outputs, side effects, errors |
    | L6 | The code | The implementation itself — read only after L4/L5 confirm you are in the right place |

    - The ladder is the same in every layer

      - L1–L3 structure foundation, system design, and agents exactly as they structure implementation.

    - The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides.

    - Below L3 the rungs live in the source — in-code docs owns them.

    ## Folders and Bundles

    - A doc is a folder containing `doc.json` — `10-authentication/` holding a bundle, not `10-authentication.md`. The folder name is the doc's address; the bundle inside is its state.

    - Implementation mirrors the source: `src/core/workflow/` documents at `docs/30-implementation/10-core/10-workflow/`. Cross-cutting concerns — logging, caching, error handling — get one primary home, never a scatter.

      - The mirror goes one level per genuine subdivision — deeper structure becomes entries on the area page, not sub-pages; the implementation layer standard owns the rule.

    - A section folder is itself a document: it carries its own `doc.json` — the parent doc — introducing its immediate children, one level deep, one line each.

      - An abstract, not a table of contents: after reading it, a reader can explain the domain and descends only where the task lives.

    - A topic becomes a folder when it needs about three related docs or has clear room to grow; until then it stays a single doc. A folder holding only its parent doc plus one child collapses back into a single doc.

    ## Extension Tiers

    Foundation owns intent, design owns behavior, agents owns agent definitions, and implementation maps the design to the current code and explains key choices. None owns procedure. A repo may declare additional numbered root tiers (40 and above, below 99) for procedural how-to content the four layers cannot hold: authoring recipes, operator guides.

    - **Announced as a guides tier**

      - The tier's parent doc names it a guides tier, so a reader knows on arrival that it carries procedure, not contracts.

    - **Non-normative**

      - The tier defers authority to the four layers via links and never restates their contracts. A rule found there is a pointer, not a source.

    - **Reports stay banned**

      - Point-in-time reports are banned in an extension tier exactly as they are everywhere else in the docs tree.

    - An authoring guide tier holding `defineContext` and `defineState` recipes extends the tree without stretching design to hold procedure.

    ## Why

    - **On disk, next to the code**

      - Every doc is a folder in the repo, versioned with the source it describes.

        - An agent reads and edits it with plain file access — no special tooling.

        - Docs and code change in the same place, so they track together.

    - **Progressive disclosure**

      - Read only what the task needs.

        - The concept doc points at a source file; the file's header says whether to keep going; docstrings answer for each function.

        - Each level rules the next in or out

          - No scattered hunting.

    - **A clear place for everything**

      - The structure answers where a thing lives and where a new thing goes.

        - A human files and finds by walking the numbered tree.

        - An agent searches along the same explicit structure instead of guessing.

  </doc>
  <doc path="10-system-design/10-doc-standards/20-numbering" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/20-numbering/doc.json" title="Numbering">
    Every doc and folder carries a two-digit prefix, and every listing — sidebar, terminal, render — sorts by it identically. 

    This page states the scheme, the reserved ranges, and what running out of gap space actually means.

    ## Structure

    ```
    00-foundation/  # 00 — early/foundational slot, used sparingly
    10-system-design/  # top-level sections gap by ten: 10-, 20-, 30-…
    ├── 10-doc-standards/
    │   ├── 10-structure/  # children start at 10
    │   ├── 20-numbering/  # siblings continue 20-, 30-, 40-…
    │   └── 25-new-standard/  # ← a mid-gap insertion lands here; nothing renumbers (hypothetical)
    └── 40-block-vocabulary/
        └── 10-rich-text/  # the named deviation: type pages run 10–17 dense, one family as a unit
    20-agents/  # participating agents and their definitions
    30-implementation/  # the current code: design mapping and implementation choices
    ```

    ## The Rule

    - Prefix every doc and directory with two digits and a hyphen: `XX-lowercase-hyphenated-name`.

    - Leave gaps of ten (`10-`, `20-`, `30-`) so a new doc can be inserted without renumbering anything.

    - Insert mid-gap first — `25-` between `20-` and `30-` — before considering any reorganization.

    - When the gaps are exhausted, the number line is telling you the section has outgrown its shape: reorganize into a subfolder rather than packing consecutive numbers.

    | Range     | Reserved for |
    | --- | --- |
    | 00–09 | Early or foundational content, used sparingly — 00 is a plain sort prefix, not a reserved slot; new sections start children at 10 |
    | 10–89 | Main content |
    | 90–98 | Late or supplementary content |
    | 99 | Appendix and meta |

    Violations look like: consecutive numbers with no gaps, mixed formats (`1-intro`, `02-setup`, `section-3`), `99-` on anything but appendix material.

    ## Why

    - **Ordered for human reading**

      - The numbers are for people first.

      - Prefixes put reading order in the filesystem itself — sidebar, terminal, and render agree without a manifest.

    - **Insertion is local**

      - A new doc lands mid-gap and nothing else moves, which matters when paths are reference targets.

    - **A clean search path for agents**

      - Second to human reading, and just as real.

      - The same explicit order tells an agent where to search and where to land a change — structure instead of hand-waving.

    - **Exhaustion is a signal**

      - The moment you cannot number a doc, the section needs a subfolder. Packing consecutive numbers silences that signal.

  </doc>
  <doc path="10-system-design/10-doc-standards/30-cross-doc-linking" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/30-cross-doc-linking/doc.json" title="Cross-doc linking">
    Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose. 

    This page states the reference object, which directions links run, and the restraint rules against overlinking.

    ## Structure

    ```json
    {
      "insert": "structure",
      "attributes": {
        "reference": {
          "kind": "doc",
          "path": "10-system-design/10-doc-standards/10-structure"
        }
      }
    }
    ```
    > **L2 (The doc's name):** The span text inlines the target's name — it is the display on both surfaces; the object carries no label.
    > **L6 (The lookup key):** The docs path the backlinks index tracks; moving the target rewrites it here.

    - **The object is the path**

      - `kind`: `"doc"` plus the target's docs path — nothing else.

      - The backlinks index tracks every reference; `docs links check` holds them at zero stale; moving a doc rewrites its inbound paths.

    - **The text is the doc's name**

      - The span text inlines the target's name, so a reference reads as prose on both surfaces.

    ## The Rule

    - **Reference spans, never raw paths**

      - A plain path in prose is invisible to the system and is not a link.

    - **One canonical home**

      - Link to the concept's home doc, never into another section's internals.

      - What crosses a boundary is referenced at the boundary.

    - **No ancestor links**

      - The tree already provides them: parent docs link down, children do not link up.

    - **A link is a claim**

      - It says the reader may need the target for the task at hand.

      - Link the first mention in a doc, not every mention.

      - Decorative links are cut.

    - **No mutual deferral**

      - Two docs each pointing at the other for the full explanation means neither owns it.

      - One doc owns the substance; the other references it.

    - **Governed-by links run upward**

      - An implementation area page links one-way up to the design docs that constrain it; design never links back down.

      - Every restraint rule on this page applies; the implementation layer standard owns the area-page shape.

    ## Why

    - **Tracked links cannot rot**

      - A link the system tracks is held at zero stale, so a reader can trust every one they follow.

    - **The name is the prose**

      - A reference reads as the target's name mid-sentence — no bracket noise on either surface.

    - **A tree for navigation, a web for substance**

      - Parent docs stay the one place navigation happens, so moving through the docs feels the same everywhere.

    - **Restraint keeps links meaningful**

      - When every link is a claim of need, a reader can afford to follow them.

      - Docs that link everything rank nothing.

    - **One home per concept**

      - Every link points at the concept's one home.

  </doc>
  <doc path="10-system-design/10-doc-standards/40-code-linking" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/40-code-linking/doc.json" title="Code linking">
    Docs point at code with typed source references; code never points back. 

    This page states the source-link object, how paths are written, and why the docs side pays all of the maintenance.

    ## Structure

    ```json
    {
      "insert": "packages/docs-viewer/src/render/doc-title.ts",
      "attributes": {
        "code": true,
        "reference": {
          "kind": "source",
          "path": "packages/docs-viewer/src/render/doc-title.ts"
        }
      }
    }
    ```
    > **L6 (A different object):** kind "source" targets a repo file — resolved against the filesystem, not the docs lookup a doc link uses.
    > **L7 (Full path, checkable):** Repo-relative from the root — docs links check verifies the file exists.

    - **A source link is its own object**

      - `kind`: `"source"` with a repo-relative path — optionally a symbol and line.

      - `docs links check` verifies the target file exists; a doc link resolves through the docs lookup instead.

    ## The Rule

    - **One-way, doc to code**

      - No doc links in code comments; the source stays ignorant of the docs.

    - **Full paths**

      - `src/auth/session/manager.ts` — never bare filenames, function names without paths, or vague pointers.

      - The typed reference carries the path, so the claim is machine-checkable.

    - **Inline, with context**

      - Introduce a path where the concept is discussed, with enough context to say why the file matters.

    - **Related Files only at four plus**

      - A full-path list with one-line purposes, at the end, only when a doc references four or more files.

    - **Code moves, docs update**

      - When code moves or renames, the doc updates; `docs links check` reports references whose target no longer exists.

      - No generated navigation scripts

        - List files and explain briefly.

    What the code itself carries — file headers, docstrings, inline comments — is in-code docs's subject.

    ## Why

    - **The maintenance bill lands where it can be paid**

      - Docs know about code, so a refactor ends with a docs pass.

      - The code never waits on one and never carries stale doc paths outward.

    - **A full path is a checkable claim**

      - A bare filename is a vibe; a typed path is verified, and a reader opens it without a search.

    - **Inline beats a link farm**

      - The reader arrives at the path with the question already framed.

  </doc>
  <doc path="10-system-design/10-doc-standards/50-in-code-docs" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/50-in-code-docs/doc.json" title="In-code docs">
    Documentation does not stop at the doc tree. 

    Below the doc tree it continues into the source in three units

    - File headers

    - Function docstrings

    - Inline comments 

    Finishing the descent the depth ladder starts: section, doc, file, function, code.

    ## Structure

    ```typescript
    // packages/docs-viewer/src/render/doc-title.ts
    /**
     * The fixed page title shown above every doc: derived from the SAME name
     * the sidebar shows — the bundle folder's last segment — so the page and
     * the tree read as one thing. Pure string logic, no React.
     */

    /** Words that stay lowercase mid-title (first and last word always cap). */
    const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", …]);
    ```
    > **L2-6 (L4 — the file's contract):** What the file owns and why it lives here, before any code scrolls past.
    > **L8 (L5 — the function's contract):** A docstring on everything non-obvious: purpose, inputs, outputs, side effects, errors.

    No unit carries doc links: code linking is one-way, and the source stays ignorant of the docs.

    ## The Rule

    - **File header**

      - The top of a source file states the file's contract: responsibilities, dependencies, invariants. 

      - A reader knows what the file holds before any code scrolls past. 

      - Kept under 50 lines.

    - **Function docstrings**

      - A non-obvious function states its contract: purpose, inputs, outputs, side effects, errors.

    - **Inline comments**

      - Explain the why of a non-obvious move as the code goes, never restating what the line already says.

    - Each unit answers the question a parent doc answers one level up — is the thing I need below this point?

      - The header rules the file in or out.

      - Docstrings rule the function in or out.

      - Comments carry the reader through what remains.

    ## Why

    - **Files churn too fast for doc bundles**

      - The doc tree stops at L3, one doc per concept. 

      - The lower rungs live in the source, so they move, diff, and review with the code they describe.

    - **The flow pays off at the file**

      - A reader leaves the docs with the question framed; the first screenful confirms or rules the file out. 

      - Code is read last, and only where the task lives.

  </doc>
  <doc path="10-system-design/10-doc-standards/60-implementation-layer" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/60-implementation-layer/doc.json" title="Implementation layer">
    The implementation layer concisely maps the system design to the current codebase: how the code realizes the design, how it is organized, and why key implementation choices were made. An agent whose change conflicts with a recorded structural decision files a proposal; it never silently deviates.

    This page states the shape of an area page, the test an entry must pass, and why the layer accretes lazily.

    ## Structure

    ```
    30-implementation/  # L1 — the layer's parent doc: orientation map of top-level source dirs, one line of ownership each
    └── 30-connectors/  # an area page — mirrors src/connectors/, one level per genuine subdivision
        └── 10-http/  # does not exist — deeper structure becomes entries on the connectors page
    ```

    An area page reads top to bottom in four parts:

    - **Role line**

      - One sentence on what the area does, ending in the source path it documents.

    - **Governed-by links**

      - References up to the design docs that constrain the area — the governed-by convention in cross-doc linking.

    - **Decision entries**

      - Every structural decision in force, in the entry format below.

    - **Orientation roster (optional)**

      - One line per instance when the area is a set, such as a module roster or connector list. Agent definitions belong in Agents.

    ## The Rule

    - **An entry connects design to code**

      - The inclusion test: an entry helps the reader locate how the design is implemented or understand why the current code is built this way. Rules governing future additions remain part of that explanation.

      - Thirty data connectors extend a base class, so connector #31 must too — an inline comment cannot govern a file nobody has written, and system design does not care: behavior is identical either way.

    - **Decision / Why / Applies to**

      - **Decision**

        - The rule, in one sentence.

      - **Why**

        - The reasoning behind it — including the alternative that was rejected, when it is known.

      - **Applies to**

        - The source paths the rule covers, explicitly including future code under them.

    - **Conform or propose**

      - An agent whose change fits the entries follows them; one whose change conflicts files a proposal.

      - Silent deviation is never an option.

    - **Lazy accretion**

      - An entry appears when the design-to-code mapping or a structural choice needs explanation. Do not add filler per directory.

      - A near-empty area page that only routes upward through its governed-by links is correct, not incomplete.

    - **One level per genuine subdivision**

      - The mirror descends one level for each genuine subdivision of the source; deeper structure becomes entries on the area page, not sub-pages.

    - **What stays out**

      - Everything below already has a home; an area page carries none of it.

    | Content | Belongs in |
    | --- | --- |
    | Schemas and state models | `10-system-design` — design owns them |
    | Behavior | `10-system-design` — behavior is design, wherever the code lives |
    | Agent definitions, context, tools, and outputs | `20-agents` owns the agent contracts |
    | File-local detail | In-code docs — file headers and docstrings |
    | Point-in-time reports | Nowhere in the docs tree — the docs describe present state, not moments |
    | Deep file trees | Nowhere — the mirror stops at one level |

    - **Salvage before delete**

      - When report content is removed from a docs tree, still-normative rules buried in it are first extracted into the owning tier — a parity analysis may hold live behavioral contracts; a findings log may hold a real decision.

      - Deletion happens after the salvage pass, never instead of it.

    ## Why

    - **A rule for unwritten code needs a home**

      - In-code docs reach only files that exist; nothing in the source can govern a file nobody has written.

      - Design cannot hold it either — the system behaves identically whether the structure is followed or not.

    - **Proposals keep the architecture deliberate**

      - A standardized layout survives only while every restructuring is a recorded decision; one silent deviation makes the next one invisible.

    - **Lazy entries stay load-bearing**

      - A page written proactively per directory echoes the file tree and rots with it.

      - An entry written when a structure is standardized or violated records a rule someone actually needed.

    - **A shallow mirror survives churn**

      - Sub-pages tracking the source tree file by file go stale with every move; entries on an area page move with the page.

  </doc>
  <doc path="10-system-design/10-doc-standards/70-document-purpose" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/70-document-purpose/doc.json" title="Document Purpose">
    Every document has one primary reader purpose within the corpus's existing layers. Supporting reasons and reference details belong when they help the reader finish that purpose.

    ## Structure

    Diataxis distinguishes four purposes by whether the reader needs action or understanding, for learning or for work.

    - **Tutorial**

      - Help a learner build something through a controlled sequence. State the result at the start and show expected output throughout.

    - **How-To**

      - Help a competent reader finish a task. Use direct steps, relevant conditions, and decision points. Name the guide by the task.

    - **Reference**

      - Supply facts for lookup. Mirror the thing described and state its options, limits, and errors. Generate facts from code where practical.

    - **Explanation**

      - Answer a bounded why question with context, constraints, alternatives, and reasons for a decision.

    ## The Rule

    Choose the primary purpose before authoring. Purpose guides the reader's task; the corpus layers still determine location and authority.

    - Preserve the four layers and the templates defined in Structure.

      - Foundation owns intent. Design owns behavior. Agents owns agent definitions. Implementation maps the design to current code and explains key implementation choices.

      - Procedure belongs in an existing, declared guides tier. Do not create new root categories merely to match Diataxis.

    - Keep one main reader task per page.

      - A standard can state a rule and explain why. A how-to can include a small reference detail needed for its next step.

      - Split and link when a secondary purpose becomes an independently useful page or interrupts the main task.

    - Keep the established standard flow of Structure, The Rule, and Why.

      - Keep implementation area pages and decision entries in the Implementation Layer format.

      - Templates define the page's shape. Purpose determines what belongs inside that shape.

    - Match the detail to the task.

      - Tutorials show visible results and link extended explanation. How-to guides assume competence and omit lessons unrelated to the task.

      - Reference presents facts for lookup. Explanation weighs alternatives and states the reasoning.

    ## Why

    A primary purpose gives the reader a predictable path through a document. Supporting reasons preserve the corpus's requirement that each decision carries its why, without turning every page into a tutorial or an exhaustive catalog.

    The Diataxis distinction comes from [Diataxis](https://diataxis.fr). The Technical Writing source skill records a fetch on 2026-07-18. This attribution does not claim a new fetch.

  </doc>
  <doc path="10-system-design/10-doc-standards/80-authoring-lints" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/10-system-design/10-doc-standards/80-authoring-lints/doc.json" title="Authoring Lints">
    Authoring lints report writing and page structure problems through one docs-model engine. The corpus defines the rules; tools display findings and enforce only the checks assigned to their stage.

    ## Structure

    Rule ownership follows the thing being checked.

    - **Shared Engine**

      - lint/index.ts exports lintDocument and lintRules. lint/engine.ts collects findings, compares a baseline, and formats reports.

    - **Writing Rules**

      - writing/rules.ts registers rule folders with checks and tests derived from Writing Style.

      - Authored prose includes descriptive metadata and document-owned prose fields. Code blocks, quote blocks, inline code, reference spans, paths, signatures, literal examples, and embedded Canvas or Sequence payloads are excluded.

    - **Page Structure Rules**

      - page-structure/rules.ts registers rule folders with checks and tests derived from Structure.

      - The rules inspect the document's block order, heading levels, image alt text, and list nesting.

    - **Other Owners**

      - Existing schema validators own valid block data. Component rules belong with the component whose state they inspect.

      - Canvas and Sequence own their embedded formats. The docs-model lint engine does not inspect those formats or duplicate their checks. Block usage guidance stays in Block Vocabulary.

    ## The Rule

    Every registered rule has a stable ID, a corpus docsPath, a severity, enforcement phases, applicability, exclusions, and a repair suggestion. A finding identifies its field, evidence, and block when available. Optional audit metadata preserves legacy CLI labels and severities without moving rule decisions into the adapter.

    - **Draft Checks**

      - Draft reports show findings while an author builds incomplete content. The current catalog does not block draft edits.

      - Direct UI saves and create-only blank tree operations remain draft or diagnostic operations. They do not create a general finalization workflow.

      - Full Docs Writer writes and Docs Lab proposal acceptance enforce introduced required findings. This policy does not gate every disk write.

    - **Completion Checks**

      - A finding blocks completion only when it is introduced, has error severity, and its rule enforces the complete phase.

      - With a baseline, matching semantic evidence counts as existing even when block IDs change. Matching respects duplicate counts. Without a baseline, all findings count as introduced.

      - Existing findings remain visible. A baseline does not waive a different finding introduced by an edit.

      - Docs Writer retains the original valid document for the session after the first successful write. Later writes and docs_check compare against that original. Checking an untouched document runs an absolute audit. The baseline is session-local and does not persist across sessions.

    - **Required Repairs**

      - Agents read the lint response, fix every blocking finding within the task, and check the result again before reporting completion.

      - If a required repair cannot be completed, report the remaining finding. Do not claim the document passed.

    - **Editorial Review**

      - Warnings ask the author to inspect a passage. They do not block completion and do not prove the passage is wrong.

      - Human judgment still governs sentence clarity, purpose, the join test, Title Case, and most style patterns. A clean lint result does not certify every writing rule.

    ## Current Checks

    The executable catalog is the source for exact applicability and exclusions. These checks cover only part of the corpus guidance.

    - **Writing Error**

      - writing.no-em-dash flags em dashes in authored prose and descriptive metadata. It enforces completion and respects the writing exclusions above.

    - **Writing Warnings**

      - writing.filler flags `in order to`, `due to the fact that`, `it is important to note that`, and `as mentioned above`.

      - writing.dense-paragraph flags paragraphs over 120 prose words. This threshold is separate from the sentence-length review guidance.

    - **Page Structure Warnings**

      - structure.opening-paragraph requires a nonempty opening paragraph after an optional initial H1. It does not count opening sentences.

      - H1 headings are permitted in the document body, including multiple H1 sections. The former structure.single-h1 warning is no longer active. structure.heading-order still flags skipped heading levels.

      - structure.image-alt requires nonempty alt text on standalone images and every image-grid entry. Grid headings and captions also pass through the shared prose checks. These rules remain advisory, matching the existing audit policy. Promote a rule by changing its own severity and enforcement metadata after reviewing corpus impact.

    - **Page Structure Warning**

      - structure.deep-list flags list nesting deeper than three list items. Nested supporting details remain valid; review whether a branch needs its own section.

    - process-outline.single-parent requires one named, non-note root with at least one action child in every completed Process Outline. Empty outlines, childless roots, and multiple roots produce errors. Draft edits remain writable; new violations block completion. Nest related phases under one parent, or split independent processes into separate blocks.

    - bundle-relative-src rejects bare assets/... src values on completed canvas, sequence, image, and video blocks. Prefix bundle assets with ./, or use a docs-root-relative path or URL.

    ## Why

    structure.title-heading detects only an opening H1 that repeats the display title. Every document save removes that duplicate before linting and persistence, preserving its children. Distinct opening H1s and later H1s remain unchanged; heading levels are never demoted by cleanup. The edit and correction share one undo patch, and the response returns the final document and revision. Ordinary edits need no repair-tool call.

    Shared rules let CLI checks and agent tools report the same evidence and repair guidance. Completion checks require new errors to be repaired at the supported completion boundaries. Keeping warnings advisory prevents a phrase match from overruling a correct quotation, precise term, or useful explanation.

  </doc>
</docs_structure_standards>
<docs_style_guide source="docs-system corpus · 99-appendix/10-style-guide">
  <doc path="99-appendix/10-style-guide/10-writing-style" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/99-appendix/10-style-guide/10-writing-style/doc.json" title="Writing style">
    Write matter-of-fact prose that states what is, in the order the reader needs it. This page defines sentence clarity, punctuation, and the Unslop pattern catalog for the corpus.

    - Lead with the fact. The first sentence of a doc or section states the thing itself. No setup, no "the idea here is".

    - One idea per sentence, one topic per block. A plain lead sentence plus fact bullets beats a paragraph of prose.

    - Concrete over vague: real numbers, real paths, real names. "Sixteen types", never "several".

    - No preamble, no recap, no closing remarks. Start at the answer; stop when it is stated. Tangents move to their own home and get a link, not a sidebar.

    - Assume no memory: a section stands alone or links to what it needs. Never `as mentioned above`.

    - Present-state prose: a finished doc describes what exists now. No change-log voice ("now", "previously", "no longer") unless the doc is explicitly about migration history.

    ## Write Sentences to the Reader

    Use plain words and the real names from the codebase. Keep a longer sentence when it carries one thought clearly.

    - Address the reader as "you" and use the present tense.

      - Reserve "will" for a later event. Do not announce uncommitted features.

    - Name the actor and action.

      - Write "the compiler checks the schema" instead of "the schema is checked". Passive voice fits when the actor is unknown or irrelevant.

    - Write instructions as direct commands.

      - Put the condition or warning before the action it guards. Put the common case before exceptions.

      - Give each sentence one instruction. Review instructions over about 20 words and other sentences over about 25 words. Split at a second thought, not at an arbitrary count.

    - Use the short, everyday word.

      - Replace "utilize" and "leverage" with "use", "facilitate" with "help", "numerous" with "many", and "in the event that" with "if".

      - Cut words that add nothing. Keep words that prevent a second reading.

    - Write like a knowledgeable colleague.

      - Omit "please", "simply", "easy", and "quickly" from procedures. Read an awkward sentence aloud and rewrite it if it stays awkward.

      - Vary sentence lengths. Avoid consecutive sentences with the same opening. Give a view when the document's purpose calls for judgment.

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

      - Acknowledge real complexity. Use first person where ownership matters. Allow natural variation instead of forcing every sentence into the same length or template.

    ## Sources

    This page incorporates the existing Technical Writing and Unslop guidance. Source dates below record the prior Technical Writing attribution, not a new fetch.

    - [Google Developer Style](https://developers.google.com/style) supplies the sentence and reader guidance. The source skill records a fetch on 2026-07-18. This corpus keeps Title Case headings.

    - [ASD-STE100](https://asd-ste100.org), Issue 9, 2025, supplies transferable instruction principles. The source skill records a fetch on 2026-07-18. The full numbered rules and dictionary remain in the specification.

    - John R. Kohl's The Global English Style Guide, SAS Press, supplies ambiguity guidance. The source skill records the Internet Archive and SAS sample chapter as sources fetched on 2026-07-18.

    - Technical Writing records its corpus structure guidance as merged from this style guide on 2026-08-19. Unslop supplies the pattern catalog integrated into this page.

    ## Worked Example

    The revision names the actor, preserves the condition, and states the result.

    > Before: Configuration of the import budget script parameters is performed via budget.json. Note that it is important to remember that running with --write should only be done when lowering the budget. If exceeded, CI fails.

    > After: budget.mjs reads budget.json and counts the imports. If the count exceeds the budget, CI fails. Run budget.mjs --write only to lower the budget.

    The filenames in this example are illustrative. In a real document, use the project's actual paths and symbols.

    ## Review Checklist

    Read the rendered document before finishing.

    1. Confirm one primary purpose inside the existing layer and template.

    2. Check that the opening establishes relevance and bullet groups pass the join test.

    3. Put conditions before commands and give each sentence one instruction or thought.

    4. Resolve ambiguous pronouns, modifier placement, missing verbs, and inconsistent names.

    5. Replace inflated language with facts, verify paths and claims, and repair required lint findings.

  </doc>
  <doc path="99-appendix/10-style-guide/20-structure" file="/Users/Ford/workspace/codecaine/core/docs-system/docs/99-appendix/10-style-guide/20-structure/doc.json" title="Structure">
    Page structure carries meaning through bullets, lists, headings, titles, and openings. The join test keeps bullet groups complete enough to read as prose.

    - **Bullets Carry Prose Meaning**

      - Use bullets as the default reading shape. A lead sentence states the claim, and each bullet is a complete sentence with its relationships and qualifiers attached.

      - Apply the join test. The lead plus the bullets, read in order, should reconstruct a well-written paragraph.

      - Consecutive fragments with the same subject, such as "X carries A" and "X carries B", can mean that the sentence relating the facts was deleted.

    - **Separate the Lead From Its Gloss**

      - Put a bold label, a link, or a short phrase in the parent bullet. Put supporting facts in sub-bullets.

      - Nest a second independent idea instead of packing the line. Never split one thought into fragments to manufacture nesting.

    - **Avoid Duplicating Structured Blocks**

      - Writing before a table or state-shape orients the reader. Bullets that restate its rows are duplication that will drift.

    - **Number Sequential Actions**

      - Use a numbered list for multi-step work, with one bounded action per step.

      - Lists cap at about five items. Split or rank longer lists.

    - **Make Headings Useful for Scanning**

      - Keep a section short enough to scan in one screen. Use Title Case headings, leaving minor words lowercase and preserving acronyms and code-marked spans.

      - The display title and body headings are separate. H1 headings are allowed in the body. Do not begin the body with an H1 that repeats the display title. Preserve meaningful heading levels. Standards and design docs share the flow Structure, The Rule, and Why.

    - **Give Each Page a Distinct Title and Opening**

      - The title differentiates the doc from its siblings in a bare listing. Use "Component Themes", not "Themes, Continued".

      - Open the body with a paragraph of 2 to 4 sentences so a reader arriving mid-corpus can judge relevance without reading the rest.

    ## Keep the Skim Path Clear

    Headings and lists expose the order in which a reader needs information.

    - Use a bare verb phrase for a task heading and a noun phrase for a concept heading. Do not skip heading levels.

    - Introduce a list with a complete sentence and keep its items parallel.

    - Preserve the established page template. Supporting reasons or reference details can serve the page's primary purpose, as defined in Document Purpose.

    - Give every image nonempty alt text that describes the information it contributes.

  </doc>
</docs_style_guide>
