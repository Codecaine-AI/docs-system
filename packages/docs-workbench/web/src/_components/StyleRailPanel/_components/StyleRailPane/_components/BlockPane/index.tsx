import { isBlockLayoutType } from "../../../../../../shared/style-rail-settings";
import { settingLeaf } from "../../../../overrides";
import type { PaneBodyProps } from "../../types";
import { ControlGroup } from "../ControlGroup";
import { SliderRow } from "../SliderRow";
import { ComponentTokenRows } from "../ComponentTokenRows";
import { BlockLayoutSection } from "./_components/BlockLayoutSection";

export type BlockPaneProps = PaneBodyProps;
export function BlockPane({ selectedId, settings, pane, overrideCount, patchers }: BlockPaneProps) {
  const { patchBlockLayout, patchComponent, patchList, resetComponent } = patchers;
        const file = selectedId.slice("blocks.".length);
        return (
          <ControlGroup>
            {/* Lane controls first: where the block sits on the page frames
                everything the token rows then tune inside it. Only real doc
                block types have a lane — inline-code, linking, shell and
                surfaces are not blocks and get no Layout section. */}
            {isBlockLayoutType(file) && <BlockLayoutSection file={file} settings={settings} patchBlockLayout={patchBlockLayout} />}
            {<ComponentTokenRows file={file} settings={settings} patchComponent={patchComponent} />}
            {file === "list-item" && (
              <>
                <SliderRow
                  label="Disc size"
                  leaf={settingLeaf("list.discSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ discSize: value })}
                  step={0.5}
                  value={settings.list.discSize}
                  valueLabel={`${settings.list.discSize}px`}
                />
                <SliderRow
                  label="Circle size"
                  leaf={settingLeaf("list.circleSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ circleSize: value })}
                  step={0.5}
                  value={settings.list.circleSize}
                  valueLabel={`${settings.list.circleSize}px`}
                />
                <SliderRow
                  label="Circle thickness"
                  leaf={settingLeaf("list.circleThickness")}
                  max={3}
                  min={0.5}
                  onChange={(value) => patchList({ circleThickness: value })}
                  step={0.25}
                  value={settings.list.circleThickness}
                  valueLabel={`${settings.list.circleThickness}px`}
                />
                <SliderRow
                  label="Square size"
                  leaf={settingLeaf("list.squareSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ squareSize: value })}
                  step={0.5}
                  value={settings.list.squareSize}
                  valueLabel={`${settings.list.squareSize}px`}
                />
                <SliderRow
                  label="Indent"
                  leaf={settingLeaf("list.indent")}
                  max={48}
                  min={12}
                  onChange={(value) => patchList({ indent: value })}
                  step={1}
                  value={settings.list.indent}
                  valueLabel={`${settings.list.indent}px`}
                />
              </>
            )}
            {overrideCount > 0 && (
              <button
                className="style-rail-block-reset"
                onClick={() => resetComponent(file)}
                type="button"
              >
                Reset {pane.label} to theme
              </button>
            )}
          </ControlGroup>
        );
}
