import type { ReactNode } from "react";
import type { FlowProps, DocLabStagedRegion } from "./types";
import { DocRun } from "./_components/DocRun";
import { ThreadBars } from "./_components/ThreadBars";
import { StagedRegion } from "./_components/StagedRegion";
import { InlineComposerSlot } from "./_components/InlineComposerSlot";

export type AiDocumentFlowProps = FlowProps;

export function AiDocumentFlow({ doc, path, stagedRegions, composerTopLevelId, selection, waitingRequests, lab, resolveAssetSrc, handleCanvasObjectSelect, handleComposerSubmit, setPaneError, setSelection }: AiDocumentFlowProps) {
    if (!doc) return null;
    const rootIds = doc.blocks[doc.root]?.children ?? [];
    const regionsAt = new Map<number, DocLabStagedRegion[]>();
    for (const region of stagedRegions) {
      const rows = regionsAt.get(region.startIndex) ?? [];
      rows.push(region);
      regionsAt.set(region.startIndex, rows);
    }
    // Composer anchor: the root child whose group the composer follows. A
    // target that doesn't resolve to a root child (doc-level, or a stale id)
    // renders the composer at the top of the flow instead.
    const composerAnchorId =
      composerTopLevelId && rootIds.includes(composerTopLevelId)
        ? composerTopLevelId
        : null;
    let composerPending = selection !== null;
    const nodes: ReactNode[] = [];
    if (composerPending && !composerAnchorId) {
      nodes.push(<InlineComposerSlot key="inline-composer" selection={selection} handleComposerSubmit={handleComposerSubmit} setPaneError={setPaneError} setSelection={setSelection} />);
      composerPending = false;
    }
    let cursor = 0;
    while (cursor < rootIds.length) {
      const starting = regionsAt.get(cursor) ?? [];
      const consuming = starting.filter((region) => region.endIndex >= cursor);
      const insertions = starting.filter((region) => region.endIndex < cursor);
      for (const region of insertions) nodes.push(<StagedRegion key={region.key} region={region} doc={doc} lab={lab} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />);
      if (consuming.length > 0) {
        const targetIds = new Set(consuming.flatMap((region) => region.beforeIds));
        for (const id of targetIds) {
          nodes.push((waitingRequests.byTopLevel.get(id) ?? []).map((request) => <ThreadBars key={`thread:${request.alias}`} request={request} lab={lab} />));
        }
        if (composerPending && composerAnchorId && targetIds.has(composerAnchorId)) {
          nodes.push(<InlineComposerSlot key="inline-composer" selection={selection} handleComposerSubmit={handleComposerSubmit} setPaneError={setPaneError} setSelection={setSelection} />);
          composerPending = false;
        }
        for (const region of consuming) nodes.push(<StagedRegion key={region.key} region={region} doc={doc} lab={lab} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />);
        cursor = Math.max(...consuming.map((region) => region.endIndex)) + 1;
        continue;
      }

      const id = rootIds[cursor]!;
      nodes.push((waitingRequests.byTopLevel.get(id) ?? []).map((request) => <ThreadBars key={`thread:${request.alias}`} request={request} lab={lab} />));
      if (composerPending && id === composerAnchorId) {
        nodes.push(<InlineComposerSlot key="inline-composer" selection={selection} handleComposerSubmit={handleComposerSubmit} setPaneError={setPaneError} setSelection={setSelection} />);
        composerPending = false;
      }
      let runEnd = cursor + 1;
      while (
        runEnd < rootIds.length &&
        !regionsAt.has(runEnd) &&
        !waitingRequests.byTopLevel.has(rootIds[runEnd]!) &&
        // Break the run just before the composer's anchor so the composer
        // lands directly ABOVE its target block (the anchor then starts the
        // next run with the composer rendered ahead of it).
        !(composerPending && rootIds[runEnd] === composerAnchorId)
      ) {
        runEnd += 1;
      }
      const run = rootIds.slice(cursor, runEnd);
      nodes.push(<DocRun key={`untouched:${run.join(":")}`} sourceDoc={doc} ids={run} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />);
      cursor = runEnd;
    }
    for (const region of regionsAt.get(rootIds.length) ?? []) {
      nodes.push(<StagedRegion key={region.key} region={region} doc={doc} lab={lab} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />);
    }
    return nodes;
}
