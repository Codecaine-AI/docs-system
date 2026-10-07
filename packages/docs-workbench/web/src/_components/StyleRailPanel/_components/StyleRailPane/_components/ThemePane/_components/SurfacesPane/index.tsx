import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { SliderRow } from "../../../../_components/SliderRow";
import { Subgroup } from "../../../../_components/Subgroup";
import { ComponentTokenRows } from "../../../../_components/ComponentTokenRows";
import { settingLeaf } from "../../../../../../overrides";

export type SurfacesPaneProps = PaneBodyProps;

export function SurfacesPane(props: SurfacesPaneProps) {
  const { settings } = props;
  const { patchLayout, patchComponent, resetComponent, hasComponentOverrides } = props.patchers;
  const { layout } = settings;

  return (
    <>
      <ControlGroup>
        {/* The Radius knob and radius token both write --radius; deduplication comes later. */}
        <SliderRow
          label="Radius"
          leaf={settingLeaf("layout.radius")}
          max={16}
          min={0}
          onChange={(value) => patchLayout({ radius: value })}
          step={1}
          value={layout.radius}
          valueLabel={`${layout.radius}px`}
        />
        <SliderRow
          label="Border strength"
          leaf={settingLeaf("layout.borderStrength")}
          max={2}
          min={0}
          onChange={(value) => patchLayout({ borderStrength: value })}
          step={0.05}
          value={layout.borderStrength}
          valueLabel={`${Math.round(layout.borderStrength * 100)}%`}
        />
        <SliderRow
          label="Background tint"
          leaf={settingLeaf("layout.backgroundTint")}
          max={12}
          min={0}
          onChange={(value) => patchLayout({ backgroundTint: value })}
          step={0.5}
          value={layout.backgroundTint}
          valueLabel={`${layout.backgroundTint}%`}
        />
        <SliderRow
          label="Sidebar tint"
          leaf={settingLeaf("layout.sidebarTint")}
          max={60}
          min={0}
          onChange={(value) => patchLayout({ sidebarTint: value })}
          step={2}
          value={layout.sidebarTint}
          valueLabel={`${layout.sidebarTint}%`}
        />
      </ControlGroup>
      <Subgroup label="Tokens">
        <ComponentTokenRows file="surfaces" settings={settings} patchComponent={patchComponent} />
        {hasComponentOverrides("surfaces") && (
          <button
            className="style-rail-block-reset"
            onClick={() => resetComponent("surfaces")}
            type="button"
          >
            Reset Surfaces tokens to theme
          </button>
        )}
      </Subgroup>
    </>
  );
}
