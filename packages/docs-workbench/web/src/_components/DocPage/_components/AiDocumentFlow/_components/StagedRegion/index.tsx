import { ProposalActionBar, acceptDisabledReason, rejectDisabledReason } from "@codecaine-ai/docs-viewer/lab";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { FlowRendererProps, DocLabSessionResult, DocLabStagedRegion } from "../../types";
import { DocRun } from "../DocRun";

export type StagedRegionProps = FlowRendererProps & { region: DocLabStagedRegion; doc: DocDocument; lab: DocLabSessionResult };

export function StagedRegion({ region, doc, lab, path, resolveAssetSrc, handleCanvasObjectSelect }: StagedRegionProps) {
    const { proposal } = region;
    return (
      <section
        data-docs-staged-region={proposal.alias}
        className="my-3 space-y-2"
      >
        <ProposalActionBar
          alias={proposal.alias}
          summary={proposal.summary}
          acceptDisabledReason={acceptDisabledReason(
            lab.session.proposals,
            proposal.alias,
            proposal.transactionId,
          )}
          rejectDisabledReason={rejectDisabledReason(
            lab.session.proposals,
            proposal.alias,
            proposal.transactionId,
          )}
          onAccept={() => void lab.session.onAccept?.(proposal.alias, proposal.transactionId)}
          onReject={() => void lab.session.onReject?.(proposal.alias, undefined, proposal.transactionId)}
          onRejectWithFeedback={lab.session.onRejectWithFeedback
            ? (note) => void lab.session.onRejectWithFeedback?.(proposal.alias, note)
            : undefined}
        />
        {lab.requestErrors[proposal.alias] ? (
          <p
            data-docs-staged-error={proposal.alias}
            className="text-ui-xs text-destructive"
          >
            {lab.requestErrors[proposal.alias]}
          </p>
        ) : null}
        <div
          data-docs-staged-before={proposal.alias}
          className="rounded border-l-2 px-3 py-1"
          style={{
            color: "var(--docs-annotation-del)",
            background: "var(--docs-annotation-del-bg)",
            borderColor: "var(--docs-annotation-del)",
          }}
        >
          <DocRun key={`${region.key}:before`} sourceDoc={doc!} ids={region.beforeIds} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />
        </div>
        <div
          data-docs-staged-after={proposal.alias}
          className="rounded border-l-2 px-3 py-1"
          style={{
            color: "var(--docs-annotation-add)",
            background: "var(--docs-annotation-add-bg)",
            borderColor: "var(--docs-annotation-add)",
          }}
        >
          <DocRun key={`${region.key}:after`} sourceDoc={region.afterDoc} ids={region.afterIds} path={path} resolveAssetSrc={resolveAssetSrc} handleCanvasObjectSelect={handleCanvasObjectSelect} />
        </div>
      </section>
    );
}