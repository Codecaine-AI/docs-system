import { describe, expect, it } from "bun:test";
import type {
	AnnotationTarget,
	DocAnnotation,
} from "@codecaine-ai/docs-model/annotations-schema";
import { docTargetFingerprint } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocProposal } from "../../data/api";
import {
	deriveDocEditRequests,
	deriveStagedProposals,
	mapAnnotationTargetToDocEditTarget,
	staleStagedProposals,
} from "../doc-lab-projection";

const doc: DocDocument = {
	schemaVersion: 1,
	id: "doc-1",
	title: "Projection fixture",
	root: "root",
	blocks: {
		root: {
			id: "root",
			type: "paragraph",
			props: {},
			children: ["paragraph"],
		},
		paragraph: {
			id: "paragraph",
			type: "paragraph",
			props: {},
			text: [{ insert: "Hello projection" }],
			children: [],
		},
	},
};

function annotation(
	id: string,
	overrides: Partial<DocAnnotation> = {},
): DocAnnotation {
	return {
		id,
		target: { kind: "block", blockId: "paragraph" },
		body: `Request ${id}`,
		intent: "agent-request",
		author: "ford",
		status: "open",
		createdAt: "2026-08-14T12:00:00.000Z",
		...overrides,
	};
}

function proposal(
	id: string,
	overrides: Partial<DocProposal & { stale: boolean }> = {},
): DocProposal & { stale: boolean } {
	return {
		id,
		ops: [],
		changedBlockIds: ["paragraph"],
		summary: `Proposal ${id}`,
		baseHash: "base-hash",
		status: "staged",
		createdAt: "2026-08-14T12:01:00.000Z",
		stale: false,
		...overrides,
	};
}

describe("mapAnnotationTargetToDocEditTarget", () => {
	it("maps the root block to the document, preserves direct targets, and rejects canvas targets", () => {
		const targets: AnnotationTarget[] = [
			{ kind: "block", blockId: "root", fingerprint: "ignored" },
			{ kind: "block", blockId: "paragraph", fingerprint: "ignored" },
			{
				kind: "text-range",
				blockId: "paragraph",
				start: 0,
				end: 5,
				quote: "Hello",
				fingerprint: "ignored",
			},
			{ kind: "canvas-object", canvasSrc: "diagram.canvas.json", objectId: "box-1" },
		];

		expect(targets.map((target) => mapAnnotationTargetToDocEditTarget(target, doc.root))).toEqual([
			{ kind: "doc" },
			{ kind: "block", blockId: "paragraph" },
			{ kind: "text-range", blockId: "paragraph", start: 0, end: 5, quote: "Hello" },
			null,
		]);
	});
});

describe("deriveDocEditRequests", () => {
	it("keeps filed aliases stable across resolved rows and projects every status branch", () => {
		const annotations = [
			annotation("applied", { status: "resolved" }),
			annotation("declined", { status: "resolved" }),
			annotation("resolved", { status: "resolved" }),
			annotation("ready"),
			annotation("waiting", {
				replies: [{ id: "agent-last", author: "agent", body: "Need input", createdAt: "t2" }],
			}),
			annotation("open", {
				replies: [{ id: "user-last", author: "ford", body: "More detail", createdAt: "t3" }],
			}),
			annotation("ordinary-note", { intent: "note" }),
		];
		const proposals = [
			proposal("accepted", { annotationId: "applied", status: "accepted" }),
			proposal("old-rejection", { annotationId: "applied", status: "rejected" }),
			proposal("rejected", { annotationId: "declined", status: "rejected" }),
			proposal("ready-proposal", { annotationId: "ready" }),
			proposal("stale-open", { annotationId: "open", stale: true }),
		];

		const requests = deriveDocEditRequests({ annotations, proposals, doc });

		expect(requests.map(({ annotationId, alias, status }) => ({ annotationId, alias, status }))).toEqual([
			{ annotationId: "applied", alias: "R1", status: "applied" },
			{ annotationId: "declined", alias: "R2", status: "declined" },
			{ annotationId: "resolved", alias: "R3", status: "resolved" },
			{ annotationId: "ready", alias: "R4", status: "ready" },
			{ annotationId: "waiting", alias: "R5", status: "waiting" },
			{ annotationId: "open", alias: "R6", status: "open" },
		]);
	});

	it("maps thread authors and target drift while excluding canvas requests", () => {
		const fingerprint = docTargetFingerprint(doc, { kind: "block", blockId: "paragraph" });
		if (!fingerprint) throw new Error("Expected block fixture to have a fingerprint");
		const requests = deriveDocEditRequests({
			doc,
			proposals: [],
			annotations: [
				annotation("threaded", {
					target: { kind: "block", blockId: "paragraph", fingerprint: `${fingerprint}-stale` },
					replies: [
						{ id: "reply-anonymous", author: "anonymous", body: "Anonymous reply", createdAt: "t1" },
						{ id: "reply-you", author: "you", body: "Your reply", createdAt: "t2" },
						{ id: "reply-agent", author: "agent", body: "Agent reply", createdAt: "t3" },
						{ id: "reply-system", author: "system", body: "System reply", createdAt: "t4" },
					],
				}),
				annotation("canvas", {
					target: { kind: "canvas-object", canvasSrc: "diagram.canvas.json", objectId: "box-1" },
				}),
			],
		});

		expect(requests[0]?.thread).toEqual([
			{ id: "reply-anonymous", author: "user", body: "Anonymous reply", at: "t1" },
			{ id: "reply-you", author: "user", body: "Your reply", at: "t2" },
			{ id: "reply-agent", author: "agent", body: "Agent reply", at: "t3" },
			{ id: "reply-system", author: "agent", body: "System reply", at: "t4" },
		]);
		expect(requests[0]?.targetChanged).toBe(true);
		expect(requests).toHaveLength(1);
	});

	it("numbers aliases over included requests and projects root annotations as unchanged globals", () => {
		const requests = deriveDocEditRequests({
			doc,
			proposals: [],
			annotations: [
				annotation("canvas", {
					target: { kind: "canvas-object", canvasSrc: "diagram.canvas.json", objectId: "box-1" },
				}),
				annotation("global", {
					target: { kind: "block", blockId: doc.root, fingerprint: "stale-root-fingerprint" },
				}),
				annotation("local"),
			],
		});

		expect(requests.map(({ annotationId, alias, target, disposition, targetChanged }) => ({
			annotationId,
			alias,
			target,
			disposition,
			targetChanged,
		}))).toEqual([
			{
				annotationId: "global",
				alias: "R1",
				target: { kind: "doc" },
				disposition: "global",
				targetChanged: false,
			},
			{
				annotationId: "local",
				alias: "R2",
				target: { kind: "block", blockId: "paragraph" },
				disposition: "batch",
				targetChanged: false,
			},
		]);
	});
});

describe("proposal projections", () => {
	it("preserves staging order and chooses linked, explicit, then fallback aliases", () => {
		const requests = deriveDocEditRequests({
			doc,
			annotations: [annotation("linked")],
			proposals: [],
		});
		const proposals = [
			proposal("linked-proposal", { annotationId: "linked" }),
			proposal("named-proposal", { alias: "CUSTOM" }),
			proposal("fallback-one"),
			proposal("accepted-row", { status: "accepted" }),
			proposal("fallback-two"),
		];

		expect(deriveStagedProposals({ proposals, requests }).map((row) => ({
			transactionId: row.transactionId,
			alias: row.alias,
		}))).toEqual([
			{ transactionId: "linked-proposal", alias: "R1" },
			{ transactionId: "named-proposal", alias: "CUSTOM" },
			{ transactionId: "fallback-one", alias: "A1" },
			{ transactionId: "fallback-two", alias: "A2" },
		]);
	});

	it("excludes stale staged proposals and returns them from the conflict projection", () => {
		const proposals = [
			proposal("active"),
			proposal("stale-one", { stale: true }),
			proposal("accepted-stale", { stale: true, status: "accepted" }),
			proposal("stale-two", { stale: true }),
		];

		expect(deriveStagedProposals({ proposals, requests: [] }).map((row) => row.transactionId)).toEqual([
			"active",
		]);
		expect(staleStagedProposals({ proposals }).map((row) => row.id)).toEqual([
			"stale-one",
			"stale-two",
		]);
	});
});
