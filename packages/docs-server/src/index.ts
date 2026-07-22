// Primitives
export { withPathLock } from "./path-mutex";
export { atomicWriteFile } from "./atomic-write";
export { createContentHash } from "./content-hash";
export {
  DraftLockStore,
  canonicalDraftLockPath,
  draftLockStore,
  type AcquireDraftLockResult,
  type DraftLockInfo,
  type DraftLockKey,
} from "./draft-locks";
export {
  publishDocsChangeEvent,
  subscribeToDocsChangeEvents,
  type DocsChangeEvent,
} from "./docs-events";
export {
  FS_WATCH_ACTOR,
  changeTargetForRelPath,
  watchDocsRoot,
  type DocsFsWatchHandle,
  type WatchDocsRootOptions,
} from "./fs-watch";

// Confinement + tree
export {
  ALLOWED_DOC_EXT,
  ALLOWED_VIDEO_ASSET_EXT,
  MAX_ASSET_BYTES,
  MAX_CANVAS_FILE_BYTES,
  MAX_DOC_FILE_BYTES,
  MAX_VIDEO_ASSET_BYTES,
  inferAssetContentType,
  inferDocsFormat,
  isAllowedAssetRelativePath,
  MAX_SEQUENCE_FILE_BYTES,
  isAllowedCanvasSidecarPath,
  isAllowedDocsFilePath,
  isAllowedSequenceSidecarPath,
  isSafeCanvasMdxId,
  resolveAssetRootRelativePath,
  resolveCanvasSidecarRelativePath,
  resolveCanvasSidecarRootRelativePath,
  resolveSequenceSidecarRelativePath,
  resolveSequenceSidecarRootRelativePath,
  resolveStaticFilePath,
  type DocsFormat,
} from "./confine";
export { collectBundlePaths, walkDocsDir, type DocsTreeNode } from "./docs-tree";

// Theme folders (docs/20-implementation/40-theming)
export {
  isValidThemeId,
  listRepoThemes,
  readRepoTheme,
  themesRootFor,
  writeRepoTheme,
  type ThemeFilePayload,
  type ThemeListEntry,
} from "./themes";

// Bundle + annotations primitives
export {
  ANNOTATIONS_SIDECAR_FILENAME,
  EMPTY_ANNOTATIONS_DOCUMENT,
  bundleResponse,
  isValidAnnotationTarget,
  loadDocBundle,
  loadDocProjection,
  normalizeBundlePath,
  readAnnotationsSidecar,
  writeAnnotationsSidecar,
  type DocBundleLoadError,
  type DocBundleLoadResult,
  type DocProjectionResult,
} from "./bundle";

// Doc ops + annotations mutations
export {
  addBundleAnnotation,
  applyDocOpsToBundle,
  attachAgentRunToAnnotation,
  getBundleAnnotations,
  resolveBundleAnnotation,
  type AddBundleAnnotationInput,
  type AddBundleAnnotationResult,
  type ApplyDocOpsResult,
  type AttachAgentRunInput,
  type AttachAgentRunResult,
  type BundleAnnotationsReadResult,
  type ResolveBundleAnnotationResult,
} from "./doc-ops";

// Assets
export {
  readDocAsset,
  sanitizeAssetFilename,
  uniquifyAssetFilename,
  uploadDocAsset,
  uploadDocVideoAsset,
  type ReadDocAssetResult,
  type UploadDocAssetInput,
  type UploadDocAssetResult,
  type UploadDocVideoAssetResult,
} from "./assets";

// Canvas sidecars (doc-relative + src-rooted) + MDX reference helpers
export {
  appendCanvasReferenceToContent,
  canvasMdxReference,
  canvasSidecarResponse,
  createCanvasSidecar,
  deleteCanvasSidecar,
  insertCanvasReferenceIntoContent,
  listCanvasSidecars,
  loadCanvasSidecarByDocPath,
  loadCanvasSidecarBySrc,
  loadDocsSourceFile,
  removeCanvasReferenceFromContent,
  saveCanvasSidecar,
  saveCanvasSidecarBySrc,
  validateCanvasPayload,
  type CanvasReferenceInsertPosition,
  type CanvasSidecarByDocPathError,
  type CanvasSidecarByDocPathLoadResult,
  type CanvasSidecarBySrcError,
  type CanvasSidecarBySrcLoadResult,
  type CanvasSidecarBySrcWireResponse,
  type CanvasSidecarListEntry,
  type CanvasSidecarWireResponse,
  type CreateCanvasSidecarInput,
  type CreateCanvasSidecarResult,
  type DeleteCanvasSidecarInput,
  type DeleteCanvasSidecarResult,
  type DocsSourceFileLoadError,
  type DocsSourceFileLoadResult,
  type SaveCanvasSidecarBySrcInput,
  type SaveCanvasSidecarBySrcResult,
  type SaveCanvasSidecarInput,
  type SaveCanvasSidecarResult,
} from "./canvas-sidecar";

// Sequence sidecars (doc-relative)
export {
  createSequenceSidecar,
  deleteSequenceSidecar,
  loadSequenceSidecarByDocPath,
  saveSequenceSidecar,
  sequenceSidecarResponse,
  validateSequencePayload,
  type CreateSequenceSidecarInput,
  type CreateSequenceSidecarResult,
  type DeleteSequenceSidecarInput,
  type DeleteSequenceSidecarResult,
  type SaveSequenceSidecarInput,
  type SaveSequenceSidecarResult,
  type SequenceSidecarByDocPathError,
  type SequenceSidecarByDocPathLoadResult,
  type SequenceSidecarWireResponse,
} from "./sequence-sidecar";

// Typed agent tools + undo ledger
export {
  annotation_list,
  annotation_resolve,
  canvas_apply_patch,
  canvas_get,
  deleteStoredPatch,
  doc_get,
  doc_update_blocks,
  getStoredPatch,
  recordCanvasPatch,
  recordDocPatch,
  recordSequencePatch,
  sequence_apply_patch,
  sequence_get,
  undo_patch,
  type AnnotationListResult,
  type AnnotationResolveResult,
  type CanvasAgentPatchOperation,
  type CanvasApplyPatchResult,
  type CanvasGetResult,
  type DocGetResult,
  type DocUpdateBlocksResult,
  type SequenceAgentPatchOperation,
  type SequenceApplyPatchResult,
  type SequenceGetResult,
  type StoredPatch,
  type UndoPatchResult,
} from "./agent-tools";

// Backlinks cache
export {
  getBacklinksDb,
  indexCanvasSourceBestEffort,
  indexDocSourceBestEffort,
  primeBacklinksDb,
} from "./backlinks-cache";

// Store + routes
export { createDocsStore, type DocsStore } from "./store";
export { createDocsRoutes } from "./routes";
