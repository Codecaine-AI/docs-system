# Component Selection

Generated from Docs System sources. Snapshot: `sha256:1d5b8e1f9c4d94789c97e57644e063bbf24b467817afee28fe5d7a925906629a`. Refresh the installation to regenerate these files.

### rich-text

Block types: paragraph, heading, list-item, callout, divider, image, image-grid, video, html, app-embed

Use paragraphs for explanation, headings for hierarchy, numbered lists for steps or any order, bullets for parallel facts with a code block or callout nested under the item it belongs to, and a callout for one fact in one or two sentences, titled only when the title adds a fact the body lacks. Use a checklist, list items with checked set, to track open and done work, such as an install checklist or a release checklist. Do not use it for plain facts or for steps nobody ticks off. Tick an item with docs_list_item_set_checked. Use images and video when the visual evidence matters. Use image-grid for ordered image comparisons: images contain src, heading?, alt?, caption?; columns is auto or 1 to 4. Rows grow with the image count. This component accepts images only, not text columns. Use html for a self-contained HTML/CSS diagram or interactive artifact; supply title and html props, inline styles and data assets. Scripts require allowScripts=true and stay in an opaque-origin sandbox with fetch and external subresources blocked. Use app-embed for a live view of an app a codebase declares: supply app, plus view, params, title, height (240 to 2000, default 480) and a poster image as needed. The host resolves the reference to a URL, the reader presses Start, and the app runs in a sandboxed iframe. Hosts without the app show an unavailable note. Use code for examples readers should read instead of execute. Use typed components for state, operations, tables, and diagrams.

Example: Introduce the retry policy in prose, list the recovery steps, and link to the operation definition.

Details: [rich-text](components/rich-text.md). Canonical document: `10-system-design/40-block-vocabulary/10-text-and-media/10-rich-text`.

### code

Block types: code

Use annotated source listings as evidence of the actual implementation. Put a state instance in State Shape alongside its field definition.

Example: Show the real validation function, verbatim, with each cut marked by a comment line, and annotate the branch that rejects an invalid write with why it rejects it and what the caller must do.

Details: [code](components/code.md). Canonical document: `10-system-design/40-block-vocabulary/20-code/10-code-block`.

### file-tree

Block types: file-tree

Use a File Tree to explain where files live and what each directory owns. Add notes or change markers when location or a migration is the subject. Use colors only to set 2 or more groups apart, and say what each color marks.

Example: Show the service entry point, skills directory, and generated references with a note for each.

Details: [file-tree](components/file-tree.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/10-file-tree`.

### structured-table

Block types: structured-table

Use a Structured Table for a comparison, index, or mapping with the same properties across rows. Use State Shape for nested typed fields.

Example: Compare supported clients by installation path and connection method.

Details: [structured-table](components/structured-table.md). Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/30-structured-table`.

### interaction-surface

Block types: interaction-surface

Use Interaction Surface to describe the actions, queries, and events available on a state or system, including parameters and return values. Each operation is one collapsed row that shows its name, return type and kind. Hovering its name shows the purpose, and opening it shows Parameters and Returns cards. Pair it with State Shape. Use Sequence when the question concerns ordering between participants. Write each operation to these rules. (1) Name it by the call a caller writes, receiver.method, such as DraftLockStore.acquire. For one action of a reducer that takes a tagged union, name the operation by its real call with the type literal, such as docPeekReducer(state, { type: "open" }). Its params are state and action, with the action fields nested under action and type typed as its literal. Set returns to the state the reducer returns. (2) Set kind on every operation. Query is only for an operation that changes nothing. An operation that creates, renews, deletes or prunes anything, even expired entries as a side effect, is an action. Event is a notification delivered to a listener: document its callback payload apart from the subscription return value. (3) List every parameter the signature takes in params, with its type, required: false when optional, and nested fields. Describe each parameter whose name and type do not tell a caller what to pass. (4) Give every operation an exampleCall: real code that calls it with literal values and uses no variable it does not set. For a reducer action, call the reducer with a concrete state and action object. Pass every argument that fixes the result, such as a now date. (5) Name each param and returned field by its real key, and nest fields only under an object type. For an object return, use returnShape with recursive fields and an example that is the exact result of that exampleCall. Keep returns for the type name or a primitive type. For a union keyed on one field, set returns to the union, type the key field with its literal values (true | false), and start each branch-only field description with its branch, such as Only when ok is true. (6) When the examples of one surface share state, write them as one scenario in call order, and state the starting state in the prose above the block. (7) In descriptions, state each rule, limit and refusal itself, never only the name of an internal helper that checks it. Give each refusal, including a guard on the mode or environment such as a read-only check, and each side effect in the description of every operation that has it. Omit text that only repeats a name or type.

Example: Document openDocument, applyOperations, and checkDocument with their parameters and results.

Details: [interaction-surface](components/interaction-surface.md). Canonical document: `10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface`.

### state-shape

Block types: state-shape

Use State Shape to define persisted or in-memory state, its nested fields, optionality, and meaning. Include a JSON example instance and a defining source reference. Describe state before the Interaction Surface that changes or queries it. Give every field a description, and make each one add a fact that its name, type and optional marker do not say: a format or unit, a constraint, a default, what an omitted or null value means, or which code sets or reads it. For example, describe retryAfterMs as "Wait before the next try, in milliseconds. 0 retries at once.", not "The retry delay". Start a description with its fact, not with a phrase that only names the field again, such as "Free text for the row." or "Time the service started". When the source gives no such fact, say what the field holds in words that the name does not already use. When a type is a named alias of a few values, such as a color or status type, list the allowed values in the description. Every fact in a description must be one the source states. Put a code name or a literal value in a description in backticks, such as `daemonFetch` or `""`, so it renders as code. Copy each type as the source writes it, with readonly, null and undefined kept. Mark each optional field with required: false. The block prints a legend that says which fields are required, so the prose around it does not repeat that. Keep each made-up example value short enough for one line of the example pane, about 30 characters, such as a 12-character token or a three-part path. Copy a real value from the source as it is. Make the JSON example a real instance: every required field, each nested object and array filled in, and no key the field tree does not list. For a map keyed by ids, such as blocks keyed by block id, list one field named for the key in angle brackets, such as <blockId>, and fill the example with real ids.

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

Use Process Outline for the expected execution path, with nested phases and actor-and-action step names that can be compared with a trace. Phases are short Title Case labels, and so is the root title. Substeps are sentence case actions. A loop or a branch is a parent step that opens with its keyword (For each, While, If, When, On failure) and holds every step it governs. A path that returns early is its own branch step, never the step before the main path. A note gives a reason, a limit or a result, never an action.

Example: Outline discovery, guidance loading, editing, validation, and completion, with failure notes where needed.

Details: [process-outline](components/process-outline.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline`.

### stack

Block types: stack

Use Stack to show layering and the rule enforced at each line: which layer uses which, and what may never cross. Write the layers as a tree of nodes, mark a node `uses` to draw an arrow to its next sibling, and add a boundary after a node to draw the rule beneath it. Draw a uses arrow when a source shows or states that the node imports or calls its next sibling, such as an import line or a call in a function body. A type that a layer only takes as a parameter is not a call. When the sources state a rule but no import or call, such as a path check that a value must pass, draw no arrow and write the rule as a boundary. Give each line between two sibling layers a boundary when the sources hold a rule for it. A boundary states a restriction or a required interface, such as "docs-viewer never imports host-app code" or "data enters only through `DocsClient`". It never describes what a layer outputs. Put each rule beneath the layer whose code enforces it. Name the check, the function that runs it, and what a refused value becomes. Name each exception the source makes, such as the tools that skip the check. A rule never only names a kind of check, such as "Lexical checks". Give each detail a fact that the name, the arrow label and the rule do not state. Write it as segments split by ` · `: the layer's file path first when it has one, then the exports that the layer above calls. A badge is one role word that is not in the name, such as `pure` or `host`. Put a file path in the detail, never in the badge. Wrap each code name in a detail or a rule in backticks, such as `checkDocsPath`, so the stack sets it in the code face. Give a leaf a color only when the page says what the color marks. When a layer also imports or calls a layer further down, say so in its detail and in the prose next to the stack. Keep the layer count in the prose equal to the nodes the stack draws. Use Canvas instead when the picture needs free placement or arbitrary edges.

Example: Show the package layering: host apps above the docs framework, docs-model nested as the pure layer, and the import rule between each layer.

Details: [stack](components/stack.md). Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack`.

### call-stack

Block types: call-stack

Use Call Stack to show which function calls which on one code path, with the file and line where each call is written. Mark a condition with kind "branch" and a changed frame with change. Use Process Outline for prose steps and Component Tree for a render tree.

Example: Trace docs_apply_ops from the tool handler down to the atomic file write, marking the frames this change added.

Details: [call-stack](components/call-stack.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/30-call-stack`.

### component-tree

Block types: component-tree

Use Component Tree to show which component renders which. Write each row as a rendered JSX element or a branch. Add a hook row only when the page is about that hook, and never for useMemo or useCallback. Name other hooks in prose or pseudocode. Use Call Stack for plain function calls.

Example: Show the doc page render tree from DocPage down to the code block, marking the hook this change added.

Details: [component-tree](components/component-tree.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree`.

### pseudocode

Block types: pseudocode

Use Pseudocode to explain an algorithm or a change in logic without the noise of real syntax. Write each step in plain words, such as equals, is empty, and, or, and "add 1 to", never ===, &&, ??, ?., += or an object literal. Start each step with its control word, such as if, skip, return or leave, or with an action verb the viewer colors: set, add, append, insert, remove, delete, replace, move, push, pop, sort, split, join, mark, record, read, write, parse, build, create, update, call, check or make. Keep a line to about 70 characters. Keep the source's function and field names and its order of branches, loops, calls, and returns. Give each trailing // comment a reason in about 40 characters. Set diff to show which lines a change adds or removes. Use Code when the reader needs the actual source.

Example: Sketch how the renderer builds header rows, marking the line this change removes.

Details: [pseudocode](components/pseudocode.md). Canonical document: `10-system-design/40-block-vocabulary/20-code/20-pseudocode`.

### file-explorer

Block types: file-explorer

Use File Explorer to show the files a change touches the way an editor sidebar shows them, with a +, −, ~ or > gutter glyph per changed file. Use File Tree for a plain tree listing of a layout.

Example: Show the files the file-tree refactor added, modified and renamed, with a note on the two that matter.

Details: [file-explorer](components/file-explorer.md). Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/20-file-explorer`.
