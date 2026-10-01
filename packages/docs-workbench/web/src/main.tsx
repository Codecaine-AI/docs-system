import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./shell/App";
import { installGrainCodeMask } from "./theme/grain-code-mask";
import "./index.css";

// Code panes stay flat: the grain overlay is masked out over them.
installGrainCodeMask();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
