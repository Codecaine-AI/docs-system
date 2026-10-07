import type { PaneBodyProps } from "../../../../types";
import { settingLeaf } from "../../../../../../overrides";
import { ControlGroup } from "../../../ControlGroup";
import { ColorRow } from "../../../ColorRow";
import { SelectRow } from "../../../SelectRow";
import { SliderRow } from "../../../SliderRow";
import { ToggleRow } from "../../../ToggleRow";
import { FONT_OPTIONS } from "../../../../constants";

export type SidebarPaneProps = PaneBodyProps;

export function SidebarPane(props: SidebarPaneProps) {
  const { settings } = props;
  const { colors } = settings;
  const { patchColors, patchSidebar } = props.patchers;
  return (
    <ControlGroup>
      <ColorRow
        defaultExpr="var(--color-bg-sidebar)"
        label="Background"
        leaf={settingLeaf("colors.sidebar")}
        onChange={(value) => patchColors({ sidebar: value })}
        value={colors.sidebar}
      />
      <ColorRow
        defaultExpr="var(--foreground)"
        label="Text color"
        leaf={settingLeaf("sidebar.textColor")}
        onChange={(value) => patchSidebar({ textColor: value })}
        value={settings.sidebar.textColor}
      />
      <SelectRow
        label="Font"
        leaf={settingLeaf("sidebar.font")}
        onChange={(value) => patchSidebar({ font: value })}
        options={FONT_OPTIONS}
        value={settings.sidebar.font}
      />
      <SliderRow
        label="Text size"
        leaf={settingLeaf("sidebar.fontSize")}
        max={20}
        min={10}
        onChange={(value) => patchSidebar({ fontSize: value })}
        step={1}
        value={settings.sidebar.fontSize}
        valueLabel={`${settings.sidebar.fontSize}px`}
      />
      <SliderRow
        label="Padding"
        leaf={settingLeaf("sidebar.padding")}
        max={16}
        min={0}
        onChange={(value) => patchSidebar({ padding: value })}
        step={1}
        value={settings.sidebar.padding}
        valueLabel={`${settings.sidebar.padding}px`}
      />
      <ToggleRow
        checked={settings.sidebar.guides}
        label="Indent guides"
        leaf={settingLeaf("sidebar.guides")}
        onChange={(value) => patchSidebar({ guides: value })}
      />
      <ColorRow
        defaultExpr="var(--border)"
        label="Guide color"
        leaf={settingLeaf("sidebar.guideColor")}
        onChange={(value) => patchSidebar({ guideColor: value })}
        value={settings.sidebar.guideColor}
      />
      <SliderRow
        label="Guide width"
        leaf={settingLeaf("sidebar.guideWidth")}
        max={4}
        min={1}
        onChange={(value) => patchSidebar({ guideWidth: value })}
        step={0.5}
        value={settings.sidebar.guideWidth}
        valueLabel={`${settings.sidebar.guideWidth}px`}
      />
      <SliderRow
        label="Guide opacity"
        leaf={settingLeaf("sidebar.guideOpacity")}
        max={1}
        min={0.05}
        onChange={(value) => patchSidebar({ guideOpacity: value })}
        step={0.05}
        value={settings.sidebar.guideOpacity}
        valueLabel={`${Math.round(settings.sidebar.guideOpacity * 100)}%`}
      />
    </ControlGroup>
  );
}
