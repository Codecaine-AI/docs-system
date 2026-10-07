import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
export type WorkbenchMode = "edit" | "annotate";
export type BundleState = { doc: DocDocument; hash: string };
