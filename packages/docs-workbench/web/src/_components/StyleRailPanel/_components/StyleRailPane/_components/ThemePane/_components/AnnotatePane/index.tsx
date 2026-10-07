import type { PaneBodyProps } from "../../../../types";
import { ColorRow } from "../../../../_components/ColorRow";
import { SliderRow } from "../../../../_components/SliderRow";
import { Subgroup } from "../../../../_components/Subgroup";
import { settingLeaf } from "../../../../../../overrides";
import { styleRailColorControls } from "../../../../../../../../shared/style-rail-settings/color-controls";

export type AnnotatePaneProps = PaneBodyProps;

export function AnnotatePane(props: AnnotatePaneProps) {
  const { settings } = props;
  const { patchAnnotate } = props.patchers;

  return (
    <>
      {/* Only color pickers: the whole group hides with them. */}
      {styleRailColorControls() && (
        <Subgroup label="Colors">
          <ColorRow
            defaultExpr="var(--annotation-accent)"
            label="Accent"
            leaf={settingLeaf("annotate.accent")}
            onChange={(value) => patchAnnotate({ accent: value })}
            value={settings.annotate.accent}
          />
          <ColorRow
            defaultExpr="var(--docs-annotation-add)"
            label="Add"
            leaf={settingLeaf("annotate.add")}
            onChange={(value) => patchAnnotate({ add: value })}
            value={settings.annotate.add}
          />
          <ColorRow
            defaultExpr="var(--docs-annotation-del)"
            label="Delete"
            leaf={settingLeaf("annotate.del")}
            onChange={(value) => patchAnnotate({ del: value })}
            value={settings.annotate.del}
          />
        </Subgroup>
      )}
      <Subgroup label="Surface">
        <SliderRow
          label="Wash opacity"
          leaf={settingLeaf("annotate.washOpacity")}
          max={0.3}
          min={0}
          onChange={(value) => patchAnnotate({ washOpacity: value })}
          step={0.01}
          value={settings.annotate.washOpacity}
          valueLabel={`${Math.round(settings.annotate.washOpacity * 100)}%`}
        />
        <SliderRow
          label="AI panel width"
          leaf={settingLeaf("annotate.actionPaneWidth")}
          max={680}
          min={380}
          onChange={(value) => patchAnnotate({ actionPaneWidth: value })}
          step={1}
          value={settings.annotate.actionPaneWidth}
          valueLabel={`${settings.annotate.actionPaneWidth}px`}
        />
      </Subgroup>
    </>
  );
}
