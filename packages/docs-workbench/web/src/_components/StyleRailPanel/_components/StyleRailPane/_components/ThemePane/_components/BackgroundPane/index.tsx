import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { ToggleRow } from "../../../../_components/ToggleRow";
import { SelectRow } from "../../../../_components/SelectRow";
import { SliderRow } from "../../../../_components/SliderRow";
import { Subgroup } from "../../../../_components/Subgroup";
import { BLEND_OPTIONS } from "../../../../constants";
import { settingLeaf } from "../../../../../../overrides";

export type BackgroundPaneProps = PaneBodyProps;

export function BackgroundPane(props: BackgroundPaneProps) {
  const { settings } = props;
  const { patchGrain, patchSoftening } = props.patchers;
  const { grain } = settings;

  return (
    <>
      <ControlGroup>
        <ToggleRow
          checked={grain.enabled}
          label="Enable grain"
          leaf={settingLeaf("grain.enabled")}
          onChange={(value) => patchGrain({ enabled: value })}
        />
        <SliderRow
          label="Intensity"
          leaf={settingLeaf("grain.opacity")}
          max={0.5}
          min={0}
          onChange={(value) => patchGrain({ opacity: value })}
          step={0.01}
          value={grain.opacity}
          valueLabel={grain.opacity.toFixed(2)}
        />
        <SliderRow
          label="Density"
          leaf={settingLeaf("grain.frequency")}
          max={1.6}
          min={0.25}
          onChange={(value) => patchGrain({ frequency: value })}
          step={0.05}
          value={grain.frequency}
          valueLabel={grain.frequency.toFixed(2)}
        />
        <SliderRow
          label="Contrast"
          leaf={settingLeaf("grain.contrast")}
          max={3}
          min={0.3}
          onChange={(value) => patchGrain({ contrast: value })}
          step={0.05}
          value={grain.contrast}
          valueLabel={grain.contrast.toFixed(2)}
        />
        <SelectRow
          label="Blend"
          leaf={settingLeaf("grain.blendMode")}
          onChange={(value) => patchGrain({ blendMode: value })}
          options={BLEND_OPTIONS}
          value={grain.blendMode}
        />
      </ControlGroup>
      <Subgroup label="Softening">
        <SliderRow
          label="Background"
          leaf={settingLeaf("grain.softening.background")}
          max={1}
          min={0}
          onChange={(value) => patchSoftening({ background: value })}
          step={0.05}
          value={grain.softening.background}
          valueLabel={`${Math.round(grain.softening.background * 100)}%`}
        />
        <SliderRow
          label="Font"
          leaf={settingLeaf("grain.softening.font")}
          max={1.5}
          min={0}
          onChange={(value) => patchSoftening({ font: value })}
          step={0.05}
          value={grain.softening.font}
          valueLabel={`${Math.round(grain.softening.font * 100)}%`}
        />
        <SliderRow
          label="Icons"
          leaf={settingLeaf("grain.softening.icons")}
          max={1.5}
          min={0}
          onChange={(value) => patchSoftening({ icons: value })}
          step={0.05}
          value={grain.softening.icons}
          valueLabel={`${Math.round(grain.softening.icons * 100)}%`}
        />
      </Subgroup>
    </>
  );
}
