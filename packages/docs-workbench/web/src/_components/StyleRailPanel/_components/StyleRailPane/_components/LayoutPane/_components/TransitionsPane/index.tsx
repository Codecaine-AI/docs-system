import type { PaneBodyProps } from "../../../../types";
import { settingLeaf } from "../../../../../../overrides";
import { ControlGroup } from "../../../ControlGroup";
import { SelectRow } from "../../../SelectRow";
import { SliderRow } from "../../../SliderRow";

export type TransitionsPaneProps = PaneBodyProps;

export function TransitionsPane(props: TransitionsPaneProps) {
  const { settings, onSettingsChange } = props;
  return (
    <ControlGroup>
      <SelectRow
        label="Transition type"
        leaf={settingLeaf("transition.type")}
        value={settings.transition.type}
        options={[{ id: "fade", label: "Fade" }, { id: "none", label: "None" }]}
        onChange={(type) => onSettingsChange({ ...settings, transition: { ...settings.transition, type } })}
      />
      {(["fadeOutMs", "fadeInMs"] as const).map((field) => (
        <SliderRow
          key={field}
          label={field === "fadeOutMs" ? "Fade out" : "Fade in"}
          leaf={settingLeaf(`transition.${field}`)}
          min={0}
          max={800}
          step={10}
          value={settings.transition[field]}
          valueLabel={`${settings.transition[field]}ms`}
          onChange={(value) => onSettingsChange({ ...settings, transition: { ...settings.transition, [field]: value } })}
        />
      ))}
      <p className="text-ui-xs text-muted-foreground">Page changes and linked previews. Reduced motion skips fades.</p>
    </ControlGroup>
  );
}
