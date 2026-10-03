# Component Selection

Generated from Codecaine Docs sources. Snapshot: `sha256:df3a4be4499081f6aeab443ed890b96811fe78b263b4e16687f66296bf815cbf`. Refresh the installation to regenerate these files.

### rich-text

Block types: paragraph, heading, list-item, callout, divider, image, image-grid, video, html

Use paragraphs for explanation, headings for hierarchy, lists for steps or parallel facts, and callouts for a distinct note. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.

Example: Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.

Details: [rich-text](components/rich-text.md). Canonical document: `10-system-design/40-block-vocabulary/10-text-and-media/10-rich-text`.

### code

Block types: code

Use annotated source listings as evidence of the actual implementation. Put a state instance in State Shape alongside its field definition.

Example: Show the real validation function and annotate the branch that rejects an invalid write.

Details: [code](components/code.md). Canonical document: `10-system-design/40-block-vocabulary/20-code/10-code-block`.

### file-tree

Block types: file-tree

Use a File Tree to explain where files live and what each directory owns. Add notes or change markers when location or a migration is the subject.

Example: Show the service entry point, skills directory, and generated references with a note for each.

Details: [file-tree](components/file-tree.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/10-file-tree`.

### structured-table

Block types: structured-table

Use a Structured Table for a comparison, index, or mapping with the same properties across rows. Use State Shape for nested typed fields.

Example: Compare supported clients by installation path and connection method.

Details: [structured-table](components/structured-table.md). Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/30-structured-table`.

### interaction-surface

Block types: interaction-surface

Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Action changes state, Query reads state, and Event describes observation or notification. Each operation is one collapsed row. Hovering its name shows the kind and purpose, and opening it shows Parameters and Returns cards. Use returnShape with recursive fields and a JSON example for known object returns; keep returns for its name or a primitive type. Add exampleCall with the code text of one real example invocation (authored values, never invented). Document callback payloads separately from subscription return values. Describe only non-obvious constraints or behavior. Pair it with State Shape. Use Sequence when the question concerns ordering between participants.

Example: Document openDocument, applyOperations, and checkDocument with their parameters and results.

Details: [interaction-surface](components/interaction-surface.md). Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface`.

### state-shape

Block types: state-shape

Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it.

Example: Define an edit task with its project, revision, and status, then show one valid task instance.

Details: [state-shape](components/state-shape.md). Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/10-state-shape`.

### canvas

Block types: canvas

Use Canvas for system connections, ownership boundaries, and dependencies. Use Sequence for individual calls and waits.

Example: Map the external client, shared docs service, and project corpora, labeling the read and write connections.

Details: [canvas](components/canvas.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/50-canvas`.

### sequence

Block types: sequence

Use Sequence for a bounded interaction where participant order, calls, returns, waits, retries, or failures explain the behavior. Verify the sequence against source or trace evidence.

Example: Show a client opening a task, reading a document, applying an operation, and receiving validation findings.

Details: [sequence](components/sequence.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/40-sequence`.

### process-outline

Block types: process-outline

Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace. Phases are short Title Case labels, and so is the root title. Substeps are sentence case actions.

Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

Details: [process-outline](components/process-outline.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline`.

### stack

Block types: stack

Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. Use Canvas instead when the picture needs free placement or arbitrary edges.

Example: Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.

Details: [stack](components/stack.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack`.

### call-stack

Block types: call-stack

Use Call Stack to show which function calls which on one code path, with the file and line each frame lives at. Mark a condition with kind "branch" and a changed frame with change. Use Process Outline for prose steps and Component Tree for a render tree.

Example: Trace docs_apply_ops from the tool handler down to the atomic file write, marking the frames this change added.

Details: [call-stack](components/call-stack.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/30-call-stack`.

### component-tree

Block types: component-tree

Use Component Tree to show which component renders which, and the hooks each one calls. Write each node as JSX or a hook call. Use Call Stack for plain function calls.

Example: Show the doc page render tree from DocPage down to the code block, marking the hook this change added.

Details: [component-tree](components/component-tree.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree`.

### pseudocode

Block types: pseudocode

Use Pseudocode to explain an algorithm or a change in logic without the noise of real syntax. Set diff to show which lines a change adds or removes. Use Code when the reader needs the actual source.

Example: Sketch how the renderer builds header rows, marking the line this change removes.

Details: [pseudocode](components/pseudocode.md). Canonical document: `10-system-design/40-block-vocabulary/20-code/20-pseudocode`.

### file-explorer

Block types: file-explorer

Use File Explorer to show the files a change touches the way an editor sidebar shows them, with a badge per changed file. Use File Tree for a plain tree listing of a layout.

Example: Show the files the file-tree refactor added, modified and renamed, with a note on the two that matter.

Details: [file-explorer](components/file-explorer.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/20-file-explorer`.
