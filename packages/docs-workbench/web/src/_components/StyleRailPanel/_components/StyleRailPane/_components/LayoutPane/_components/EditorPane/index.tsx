import type { PaneBodyProps } from "../../../../types";
import { settingLeaf } from "../../../../../../overrides";
import { Subgroup } from "../../../Subgroup";
import { SliderRow } from "../../../SliderRow";
import { ColorRow } from "../../../ColorRow";

export type EditorPaneProps = PaneBodyProps;

export function EditorPane(props: EditorPaneProps) {
  const { settings } = props;
  const { layout } = settings;
  const { patchLayout, patchHighlight, patchDragSelect, patchGrip } = props.patchers;
  return (
    <>
      <Subgroup label="Column">
        <SliderRow
          label="Max width"
          leaf={settingLeaf("layout.contentWidth")}
          max={140}
          min={40}
          onChange={(value) => patchLayout({ contentWidth: value })}
          step={2}
          value={layout.contentWidth}
          valueLabel={`${layout.contentWidth}ch`}
        />
        {/*
          Code lane: the max-width mono blocks (code, pseudocode, file
          tree, file explorer) cap at. In ch like the text measure.
        */}
        <SliderRow
          label="Code lane"
          leaf={settingLeaf("layout.codeWidth")}
          max={160}
          min={60}
          onChange={(value) => patchLayout({ codeWidth: value })}
          step={2}
          value={layout.codeWidth}
          valueLabel={`${layout.codeWidth}ch`}
        />
        {/*
          Wide lane: the max-width data-heavy blocks (state shape,
          interaction surface, structured table, process outline) break
          out to. Sized in px because those blocks are grids, not prose.
        */}
        <SliderRow
          label="Wide lane"
          leaf={settingLeaf("layout.wideWidth")}
          max={2400}
          min={900}
          onChange={(value) => patchLayout({ wideWidth: value })}
          step={20}
          value={layout.wideWidth}
          valueLabel={`${layout.wideWidth}px`}
        />
        {/*
          Left margin: the page is left-anchored and full-width now, so
          this is THE global knob that sets where every block's left rail
          sits — it is no longer symmetric gutter around a centered
          column. Named accordingly, and given plenty of range because
          the whole page hangs off it.
        */}
        <SliderRow
          label="Left margin"
          leaf={settingLeaf("layout.contentMargin")}
          max={240}
          min={0}
          onChange={(value) => patchLayout({ contentMargin: value })}
          step={4}
          value={layout.contentMargin}
          valueLabel={`${layout.contentMargin}px`}
        />
        <SliderRow
          label="Top padding"
          leaf={settingLeaf("layout.topPadding")}
          max={240}
          min={0}
          onChange={(value) => patchLayout({ topPadding: value })}
          step={4}
          value={layout.topPadding}
          valueLabel={`${layout.topPadding}px`}
        />
        <SliderRow
          label="Title padding"
          leaf={settingLeaf("layout.titlePadding")}
          max={240}
          min={0}
          onChange={(value) => patchLayout({ titlePadding: value })}
          step={2}
          value={layout.titlePadding}
          valueLabel={`${layout.titlePadding}px`}
        />
        <SliderRow
          label="Bottom padding"
          leaf={settingLeaf("layout.bottomPadding")}
          max={600}
          min={0}
          onChange={(value) => patchLayout({ bottomPadding: value })}
          step={4}
          value={layout.bottomPadding}
          valueLabel={`${layout.bottomPadding}px`}
        />
      </Subgroup>
      <Subgroup label="Highlight">
        <ColorRow
          defaultExpr="var(--color-bg-blue)"
          label="Color"
          leaf={settingLeaf("highlight.color")}
          onChange={(value) => patchHighlight({ color: value })}
          value={settings.highlight.color}
        />
        <SliderRow
          label="Rounding"
          leaf={settingLeaf("highlight.radius")}
          max={24}
          min={0}
          onChange={(value) => patchHighlight({ radius: value })}
          step={1}
          value={settings.highlight.radius}
          valueLabel={`${settings.highlight.radius}px`}
        />
        <SliderRow
          label="Padding"
          leaf={settingLeaf("highlight.padding")}
          max={12}
          min={0}
          onChange={(value) => patchHighlight({ padding: value })}
          step={1}
          value={settings.highlight.padding}
          valueLabel={`${settings.highlight.padding}px`}
        />
        <SliderRow
          label="Drag opacity"
          leaf={settingLeaf("highlight.dragOpacity")}
          max={1}
          min={0.05}
          onChange={(value) => patchHighlight({ dragOpacity: value })}
          step={0.05}
          value={settings.highlight.dragOpacity}
          valueLabel={`${Math.round(settings.highlight.dragOpacity * 100)}%`}
        />
      </Subgroup>
      <Subgroup label="Drop line">
        <ColorRow
          defaultExpr="var(--color-text-blue)"
          label="Color"
          leaf={settingLeaf("highlight.dropColor")}
          onChange={(value) => patchHighlight({ dropColor: value })}
          value={settings.highlight.dropColor}
        />
        <SliderRow
          label="Thickness"
          leaf={settingLeaf("highlight.dropWidth")}
          max={8}
          min={1}
          onChange={(value) => patchHighlight({ dropWidth: value })}
          step={1}
          value={settings.highlight.dropWidth}
          valueLabel={`${settings.highlight.dropWidth}px`}
        />
        <SliderRow
          label="Opacity"
          leaf={settingLeaf("highlight.dropOpacity")}
          max={1}
          min={0.1}
          onChange={(value) => patchHighlight({ dropOpacity: value })}
          step={0.05}
          value={settings.highlight.dropOpacity}
          valueLabel={`${Math.round(settings.highlight.dropOpacity * 100)}%`}
        />
        <SliderRow
          label="Rounding"
          leaf={settingLeaf("highlight.dropRadius")}
          max={6}
          min={0}
          onChange={(value) => patchHighlight({ dropRadius: value })}
          step={1}
          value={settings.highlight.dropRadius}
          valueLabel={`${settings.highlight.dropRadius}px`}
        />
      </Subgroup>
      <Subgroup label="Drag select">
        <ColorRow
          defaultExpr="var(--color-text-blue)"
          label="Color"
          leaf={settingLeaf("dragSelect.color")}
          onChange={(value) => patchDragSelect({ color: value })}
          value={settings.dragSelect.color}
        />
        <SliderRow
          label="Fill opacity"
          leaf={settingLeaf("dragSelect.opacity")}
          max={0.6}
          min={0.02}
          onChange={(value) => patchDragSelect({ opacity: value })}
          step={0.02}
          value={settings.dragSelect.opacity}
          valueLabel={`${Math.round(settings.dragSelect.opacity * 100)}%`}
        />
      </Subgroup>
      <Subgroup label="Drag grip">
        <SliderRow
          label="Gap"
          leaf={settingLeaf("grip.gap")}
          max={32}
          min={0}
          onChange={(value) => patchGrip({ gap: value })}
          step={1}
          value={settings.grip.gap}
          valueLabel={`${settings.grip.gap}px`}
        />
        <SliderRow
          label="Vertical offset"
          leaf={settingLeaf("grip.offsetY")}
          max={20}
          min={-12}
          onChange={(value) => patchGrip({ offsetY: value })}
          step={1}
          value={settings.grip.offsetY}
          valueLabel={`${settings.grip.offsetY}px`}
        />
        <SliderRow
          label="Size"
          leaf={settingLeaf("grip.size")}
          max={28}
          min={14}
          onChange={(value) => patchGrip({ size: value })}
          step={1}
          value={settings.grip.size}
          valueLabel={`${settings.grip.size}px`}
        />
        <SliderRow
          label="Fade"
          leaf={settingLeaf("grip.fadeMs")}
          max={400}
          min={0}
          onChange={(value) => patchGrip({ fadeMs: value })}
          step={10}
          value={settings.grip.fadeMs}
          valueLabel={`${settings.grip.fadeMs}ms`}
        />
        <ColorRow
          defaultExpr="var(--docs-icon-muted)"
          label="Color"
          leaf={settingLeaf("grip.color")}
          onChange={(value) => patchGrip({ color: value })}
          value={settings.grip.color}
        />
      </Subgroup>
    </>
  );
}
