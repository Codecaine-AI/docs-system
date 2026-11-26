// Runs under Bun: builds the viewer SPA cache once so worker servers start from it.
import { ensureSpaBuilt } from "@codecaine-ai/docs-workbench";

await ensureSpaBuilt({ mode: "serve", log: (message) => console.error(message) });
