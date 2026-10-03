import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * The bundled Inter / IBM Plex Mono woff2 files (@codecaine-ai/text-measure,
 * imported by main.tsx) live in the canvas checkout, outside this workspace,
 * so the dev server must be allowed to serve them.
 */
const textMeasureFonts = resolve(
  dirname(createRequire(import.meta.url).resolve("@codecaine-ai/text-measure/fonts.css")),
  "fonts",
);

/**
 * Two build modes (see web/src/data/api.ts):
 *  - default: SPA for `docs-cli serve` (live /api routes) -> dist/
 *  - DOCS_STATIC=1: SPA for `docs-cli export` (pregenerated data/ JSON)
 *    -> dist-static/
 *
 * `base: "./"` keeps every built asset reference relative so both variants
 * work from any host path (the export requirement); hash routing means no
 * history fallback is needed.
 */
const isStatic = process.env.DOCS_STATIC === "1";

export default defineConfig({
  root: here,
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __DOCS_STATIC__: JSON.stringify(isStatic),
    __CANVAS_STUDIO_URL__: JSON.stringify(
      process.env.CANVAS_STUDIO_URL ?? "http://localhost:3999",
    ),
    __SEQUENCE_STUDIO_URL__: JSON.stringify(
      process.env.SEQUENCE_STUDIO_URL ?? "http://localhost:3998",
    ),
  },
  resolve: {
    // The canvas git submodule can carry its own node_modules; force a
    // single React instance across the workspace boundary.
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: resolve(here, isStatic ? "dist-static" : "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 4801,
    fs: {
      allow: [searchForWorkspaceRoot(here), textMeasureFonts],
    },
    proxy: {
      "/api": {
        target: process.env.DOCS_API ?? "http://localhost:4800",
        changeOrigin: true,
      },
    },
  },
});
