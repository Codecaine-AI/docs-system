import { loadDocBundle } from "../../bundle";

/** The current content hash of a page, as a reader sends it with its next write. */
export async function pageHash(docsRoot: string, path: string): Promise<string> {
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) throw new Error(loaded.error.detail);
  return loaded.docHash;
}
