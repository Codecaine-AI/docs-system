import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocsEditSessionService, type DocsEditSessionService } from "./service";
import { fixtureDoc, FIXTURE_PATH, writeBundle } from "./test-fixtures";
import { toolDocsRead, toolDocsTree } from "./tools";

describe("docs-edit multi-corpus sessions", () => {
	const tempRoots: string[] = [];
	const services: DocsEditSessionService[] = [];

	afterEach(async () => {
		for (const service of services.splice(0)) service.disposeAll();
		await Promise.all(tempRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true }),
		));
	});

	async function makeCorpus(prefix: string, title: string): Promise<string> {
		const docsRoot = await mkdtemp(join(tmpdir(), prefix));
		tempRoots.push(docsRoot);
		await writeBundle(docsRoot, FIXTURE_PATH, {
			doc: fixtureDoc({ id: `${prefix}-guide`, title }),
		});
		return docsRoot;
	}

	test("defaults to the first corpus and allows the same path in another corpus", async () => {
		const alphaRoot = await makeCorpus("docs-kernel-alpha-", "Alpha Guide");
		const betaRoot = await makeCorpus("docs-kernel-beta-", "Beta Guide");
		const service = createDocsEditSessionService({
			corpora: [
				{ name: "alpha", docsRoot: alphaRoot },
				{ name: "beta", docsRoot: betaRoot },
			],
		});
		services.push(service);

		const alpha = await service.createSession({ path: FIXTURE_PATH, spawn: false });
		const beta = await service.createSession({ corpus: "beta", path: FIXTURE_PATH, spawn: false });

		expect(alpha.ok).toBe(true);
		expect(beta.ok).toBe(true);
		if (!alpha.ok || !beta.ok) return;
		expect(alpha.state).toMatchObject({ corpus: "alpha", path: FIXTURE_PATH });
		expect(beta.state).toMatchObject({ corpus: "beta", path: FIXTURE_PATH });
		expect(service.getSession(alpha.state.sessionId)).toMatchObject({ corpus: "alpha", docsRoot: alphaRoot });
		expect(service.getSession(beta.state.sessionId)).toMatchObject({ corpus: "beta", docsRoot: betaRoot });
		expect(service.list().map(({ corpus, path }) => ({ corpus, path }))).toEqual([
			{ corpus: "alpha", path: FIXTURE_PATH },
			{ corpus: "beta", path: FIXTURE_PATH },
		]);
		expect(await service.createSession({ corpus: "missing", path: FIXTURE_PATH, spawn: false })).toEqual({
			ok: false,
			reason: "unknown-corpus",
			corpus: "missing",
			known: ["alpha", "beta"],
		});
	});

	test("docs_tree and docs_read remain confined to the session corpus root", async () => {
		const alphaRoot = await makeCorpus("docs-kernel-alpha-", "Alpha Guide");
		const betaRoot = await makeCorpus("docs-kernel-beta-", "Beta Guide");
		await writeBundle(alphaRoot, "alpha-only", {
			doc: fixtureDoc({ id: "alpha-only", title: "Alpha Only" }),
			annotations: null,
		});
		await writeBundle(betaRoot, "beta-only", {
			doc: fixtureDoc({ id: "beta-only", title: "Beta Only" }),
			annotations: null,
		});
		const service = createDocsEditSessionService({
			corpora: [
				{ name: "alpha", docsRoot: alphaRoot },
				{ name: "beta", docsRoot: betaRoot },
			],
		});
		services.push(service);
		const alpha = await service.createSession({ path: FIXTURE_PATH, spawn: false });
		const beta = await service.createSession({ corpus: "beta", path: FIXTURE_PATH, spawn: false });
		if (!alpha.ok || !beta.ok) throw new Error("failed to create corpus sessions");
		const alphaSession = service.getSession(alpha.state.sessionId)!;
		const betaSession = service.getSession(beta.state.sessionId)!;

		const alphaTree = await toolDocsTree({ docsRoot: alphaSession.docsRoot });
		expect(alphaTree.text).toContain("alpha-only");
		expect(alphaTree.text).not.toContain("beta-only");
		const alphaCannotReadBeta = await toolDocsRead({ docsRoot: alphaSession.docsRoot }, { path: "beta-only" });
		expect(alphaCannotReadBeta.isError).toBe(true);
		const betaCanReadBeta = await toolDocsRead({ docsRoot: betaSession.docsRoot }, { path: "beta-only" });
		expect(betaCanReadBeta.isError).toBeUndefined();
		expect(betaCanReadBeta.details).toMatchObject({ path: "beta-only", title: "Beta Only" });
	});
});
