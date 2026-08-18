import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveDocsKernelCorpora } from "./kernel";

function makeTempRoot(): string {
	return mkdtempSync(join(tmpdir(), "docs-kernel-corpora-"));
}

describe("docs kernel corpus resolution", () => {
	test("options.corpora wins and resolves relative roots against CWD", () => {
		const root = makeTempRoot();
		try {
			const cwd = join(root, "cwd");
			const docsRoot = join(cwd, "option-docs");
			mkdirSync(docsRoot, { recursive: true });

			expect(resolveDocsKernelCorpora(
				{ corpora: [{ name: "option", docsRoot: "option-docs" }] },
				{
					rootDir: root,
					cwd,
					env: { DOCS_KERNEL_DOCS_ROOTS: "ignored=missing" },
				},
			)).toEqual([{ name: "option", docsRoot }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("DOCS_KERNEL_DOCS_ROOTS preserves order, resolves against CWD, and skips missing directories", () => {
		const root = makeTempRoot();
		try {
			const cwd = join(root, "cwd");
			const first = join(cwd, "first-docs");
			const second = join(root, "second-docs");
			mkdirSync(first, { recursive: true });
			mkdirSync(second, { recursive: true });
			const warnings: string[] = [];

			expect(resolveDocsKernelCorpora({}, {
				rootDir: root,
				cwd,
				env: {
					DOCS_KERNEL_DOCS_ROOTS:
						`first=first-docs,missing=does-not-exist,second=${second}`,
				},
				warn: (message) => warnings.push(message),
			})).toEqual([
				{ name: "first", docsRoot: first },
				{ name: "second", docsRoot: second },
			]);
			expect(warnings).toEqual([
				`docs-kernel: docs root for corpus missing not found at ${join(cwd, "does-not-exist")}; skipping.`,
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("corpora file roots resolve relative to the file", () => {
		const root = makeTempRoot();
		try {
			const configDir = join(root, "config");
			const first = join(configDir, "docs-a");
			const second = join(root, "docs-b");
			mkdirSync(first, { recursive: true });
			mkdirSync(second, { recursive: true });
			const corporaFile = join(configDir, "corpora.json");
			writeFileSync(corporaFile, JSON.stringify({
				corpora: [
					{ name: "a", docsRoot: "docs-a" },
					{ name: "b", docsRoot: "../docs-b" },
				],
			}));

			expect(resolveDocsKernelCorpora(
				{ docsRoot: join(root, "ignored-legacy") },
				{
					rootDir: root,
					cwd: root,
					env: { DOCS_KERNEL_CORPORA_FILE: "config/corpora.json" },
				},
			)).toEqual([
				{ name: "a", docsRoot: first },
				{ name: "b", docsRoot: second },
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy single root derives its corpus name from the parent directory", () => {
		const root = makeTempRoot();
		try {
			const docsRoot = join(root, "gamecube-decomp-harness", "docs");
			mkdirSync(docsRoot, { recursive: true });

			expect(resolveDocsKernelCorpora(
				{ docsRoot },
				{ rootDir: root, env: {}, cwd: root },
			)).toEqual([{
				name: "gamecube-decomp-harness",
				docsRoot,
			}]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("boot resolution fails only when no valid corpus directory remains", () => {
		const root = makeTempRoot();
		try {
			const warnings: string[] = [];
			expect(() => resolveDocsKernelCorpora(
				{ corpora: [{ name: "missing", docsRoot: "missing-docs" }] },
				{
					rootDir: root,
					cwd: root,
					env: {},
					warn: (message) => warnings.push(message),
				},
			)).toThrow("docs-kernel: no valid docs corpora found");
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain(resolve(root, "missing-docs"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
