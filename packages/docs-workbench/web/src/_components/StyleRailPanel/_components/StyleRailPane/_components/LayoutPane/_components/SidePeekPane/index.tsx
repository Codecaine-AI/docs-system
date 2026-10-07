import type { PaneBodyProps } from "../../../../types";
import { settingLeaf } from "../../../../../../overrides";
import { ControlGroup } from "../../../ControlGroup";
import { SliderRow } from "../../../SliderRow";
import { Subgroup } from "../../../Subgroup";
import { ColorRow } from "../../../ColorRow";
import { SelectRow } from "../../../SelectRow";
import { PEEK_DIVIDER_STYLE_OPTIONS } from "../../../../constants";

export type SidePeekPaneProps = PaneBodyProps;

export function SidePeekPane(props: SidePeekPaneProps) {
  const { settings } = props;
  const { patchPeek } = props.patchers;
  return (
    <>
      <ControlGroup>
        <SliderRow
          label="Width"
          leaf={settingLeaf("peek.width")}
          max={80}
          min={24}
          onChange={(value) => patchPeek({ width: value })}
          step={1}
          value={settings.peek.width}
          valueLabel={`${settings.peek.width}rem`}
        />
        <SliderRow
          label="Animation"
          leaf={settingLeaf("peek.durationMs")}
          max={800}
          min={0}
          onChange={(value) => patchPeek({ durationMs: value })}
          step={10}
          value={settings.peek.durationMs}
          valueLabel={`${settings.peek.durationMs}ms`}
        />
        <SliderRow
          label="Padding"
          leaf={settingLeaf("peek.padding")}
          max={4}
          min={0}
          onChange={(value) => patchPeek({ padding: value })}
          step={0.25}
          value={settings.peek.padding}
          valueLabel={`${settings.peek.padding}rem`}
        />
      </ControlGroup>
      <Subgroup label="Divider">
        <ColorRow
          defaultExpr="var(--docs-peek-divider-color)"
          label="Color"
          leaf={settingLeaf("peek.dividerColor")}
          onChange={(value) => patchPeek({ dividerColor: value })}
          value={settings.peek.dividerColor}
        />
        <SliderRow
          label="Thickness"
          leaf={settingLeaf("peek.dividerWidth")}
          max={8}
          min={0}
          onChange={(value) => patchPeek({ dividerWidth: value })}
          step={0.5}
          value={settings.peek.dividerWidth}
          valueLabel={`${settings.peek.dividerWidth}px`}
        />
        <SelectRow
          label="Style"
          leaf={settingLeaf("peek.dividerStyle")}
          onChange={(value) => patchPeek({ dividerStyle: value })}
          options={PEEK_DIVIDER_STYLE_OPTIONS}
          value={settings.peek.dividerStyle}
        />
      </Subgroup>
    </>
  );
}
