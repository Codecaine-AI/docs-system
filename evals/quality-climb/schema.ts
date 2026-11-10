// The brief vocabulary of the docs-system writer. The UI Hill Climb tool owns the judges, the reply schemas and the gate.

export const BLOCK_GROUPS = [
  "rich-text", "callout", "code", "structured-table", "file-tree",
  "interaction-surface", "state-shape", "process-outline", "stack", "call-stack", "component-tree", "pseudocode", "file-explorer",
] as const;
export type BlockGroup = (typeof BLOCK_GROUPS)[number];

export const SETS = ["climb", "held-out"] as const;
export type BriefSet = (typeof SETS)[number];

export interface Brief {
  id: number;
  set: BriefSet;
  slug: string;
  title: string;
  reader: string;
  prompt: string;
  sources: string[];
  blockTypes: BlockGroup[];
  /** The existing page this brief rewrites, for the people who read results. Never given to the writer or a judge. */
  rewrites: string;
}
