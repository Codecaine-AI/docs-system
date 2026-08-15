import { describe, expect, test } from "bun:test";

import { docsEditRequestsFromAnnotations } from "./from-annotations";
import {
	fixtureAnnotation,
	fixtureDoc,
} from "./test-fixtures";

describe("docsEditRequestsFromAnnotations", () => {
	test("maps block, text-range, and root-block targets with the settled dispositions", () => {
		const doc = fixtureDoc();
		const { requests, skipped } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({
					id: "block",
					target: {
						kind: "block",
						blockId: "p1",
						fingerprint: "block-fingerprint",
					},
				}),
				fixtureAnnotation({
					id: "range",
					target: {
						kind: "text-range",
						blockId: "p2",
						start: 0,
						end: 6,
						quote: "Second",
						fingerprint: "filed-fingerprint",
					},
				}),
				fixtureAnnotation({
					id: "whole-doc",
					target: { kind: "block", blockId: doc.root },
				}),
			],
			doc,
		);

		expect(skipped).toEqual([]);
		expect(requests.map(({ id, target, disposition }) => ({
			id,
			target,
			disposition,
		}))).toEqual([
			{
				id: "block",
				target: {
					kind: "block",
					blockId: "p1",
					fingerprint: "block-fingerprint",
				},
				disposition: "batch",
			},
			{
				id: "range",
				target: {
					kind: "text-range",
					blockId: "p2",
					start: 0,
					end: 6,
					quote: "Second",
					fingerprint: "filed-fingerprint",
				},
				disposition: "batch",
			},
			{
				id: "whole-doc",
				target: { kind: "doc" },
				disposition: "global",
			},
		]);
	});

	test("reports canvas targets with a typed unsupported-target skip", () => {
		const { requests, skipped } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({
					id: "canvas",
					target: {
						kind: "canvas-object",
						canvasSrc: "assets/canvases/flow.canvas.json",
						objectId: "step-1",
					},
				}),
			],
			fixtureDoc(),
		);

		expect(requests).toEqual([]);
		expect(skipped).toEqual([
			{
				annotationId: "canvas",
				reason: "unsupported-target",
				detail: 'target kind "canvas-object" is outside docs-edit scope',
			},
		]);
	});

	test("gates resolved and non-agent annotations with specific skipped reasons", () => {
		const { requests, skipped } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({ id: "resolved", status: "resolved" }),
				fixtureAnnotation({ id: "note", intent: "note" }),
				fixtureAnnotation({ id: "live" }),
			],
			fixtureDoc(),
		);

		expect(requests.map((request) => request.id)).toEqual(["live"]);
		expect(skipped).toEqual([
			{
				annotationId: "resolved",
				reason: "not-open",
				detail: 'status is "resolved"',
			},
			{
				annotationId: "note",
				reason: "not-agent-request",
				detail: 'intent is "note"',
			},
		]);
	});

	test("scope allowlisting preserves filed order and reports out-of-scope and unmatched ids", () => {
		const { requests, skipped } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({ id: "first" }),
				fixtureAnnotation({ id: "second" }),
				fixtureAnnotation({ id: "third" }),
			],
			fixtureDoc(),
			{ scopeIds: ["third", "first", "missing"] },
		);

		// The scope does not reorder sidecar entries; the service therefore gives
		// these R1 and R2 in this same order.
		expect(requests.map((request) => request.id)).toEqual(["first", "third"]);
		expect(skipped).toEqual([
			{
				annotationId: "second",
				reason: "out-of-scope",
				detail: "not in the requested scope",
			},
			{
				annotationId: "missing",
				reason: "scope-unmatched",
				detail: "no annotation with this id on the sidecar",
			},
		]);
	});

	test("an in-scope request that fails a later gate is not double-reported", () => {
		const { requests, skipped } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({ id: "resolved", status: "resolved" }),
				fixtureAnnotation({ id: "live" }),
			],
			fixtureDoc(),
			{ scopeIds: ["resolved", "live"] },
		);

		expect(requests.map((request) => request.id)).toEqual(["live"]);
		expect(skipped).toEqual([
			{
				annotationId: "resolved",
				reason: "not-open",
				detail: 'status is "resolved"',
			},
		]);
	});

	test("normalizes authors and carries the existing reply thread", () => {
		const { requests } = docsEditRequestsFromAnnotations(
			[
				fixtureAnnotation({
					id: "threaded",
					author: "agent",
					replies: [
						{
							id: "reply-1",
							author: "ford",
							body: "Keep the example.",
							createdAt: "2026-08-14T12:01:00.000Z",
						},
						{
							id: "reply-2",
							author: "system",
							body: "Thread imported.",
							createdAt: "2026-08-14T12:02:00.000Z",
						},
					],
				}),
			],
			fixtureDoc(),
		);

		expect(requests[0]).toMatchObject({
			author: "agent",
			thread: [
				{
					author: "human",
					body: "Keep the example.",
					createdAt: "2026-08-14T12:01:00.000Z",
				},
				{
					author: "system",
					body: "Thread imported.",
					createdAt: "2026-08-14T12:02:00.000Z",
				},
			],
		});
	});
});
