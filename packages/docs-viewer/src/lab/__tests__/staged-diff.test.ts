import { describe, expect, test } from "bun:test";
import { afterRegionForRun, lcsLineMatch } from "../session/staged-diff";

describe("lcsLineMatch", () => {
	test.each([
   ["pairs identical lines monotonically and leaves changes unmatched", () => {
		const before = ["a", "b", "c", "d"];
		const after = ["a", "x", "c", "d"];
		expect(lcsLineMatch(before, after)).toEqual([0, -1, 2, 3]);
	}],
   ["handles pure inserts and deletes", () => {
		expect(lcsLineMatch(["a", "b"], ["a", "new", "b"])).toEqual([0, 2]);
		expect(lcsLineMatch(["a", "gone", "b"], ["a", "b"])).toEqual([0, -1, 1]);
	}],
 ])("%s", (_title: string, run: () => void | Promise<void>) => run());
});

describe("afterRegionForRun", () => {
	test("a run at the document edges clamps to the document edges", () => {
		const before = ["only-old"];
		const after = ["only-new-1", "only-new-2"];
		expect(afterRegionForRun(before, after, 0, 0)).toEqual(["only-new-1", "only-new-2"]);
	});
});
