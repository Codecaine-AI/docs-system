import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { SelectRow } from "../../../../_components/SelectRow";
import { ColorRow } from "../../../../_components/ColorRow";
import { SliderRow } from "../../../../_components/SliderRow";
import { Subgroup } from "../../../../_components/Subgroup";
import { REFERENCE_ICON_POSITION_OPTIONS } from "../../../../constants";
import { settingLeaf } from "../../../../../../overrides";
import { styleRailColorControls } from "../../../../../../../../shared/style-rail-settings/color-controls";

export type ReferencesPaneProps = PaneBodyProps;

export function ReferencesPane(props: ReferencesPaneProps) {
  const { settings } = props;
  const { patchReference } = props.patchers;

  return (
    <>
      {/* Only color pickers: the whole group hides with them. */}
      {styleRailColorControls() && (
        <ControlGroup>
          <ColorRow
            defaultExpr="var(--docs-ref-color)"
            label="Text color"
            leaf={settingLeaf("reference.color")}
            onChange={(value) => patchReference({ color: value })}
            value={settings.reference.color}
          />
          <ColorRow
            defaultExpr="var(--docs-ref-underline-color)"
            label="Hover underline"
            leaf={settingLeaf("reference.underlineColor")}
            onChange={(value) => patchReference({ underlineColor: value })}
            value={settings.reference.underlineColor}
          />
        </ControlGroup>
      )}
      <Subgroup label="Icon">
        <ColorRow
          defaultExpr="var(--docs-ref-color)"
          label="Color"
          leaf={settingLeaf("reference.iconColor")}
          onChange={(value) => patchReference({ iconColor: value })}
          value={settings.reference.iconColor}
        />
        <SliderRow
          label="Size"
          leaf={settingLeaf("reference.iconSize")}
          max={28}
          min={8}
          onChange={(value) => patchReference({ iconSize: value })}
          step={1}
          value={settings.reference.iconSize}
          valueLabel={`${settings.reference.iconSize}px`}
        />
        <SliderRow
          label="Spacing"
          leaf={settingLeaf("reference.iconGap")}
          max={16}
          min={0}
          onChange={(value) => patchReference({ iconGap: value })}
          step={1}
          value={settings.reference.iconGap}
          valueLabel={`${settings.reference.iconGap}px`}
        />
        <SelectRow
          label="Position"
          leaf={settingLeaf("reference.iconPosition")}
          onChange={(value) => patchReference({ iconPosition: value })}
          options={REFERENCE_ICON_POSITION_OPTIONS}
          value={settings.reference.iconPosition}
        />
      </Subgroup>
    </>
  );
}
