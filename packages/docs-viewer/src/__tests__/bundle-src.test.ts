import { describe, expect, test } from "bun:test";
import { BUNDLE_SRC_FIXTURES } from "@codecaine-ai/docs-model/bundle-src-fixtures";
import {
  resolveBundleAssetSrc,
  resolveBundleCanvasSrc,
  resolveBundleSequenceSrc,
} from "../render/bundle-src";

const resolvers = [
  ["canvas", resolveBundleCanvasSrc],
  ["sequence", resolveBundleSequenceSrc],
  ["asset", resolveBundleAssetSrc],
] as const;

describe.each(resolvers)("resolveBundle%sSrc", (_name, resolveSrc) => {
  test.each(BUNDLE_SRC_FIXTURES)("resolves $src with bundle path $bundlePath", (fixture) => {
    expect(resolveSrc(fixture.bundlePath, fixture.src)).toBe(fixture.expected);
  });
});
