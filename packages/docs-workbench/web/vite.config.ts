import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = dirname(fileURLToPath(import.meta.url));

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
    proxy: {
      "/api": {
        target: process.env.DOCS_API ?? "http://localhost:4800",
        changeOrigin: true,
      },
    },
  },
});
