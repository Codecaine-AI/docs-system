/**
 * The naming canon: one name for each concept (Vocabulary page, "Naming Canon"). The one-name rule
 * flags a page that uses two names from one group.
 *
 * Precision matters more than recall here. `avoid` holds only lowercase variants that a regex can
 * match without hitting another meaning in our pages. Each note names the variants left out and
 * the cases where a word is legitimate. Forms are singular, and a rule matches plurals itself.
 *
 * The page's "Code and folders" row is two groups here, "A code repository" and "A folder on
 * disk". As one group, "repo" and "directory" would read as two names for one thing.
 *
 * Every group is scoped to docs-system (see ProfileScope): the canon is the docs-system naming
 * decision, and other corpora use these names in their own senses, such as Discord threads. The
 * house spellings, such as "subagent" to "sub-agent", stay in every corpus through the habit rows
 * of the deny list.
 */
import type { NamingGroup } from "./types";

export const namingCanon: readonly NamingGroup[] = [
  {
    concept: "The unit a reader opens",
    use: "page",
    avoid: ["doc", "article"],
    note: "Keep \"doc\" in doc.json, docs system, doc renderer, \"doc render\", \"doc surface\", \"doc edit mode\", and code. The folder is the bundle, and \"document\" names only the data-model object.",
    scope: "docs-system",
  },
  {
    concept: "A unit of content in a page",
    use: "block",
    avoid: [],
    note: "A block is one instance, a block type is its kind, and a component is the code only. Widget, element, and node are left out: here they name the search widget, HTML elements, tree nodes, and Node.js.",
    scope: "docs-system",
  },
  {
    concept: "A page heading",
    use: "heading",
    avoid: ["subheader"],
    note: "Also \"subheading\". \"Header\" is left out: here it names the UI region, a table header row, and a code header.",
    scope: "docs-system",
  },
  {
    concept: "A stored agent conversation",
    use: "session",
    avoid: ["thread", "chat", "conversation"],
    note: "\"New thread\" stays as the name of the UI action, and an annotation thread keeps its name.",
    scope: "docs-system",
  },
  {
    concept: "A spawned helper agent",
    use: "sub-agent",
    avoid: ["subagent", "sub agent", "child agent"],
    note: "\"Worker\" names only the harness worker role.",
    scope: "docs-system",
  },
  {
    concept: "Something wrong",
    use: "problem",
    avoid: [],
    note: "A bug is a code defect, and an error is a message. \"Issue\" is left out: it also names a tracked item and a validation issue.",
    scope: "docs-system",
  },
  {
    concept: "Lint results",
    use: "finding",
    avoid: ["violation"],
    note: "A rule is the definition, and a check is one run, such as docs_check. \"Diagnostic\" and \"warning\" are left out: here they name an adjective and a severity.",
    scope: "docs-system",
  },
  {
    concept: "Pending changes",
    use: "op",
    avoid: ["mutation"],
    note: "A patch is an applied batch, a proposal is staged, and a change set groups proposals. A mutation authority is the write authority. Diff, edit, and operation are left out: here they name a diff algorithm, the verb, and an interaction-surface item.",
    scope: "docs-system",
  },
  {
    concept: "A code repository",
    use: "repo",
    avoid: ["repository", "codebase", "code base"],
    note: "The workspace is the multi-repo root. \"Project\" names only a docs or prompt project ID.",
    scope: "docs-system",
  },
  {
    concept: "A folder on disk",
    use: "folder",
    avoid: ["directory", "dir"],
    note: "Code spans and CLI flags keep \"dir\".",
    scope: "docs-system",
  },
  {
    concept: "The product",
    use: "docs system",
    avoid: ["doc system", "documentation system", "docs framework"],
    note: "Matches the repo name docs-system. \"Docs framework\" is also the name of an older skill.",
    scope: "docs-system",
  },
  {
    concept: "Files beside doc.json",
    use: "sidecar",
    avoid: [],
    note: "A sidecar holds JSON state, and an asset is a file under assets/. Payload and attachment are left out: here they name a request payload and an asset kind.",
    scope: "docs-system",
  },
  {
    concept: "An AI actor",
    use: "agent",
    avoid: ["ai", "llm"],
    note: "An agent is a model with tools and a loop. Avoid \"AI\" and \"LLM\" alone, but names such as Lascari-AI keep them. \"Model\" is not in the group, because it also names the data model.",
    scope: "docs-system",
  },
  {
    concept: "Tests of model output",
    use: "eval",
    avoid: ["evaluation"],
    note: "An eval scores model output, a test checks code, and a judge is the model that grades.",
    scope: "docs-system",
  },
  {
    concept: "A visual draft",
    use: "mockup",
    avoid: ["mock-up", "mock up"],
    note: "One word with no hyphen.",
    scope: "docs-system",
  },
  {
    concept: "A code review request",
    use: "PR",
    avoid: ["pull request"],
    note: "PR is the short form in every transcript.",
    scope: "docs-system",
  },
  {
    concept: "Reviewer input on a page",
    use: "annotation",
    avoid: [],
    note: "\"Note\" is an annotation intent. Comment and feedback are left out: here they name code comments and lint feedback.",
    scope: "docs-system",
  },
];
