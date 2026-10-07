import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { ToggleRow } from "../../../../_components/ToggleRow";
import { SelectRow } from "../../../../_components/SelectRow";
import { ColorRow } from "../../../../_components/ColorRow";
import { ACCENT_OPTIONS } from "../../../../constants";
import { settingLeaf } from "../../../../../../overrides";
import { styleRailColorControls } from "../../../../../../../../shared/style-rail-settings/color-controls";

export type ColorsPaneProps = PaneBodyProps;

export function ColorsPane(props: ColorsPaneProps) {
  const { settings, onSettingsChange, dark, onDarkChange } = props;
  const { patchColors } = props.patchers;
  const { accent, colors } = settings;

  return (
    <ControlGroup>
      <ToggleRow checked={dark} label="Dark mode" onChange={onDarkChange} />
      {/* The accent family is a color choice: hidden with the color pickers. */}
      {styleRailColorControls() && (
        <SelectRow
          label="Accent"
          leaf={settingLeaf("accent")}
          onChange={(value) => onSettingsChange({ ...settings, accent: value })}
          options={ACCENT_OPTIONS}
          value={accent}
        />
      )}
      <ColorRow
        defaultExpr="var(--color-bg-default)"
        label="Background"
        leaf={settingLeaf("colors.background")}
        onChange={(value) => patchColors({ background: value })}
        value={colors.background}
      />
      <ColorRow
        defaultExpr="var(--color-bg-sidebar)"
        label="Sidebar"
        leaf={settingLeaf("colors.sidebar")}
        onChange={(value) => patchColors({ sidebar: value })}
        value={colors.sidebar}
      />
      <ColorRow
        defaultExpr="var(--color-text-default)"
        label="Text"
        leaf={settingLeaf("colors.text")}
        onChange={(value) => patchColors({ text: value })}
        value={colors.text}
      />
    </ControlGroup>
  );
}
