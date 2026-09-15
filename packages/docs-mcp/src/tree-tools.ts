import type { DocsStore } from '@codecaine-ai/docs-server/store';
/** Thin MCP adapter; corpus management and reference rewriting belong to the shared store. */
export async function mutateTree(store: DocsStore, args: Record<string, any>, destination?: string) {
  return store.manageFiles({kind:'page',path:args.path,to:destination,expected_hash:args.expected_hash,
    preview:args.preview,expected_tree_hash:args.expected_tree_hash,recursive:args.recursive});
}
