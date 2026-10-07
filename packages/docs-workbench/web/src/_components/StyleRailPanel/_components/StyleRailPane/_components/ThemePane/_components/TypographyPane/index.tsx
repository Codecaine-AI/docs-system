import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { SelectRow } from "../../../../_components/SelectRow";
import { SliderRow } from "../../../../_components/SliderRow";
import { FONT_OPTIONS, CODE_FONT_OPTIONS, CODE_PANEL_OPTIONS, NUMBER_FONT_OPTIONS } from "../../../../constants";
import { settingLeaf } from "../../../../../../overrides";
import { CodeThemeRows } from "./_components/CodeThemeRows";

export type TypographyPaneProps = PaneBodyProps;

export function TypographyPane(props: TypographyPaneProps) {
  const { settings, codeTheme } = props;
  const { patchTypography } = props.patchers;
  const { typography } = settings;

  return (
    <ControlGroup>
      <SelectRow
        label="Body font"
        leaf={settingLeaf("typography.bodyFont")}
        onChange={(value) => patchTypography({ bodyFont: value })}
        options={FONT_OPTIONS}
        value={typography.bodyFont}
      />
      <SelectRow
        label="Heading font"
        leaf={settingLeaf("typography.headingFont")}
        onChange={(value) => patchTypography({ headingFont: value })}
        options={FONT_OPTIONS}
        value={typography.headingFont}
      />
      <SelectRow
        label="Code font"
        leaf={settingLeaf("typography.codeFont")}
        onChange={(value) => patchTypography({ codeFont: value })}
        options={CODE_FONT_OPTIONS}
        value={typography.codeFont}
      />
      <SelectRow
        label="Code panels"
        leaf={settingLeaf("typography.codePanels")}
        onChange={(value) => patchTypography({ codePanels: value })}
        options={CODE_PANEL_OPTIONS}
        value={typography.codePanels}
      />
      {codeTheme && <CodeThemeRows controls={codeTheme} />}
      <SelectRow
        label="Number font"
        leaf={settingLeaf("typography.numberFont")}
        onChange={(value) => patchTypography({ numberFont: value })}
        options={NUMBER_FONT_OPTIONS}
        value={typography.numberFont}
      />
      <SliderRow
        label="Font size"
        leaf={settingLeaf("typography.fontSize")}
        max={28}
        min={12}
        onChange={(value) => patchTypography({ fontSize: value })}
        step={0.5}
        value={typography.fontSize}
        valueLabel={`${typography.fontSize}px`}
      />
      <SliderRow
        label="Line height"
        leaf={settingLeaf("typography.lineHeight")}
        max={2.1}
        min={1.1}
        onChange={(value) => patchTypography({ lineHeight: value })}
        step={0.05}
        value={typography.lineHeight}
        valueLabel={typography.lineHeight.toFixed(2)}
      />
      <SliderRow
        label="Letter spacing"
        leaf={settingLeaf("typography.letterSpacing")}
        max={0.08}
        min={-0.02}
        onChange={(value) => patchTypography({ letterSpacing: value })}
        step={0.005}
        value={typography.letterSpacing}
        valueLabel={`${(typography.letterSpacing * 1000).toFixed(0)}‰`}
      />
    </ControlGroup>
  );
}
