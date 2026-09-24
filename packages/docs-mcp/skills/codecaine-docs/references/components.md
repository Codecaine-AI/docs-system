# Component Selection

Generated from Codecaine Docs sources. Snapshot: `sha256:bdf029c4c9e6c8f0ae4c1490c10f0446719bcd2a331b4623e486469d36733107`. Refresh the installation to regenerate these files.

### rich-text

Block types: paragraph, heading, list-item, quote, callout, divider, image, image-grid, video, html

Use paragraphs for explanation, headings for hierarchy, lists for steps or parallel facts, quotes for attributed text, and callouts for a distinct note. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.

Example: Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.

Details: [rich-text](components/rich-text.md). Canonical document: `10-system-design/40-block-vocabulary/10-rich-text`.

### code

Block types: code

Use annotated source listings as evidence of the actual implementation. Put a state instance in State Shape alongside its field definition.

Example: Show the real validation function and annotate the branch that rejects an invalid write.

Details: [code](components/code.md). Canonical document: `10-system-design/40-block-vocabulary/20-code-block`.

### file-tree

Block types: file-tree

Use a File Tree to explain where files live and what each directory owns. Add notes or change markers when location or a migration is the subject.

Example: Show the service entry point, skills directory, and generated references with a note for each.

Details: [file-tree](components/file-tree.md). Canonical document: `10-system-design/40-block-vocabulary/40-file-tree`.

### structured-table

Block types: structured-table

Use a Structured Table for a comparison, index, or mapping with the same properties across rows. Use State Shape for nested typed fields.

Example: Compare supported clients by installation path and connection method.

Details: [structured-table](components/structured-table.md). Canonical document: `10-system-design/40-block-vocabulary/30-structured-table`.

### interaction-surface

Block types: interaction-surface

Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation has its own kind-labeled card. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.

Example: Document openDocument, applyOperations, and checkDocument with their parameters and results.

Details: [interaction-surface](components/interaction-surface.md). Canonical document: `10-system-design/40-block-vocabulary/60-interaction-surface`.

### state-shape

Block types: state-shape

Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it.

Example: Define an edit task with its project, revision, and status, then show one valid task instance.

Details: [state-shape](components/state-shape.md). Canonical document: `10-system-design/40-block-vocabulary/50-state-shape`.

### canvas

Block types: canvas

Use Canvas for system connections, ownership boundaries, and dependencies. Use Sequence for individual calls and waits.

Example: Map the external client, shared docs service, and project corpora, labeling the read and write connections.

Details: [canvas](components/canvas.md). Canonical document: `10-system-design/40-block-vocabulary/80-canvas`.

### sequence

Block types: sequence

Use Sequence for a bounded interaction where participant order, calls, returns, waits, retries, or failures explain the behavior. Verify the sequence against source or trace evidence.

Example: Show a client opening a task, reading a document, applying an operation, and receiving validation findings.

Details: [sequence](components/sequence.md). Canonical document: `10-system-design/40-block-vocabulary/70-sequence`.

### process-outline

Block types: process-outline

Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace.

Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

Details: [process-outline](components/process-outline.md). Canonical document: `10-system-design/40-block-vocabulary/90-process-outline`.
