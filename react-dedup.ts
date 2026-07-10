/**
 * bun test preload — de-duplicates React across the @codecaine-ai/canvas
 * git-submodule boundary.
 *
 * external/canvas is a git submodule that may carry its own node_modules
 * (installed by its own bun.lock), so canvas sources can resolve
 * react/react-dom to a second copy while this repo's tests render with the
 * root copy. Two React instances share no dispatcher, so any test that
 * mounts a canvas component would die with "Invalid hook call" — and the
 * aborted renders leak broken state into later test files in the same
 * `bun test` process.
 *
 * mock.module() accepts resolved absolute paths, so point every React-family
 * module reachable from the canvas package at the root instances. No-op when
 * the submodule's node_modules is absent (resolution already unifies).
 *
 * Adapted from Spectre apps/frontend/src/test/real-modules.ts.
 */
import { mock } from "bun:test";
import * as RootReact from "react";
import * as RootJsxRuntime from "react/jsx-runtime";
import * as RootJsxDevRuntime from "react/jsx-dev-runtime";
import * as RootReactDom from "react-dom";
import * as RootReactDomClient from "react-dom/client";

{
	const reactFamily: Array<[string, object]> = [
		["react", RootReact],
		["react/jsx-runtime", RootJsxRuntime],
		["react/jsx-dev-runtime", RootJsxDevRuntime],
		["react-dom", RootReactDom],
		["react-dom/client", RootReactDomClient],
	];
	try {
		const canvasEntry = Bun.resolveSync("@codecaine-ai/canvas", import.meta.dir);
		const canvasDir = canvasEntry.slice(0, canvasEntry.lastIndexOf("/"));
		for (const [spec, rootNamespace] of reactFamily) {
			try {
				const canvasPath = Bun.resolveSync(spec, canvasDir);
				const rootPath = Bun.resolveSync(spec, import.meta.dir);
				if (canvasPath !== rootPath) {
					const copy = { ...rootNamespace };
					mock.module(canvasPath, () => copy);
				}
			} catch {
				// Spec not resolvable from the canvas package — nothing to unify.
			}
		}
	} catch {
		// Canvas package not installed — nothing to unify.
	}
}
