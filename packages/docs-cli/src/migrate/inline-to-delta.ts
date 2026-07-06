/**
 * Inline markdown -> delta span tokenizer (M2 migration, TG4.1).
 *
 * The implementation lives in `apps/frontend/src/lib/docs-model/markdown-to-delta.ts`
 * as of Checkpoint 5 (M2 read surface, TG5.2) so the interim block editor can
 * share it without depending on Node's `path` module (that file is browser-safe;
 * this one re-exports it with the exact same public API and behavior so this
 * migration script and its existing test suite keep working unchanged). See
 * that module's header for the full behavior documentation.
 */

export {
  inlineToDelta,
  type InlineToDeltaOptions,
  type InlineToDeltaResult,
} from "@codecaine-ai/docs-model/markdown-to-delta";
