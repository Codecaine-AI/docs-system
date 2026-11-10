/**
 * The Docs prompt block. MCP clients get it as the server instructions, the Pi bridge appends it to the system
 * prompt, and agent-config copies it from `cli.ts instructions`. It says when to use the Docs tools and which tool
 * to call first. The rules live in docs_guidance topics. At most 12 lines and 800 bytes (mcp.test.ts).
 * Pi loads this file under Node, so it imports nothing.
 */
export const INSTRUCTIONS = [
  "Use the Docs tools to read and edit a Docs System corpus. Never write doc.json or sidecars directly.",
  "Call docs_capabilities first for the project ids, the guidance topics and the writes each topic unlocks.",
  'To edit, call docs_begin, then read docs_guidance with task_id and topic "style". Writes are refused until then.',
  'Topic "workflow" holds the edit steps, requests, page moves and deletes, and html blocks.',
  "Show a shape in its typed block (state-shape, file-tree, process-outline, canvas, sequence and the rest).",
  "Edit through typed tools with task_id and the docs_read hash. Fix style_findings as you go.",
  "Run docs_check with task_id on each changed page before you report.",
  "After context compaction, call docs_capabilities again and re-read the topics your next writes need.",
].join("\n");
