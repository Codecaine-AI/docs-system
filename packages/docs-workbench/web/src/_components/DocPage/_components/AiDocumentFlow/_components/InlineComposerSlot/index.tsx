import { InlineComposer } from "@codecaine-ai/docs-viewer/lab";
import type { FlowComposerProps } from "../../types";

export type InlineComposerSlotProps = FlowComposerProps;

  /* The composer as a FLOW INSERTION (prompt-lab style): it sits in the
     annotate document flow directly ABOVE its target group (Cursor Cmd+K
     style — Ford's standing standard) and pushes the target and everything
     after it down — never an overlay. The wrapper is the composer's LANE:
     same `ch`-measured cap as the text lane, and the body font-size
     (`--style-font-size`) so the cap resolves against the same font-size
     (see the title lane). */
export function InlineComposerSlot({ selection, handleComposerSubmit, setPaneError, setSelection }: InlineComposerSlotProps) {
  return     selection ? (
      <div
        data-docs-inline-composer-anchor=""
        className="my-3 w-full max-w-[var(--style-content-width,var(--ds-layout-lane-text))] text-[length:var(--style-font-size,var(--ds-font-size-reading))]"
      >
        <InlineComposer
          onSubmit={(body) => {
            void handleComposerSubmit(body).catch((submitError) => {
              setPaneError(
                submitError instanceof Error
                  ? submitError.message
                  : "Failed to file request.",
              );
            });
          }}
          onCancel={() => setSelection(null)}
          documentTarget={false}
        />
      </div>
    ) : null;
}
