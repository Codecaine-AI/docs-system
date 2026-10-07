import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { loadDocsFonts } from "./shared/docs-fonts";
import { installGrainCodeMask } from "./_lib/grain-code-mask";
// index.css loads @codecaine-ai/design-system/fonts.css (the Inter and IBM Plex
// Mono faces) ahead of the tokens.
import "./index.css";

// The design-system Inter / IBM Plex Mono faces load alongside the first render
// instead of blocking it; canvas and sequence embeds re-lay out when they arrive.
void loadDocsFonts();

// Code panes stay flat: the grain overlay is masked out over them.
installGrainCodeMask();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
