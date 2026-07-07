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
  MAX_ASSET_BYTES,
  MAX_CANVAS_FILE_BYTES,
  MAX_DOC_FILE_BYTES,
  inferAssetContentType,
  inferDocsFormat,
  isAllowedAssetRelativePath,
  isAllowedCanvasSidecarPath,
  isAllowedDocsFilePath,
  isSafeCanvasMdxId,
  resolveAssetRootRelativePath,
  resolveCanvasSidecarRelativePath,
  resolveCanvasSidecarRootRelativePath,
  resolveStaticFilePath,
  type DocsFormat,
} from "./confine";
export { collectBundlePaths, walkDocsDir, type DocsTreeNode } from "./docs-tree";

// Bundle + comments primitives
export {
  EMPTY_COMMENTS_DOCUMENT,
  bundleResponse,
  isValidCommentTarget,
  loadDocBundle,
  loadDocProjection,
  normalizeBundlePath,
  readCommentsSidecar,
  writeCommentsSidecar,
  type DocBundleLoadError,
  type DocBundleLoadResult,
  type DocProjectionResult,
} from "./bundle";

// Doc ops + comments mutations
export {
  addBundleComment,
  applyDocOpsToBundle,
  attachAgentRunToComment,
  getBundleComments,
  resolveBundleComment,
  type AddBundleCommentInput,
  type AddBundleCommentResult,
  type ApplyDocOpsResult,
  type AttachAgentRunInput,
  type AttachAgentRunResult,
  type BundleCommentsReadResult,
  type ResolveBundleCommentResult,
} from "./doc-ops";

// Assets
export {
  readDocAsset,
  sanitizeAssetFilename,
  uniquifyAssetFilename,
  uploadDocAsset,
  type ReadDocAssetResult,
  type UploadDocAssetInput,
  type UploadDocAssetResult,
} from "./assets";

// Canvas sidecars (doc-relative) + MDX reference helpers
export {
  appendCanvasReferenceToContent,
  canvasMdxReference,
  canvasSidecarResponse,
  createCanvasSidecar,
  deleteCanvasSidecar,
  insertCanvasReferenceIntoContent,
  loadCanvasSidecarByDocPath,
  loadDocsSourceFile,
  removeCanvasReferenceFromContent,
  saveCanvasSidecar,
  validateCanvasPayload,
  type CanvasReferenceInsertPosition,
  type CanvasSidecarByDocPathError,
  type CanvasSidecarByDocPathLoadResult,
  type CanvasSidecarWireResponse,
  type CreateCanvasSidecarInput,
  type CreateCanvasSidecarResult,
  type DeleteCanvasSidecarInput,
  type DeleteCanvasSidecarResult,
  type DocsSourceFileLoadError,
  type DocsSourceFileLoadResult,
  type SaveCanvasSidecarInput,
  type SaveCanvasSidecarResult,
} from "./canvas-sidecar";

// Typed agent tools + undo ledger
export {
  canvas_apply_patch,
  canvas_get,
  comment_list,
  comment_resolve,
  deleteStoredPatch,
  doc_get,
  doc_update_blocks,
  getStoredPatch,
  recordCanvasPatch,
  recordDocPatch,
  undo_patch,
  type CanvasAgentPatchOperation,
  type CanvasApplyPatchResult,
  type CanvasGetResult,
  type CommentListResult,
  type CommentResolveResult,
  type DocGetResult,
  type DocUpdateBlocksResult,
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
