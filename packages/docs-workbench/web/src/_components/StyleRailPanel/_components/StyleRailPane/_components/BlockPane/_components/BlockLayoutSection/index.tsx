import { BLOCK_COLUMN_SPLIT_DEFAULTS, BLOCK_COLUMN_SPLIT_MAX, BLOCK_COLUMN_SPLIT_MIN, BLOCK_LAYOUT_CUSTOM_WIDTH_MAX, BLOCK_LAYOUT_CUSTOM_WIDTH_MIN, hasBlockColumnSplit, type BlockLayoutOverride } from "../../../../../../../../shared/style-rail-settings";
import { settingLeaf } from "../../../../../../overrides";
import type { PaneBodyProps } from "../../../../types";
import { Subgroup } from "../../../Subgroup";
import { SelectRow } from "../../../SelectRow";
import { SliderRow } from "../../../SliderRow";

export type BlockLayoutSectionProps = Pick<PaneBodyProps, "settings"> & { file: string; patchBlockLayout: PaneBodyProps["patchers"]["patchBlockLayout"] };
  /**
   * The per-component Layout section: where this block type sits on the page,
   * layered over docs-viewer's block-layout.ts code default.
   *
   * Rendered from the SHARED component-pane case, so every doc block type
   * gets it from one place. Non-block panes (inline-code, linking, shell,
   * surfaces, editor-controls) are not lanes and get nothing — that is what
   * the isBlockLayoutType gate at the call site enforces.
   *
   * "Default" is the absence of an override, not a value: selecting it
   * deletes the field so the code default shows through again.
   */
export function BlockLayoutSection({ file, settings, patchBlockLayout }: BlockLayoutSectionProps) {
    const override = settings.blockLayout[file] ?? {};
    const isCustomWidth = typeof override.width === "string" && override.width.endsWith("px");
    const customWidthPx = isCustomWidth
      ? Number.parseFloat(override.width as string)
      : BLOCK_LAYOUT_CUSTOM_WIDTH_MIN;
    return (
      <Subgroup label="Layout">
        <SelectRow
          label="Width"
          leaf={settingLeaf(`blockLayout.${file}.width`)}
          onChange={(value) =>
            patchBlockLayout(file, {
              width:
                value === "default"
                  ? undefined
                  : value === "custom"
                    ? (`${customWidthPx}px` as BlockLayoutOverride["width"])
                    : (value as BlockLayoutOverride["width"]),
            })
          }
          options={[
            { id: "default", label: "Default" },
            { id: "text", label: "Text measure" },
            { id: "code", label: "Code lane" },
            { id: "wide", label: "Wide lane" },
            { id: "full", label: "Full width" },
            { id: "custom", label: "Custom…" },
          ]}
          value={
            override.width === undefined ? "default" : isCustomWidth ? "custom" : override.width
          }
        />
        {isCustomWidth && (
          <SliderRow
            label="Custom width"
            max={BLOCK_LAYOUT_CUSTOM_WIDTH_MAX}
            min={BLOCK_LAYOUT_CUSTOM_WIDTH_MIN}
            onChange={(value) =>
              patchBlockLayout(file, { width: `${value}px` as BlockLayoutOverride["width"] })
            }
            step={20}
            value={customWidthPx}
            valueLabel={`${customWidthPx}px`}
          />
        )}
        {/* Only the two-pane block types have a split to give. Expressed as
            the LEFT (fields/operations) pane's share, because that is the one
            the reader is sizing against its text; the example pane simply
            takes what is left. */}
        {hasBlockColumnSplit(file) && (
          <SliderRow
            label="Column split"
            leaf={settingLeaf(`blockLayout.${file}.columnSplit`)}
            max={BLOCK_COLUMN_SPLIT_MAX}
            min={BLOCK_COLUMN_SPLIT_MIN}
            onChange={(value) => patchBlockLayout(file, { columnSplit: value })}
            step={1}
            value={override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50}
            valueLabel={`${override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50}% / ${
              100 - (override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50)
            }%`}
          />
        )}
        <SelectRow
          label="Justification"
          leaf={settingLeaf(`blockLayout.${file}.justify`)}
          onChange={(value) =>
            patchBlockLayout(file, {
              justify:
                value === "default" ? undefined : (value as BlockLayoutOverride["justify"]),
            })
          }
          options={[
            { id: "default", label: "Default" },
            { id: "left", label: "Left" },
            { id: "center", label: "Center" },
          ]}
          value={override.justify ?? "default"}
        />
      </Subgroup>
    );
}
