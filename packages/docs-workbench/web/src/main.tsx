import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./shell/App";
import { loadDocsFonts } from "./lib/docs-fonts";
import { installGrainCodeMask } from "./theme/grain-code-mask";
import "@codecaine-ai/text-measure/fonts.css";
import "./index.css";

// The bundled Inter / IBM Plex Mono faces load alongside the first render
// instead of blocking it; canvas and sequence embeds re-lay out when they arrive.
void loadDocsFonts();

// Code panes stay flat: the grain overlay is masked out over them.
installGrainCodeMask();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
