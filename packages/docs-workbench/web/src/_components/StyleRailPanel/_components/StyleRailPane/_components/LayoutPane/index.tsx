import type { PaneBodyProps } from "../../types";
import { SidebarPane } from "./_components/SidebarPane";
import { ScrollbarPane } from "./_components/ScrollbarPane";
import { TransitionsPane } from "./_components/TransitionsPane";
import { SidePeekPane } from "./_components/SidePeekPane";
import { EditorPane } from "./_components/EditorPane";

export type LayoutPaneProps = PaneBodyProps;

export function LayoutPane(props: LayoutPaneProps) {
  switch (props.selectedId) {
    case "layout.sidebar": return <SidebarPane {...props} />;
    case "layout.scrollbar": return <ScrollbarPane {...props} />;
    case "layout.transitions": return <TransitionsPane {...props} />;
    case "layout.side-peek": return <SidePeekPane {...props} />;
    case "layout.editor": return <EditorPane {...props} />;
    default: return null;
  }
}
