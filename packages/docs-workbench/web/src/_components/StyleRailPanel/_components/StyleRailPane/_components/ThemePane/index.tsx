import { PresetsPane } from "./_components/PresetsPane";
import { ColorsPane } from "./_components/ColorsPane";
import { TypographyPane } from "./_components/TypographyPane";
import { BackgroundPane } from "./_components/BackgroundPane";
import { ReferencesPane } from "./_components/ReferencesPane";
import { SurfacesPane } from "./_components/SurfacesPane";
import { AnnotatePane } from "./_components/AnnotatePane";
import type { PaneBodyProps } from "../../types";

export type ThemePaneProps = PaneBodyProps;

export function ThemePane(props: ThemePaneProps) {
  switch (props.selectedId) {
    case "theme.presets": return <PresetsPane {...props} />;
    case "theme.colors": return <ColorsPane {...props} />;
    case "theme.typography": return <TypographyPane {...props} />;
    case "theme.background": return <BackgroundPane {...props} />;
    case "theme.references": return <ReferencesPane {...props} />;
    case "theme.surfaces": return <SurfacesPane {...props} />;
    case "theme.annotate": return <AnnotatePane {...props} />;
    default: return null;
  }
}
