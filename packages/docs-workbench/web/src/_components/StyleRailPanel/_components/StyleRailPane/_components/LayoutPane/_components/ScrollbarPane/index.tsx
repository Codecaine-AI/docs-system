import type { PaneBodyProps } from "../../../../types";
import { settingLeaf } from "../../../../../../overrides";
import { ControlGroup } from "../../../ControlGroup";
import { SliderRow } from "../../../SliderRow";
import { ColorRow } from "../../../ColorRow";

export type ScrollbarPaneProps = PaneBodyProps;

export function ScrollbarPane(props: ScrollbarPaneProps) {
  const { settings } = props;
  const { patchScrollbar } = props.patchers;
  return (
    <ControlGroup>
      <SliderRow
        label="Width"
        leaf={settingLeaf("scrollbar.width")}
        max={20}
        min={4}
        onChange={(value) => patchScrollbar({ width: value })}
        step={1}
        value={settings.scrollbar.width}
        valueLabel={`${settings.scrollbar.width}px`}
      />
      <ColorRow
        defaultExpr="var(--docs-icon-muted)"
        label="Color"
        leaf={settingLeaf("scrollbar.color")}
        onChange={(value) => patchScrollbar({ color: value })}
        value={settings.scrollbar.color}
      />
      <SliderRow
        label="Opacity"
        leaf={settingLeaf("scrollbar.opacity")}
        max={1}
        min={0.1}
        onChange={(value) => patchScrollbar({ opacity: value })}
        step={0.05}
        value={settings.scrollbar.opacity}
        valueLabel={`${Math.round(settings.scrollbar.opacity * 100)}%`}
      />
      <SliderRow
        label="Padding"
        leaf={settingLeaf("scrollbar.padding")}
        max={12}
        min={0}
        onChange={(value) => patchScrollbar({ padding: value })}
        step={1}
        value={settings.scrollbar.padding}
        valueLabel={`${settings.scrollbar.padding}px`}
      />
    </ControlGroup>
  );
}
