import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Builds the viewer SPA before any worker starts. Each worker runs its own
 * `docs serve`, and every one of them would otherwise race to vite-build the
 * same shared dist folder when the SPA sources are newer than the cache.
 */
export default function globalSetup(): void {
  execFileSync("bun", [path.join(import.meta.dirname, "build-spa.ts")], { stdio: "inherit" });
}
