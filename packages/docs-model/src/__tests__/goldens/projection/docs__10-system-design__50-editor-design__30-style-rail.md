The style rail is the right-docked authoring surface for tuning the active values defined by Themes without leaving the workbench. Its mirrored layout keeps detail controls beside the document and navigation at the screen edge. This page defines the rail's geometry, navigation depth, override signals, reset scope, and control behavior.

## Structure

> **Decision: The panel uses a mirrored two-pane layout** — The detail pane sits on the left, next to the document. The navigation rail sits on the right, flush with the workbench's outer edge. Both panes are flat surfaces with independent vertical scrolling.

| Region | Position | Geometry |
| --- | --- | --- |
| Expanded panel | Right-docked workbench sibling | 46rem total width |
| Detail pane | Left, beside the document | The width remaining after the navigation rail |
| Navigation rail | Right, at the screen edge | 13rem fixed width |
| Collapsed panel | Right edge | 3.25rem total width |

The expanded and collapsed panel widths are anchored in `packages/docs-workbench/web/src/shell/StyleRail.tsx`. The two-pane grid and navigation width are anchored in `packages/docs-workbench/web/src/theme/style-rail.css`.

- **Theme**

  - Presets, Colors, Typography, Background, and Surfaces.

- **Layout**

  - Sidebar, Editor, Side peek, and Scrollbar.

- **Content types**

  - The navigation groups destinations under Rich text, Code, Structure, and Diagrams.

  - Each destination opens one detail pane; the family labels add no navigation level.

## The Rule

- **Every control is reachable in two clicks**

  - Open the panel, then select a navigation item.

  - Every subgroup in the selected pane stays expanded. There are no accordions or chevrons.

- **Every override leaf belongs to one pane**

  - Override state is derived from settings versus defaults and the theme-token registry. It is not stored as a second state model.

  - A value shown as a convenience in another pane still contributes to only its owning pane. Counts cannot double-count it.

  - Light or dark mode is a mode selection, not an override leaf, and does not enter the counts.

  - **Override state is visible at three levels**

    - A control row carries a hollow dot at its default and a filled dot when overridden.

    - A block navigation item shows its override count. Other navigation items show a presence dot.

    - The detail header reports No overrides, 1 override, or the exact plural count.

- **A default value is semantic absence**

  - At default, the rail removes the inline custom property so the active theme remains authoritative.

  - A stored length or number equal to its registry default does not count as an override.

- **Resets stay within their named scope**

  - A color-row reset clears that color and returns it to the theme value.

  - Reset {block} to theme appears only when the pane has an effective override and deletes only that block's component override record.

  - List item also restores its marker and indent settings because those leaves belong to the List item pane.

  - Reset Surfaces tokens to theme clears only registered Surfaces component tokens; independent surface settings remain.

  - Reset to defaults restores the complete rail settings object.

- **Component controls are registry-driven and kind-aware**

  - Color tokens render color inputs with a direct return-to-theme action.

  - Length and number tokens render sliders from registry minimum, maximum, step, unit, and default metadata.

  - A registered token appears automatically inside an existing component pane.

> **Decision: Navigation rows omit value previews** — Each navigation row contains an icon, label, and override status. Colors and Typography use the same row shape as every other destination.

> **Decision: Navigation classification is explicit** — The registry supplies controls within a component pane. Each user-facing component also has an explicit icon, label, and content-type group in the navigation roster; a registered theme file alone does not create a destination.

## Why

- **The mirrored split preserves reach and working width**

  - The controls stay beside the surface they change, while stable navigation occupies the panel's outer edge.

  - The 13rem rail has enough room for labels and status without making the detail pane pay for that width. The 46rem panel preserves the control space needed for dense theme tuning.

- **Shallow navigation serves repeated tuning**

  - Styling is a comparison loop. A fixed destination and fully expanded controls keep each adjustment within the same short path.

- **Derived status cannot drift from the values**

  - Rows, navigation, and pane headers answer from one attribution model, so their signals agree after every change and reset.

- **Defaults return authority to the theme**

  - Removing the inline value lets later theme changes flow through instead of leaving a hidden local value in charge.

- **Registry-driven controls keep extension bounded**

  - A token's declared kind and range determine its control. Block components do not add bespoke rail behavior for each style value.
