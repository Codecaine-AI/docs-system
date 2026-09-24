export interface BundleSrcFixture {
  src: string;
  bundlePath: string | null;
  expected: string;
}

export const BUNDLE_SRC_FIXTURES: BundleSrcFixture[] = [
  { src: "./assets/x", bundlePath: "10-s/page", expected: "10-s/page/assets/x" },
  { src: "assets/x", bundlePath: "10-s/page", expected: "10-s/page/assets/x" },
  {
    src: "10-section/page/assets/x",
    bundlePath: "10-s/page",
    expected: "10-section/page/assets/x",
  },
  { src: "../x", bundlePath: "10-s/page", expected: "../x" },
  { src: "/x", bundlePath: "10-s/page", expected: "/x" },
  {
    src: "https://example.com/x.png",
    bundlePath: "10-s/page",
    expected: "https://example.com/x.png",
  },
  { src: "./assets/x", bundlePath: null, expected: "./assets/x" },
  { src: "assets/x", bundlePath: null, expected: "assets/x" },
  {
    src: "10-section/page/assets/x",
    bundlePath: null,
    expected: "10-section/page/assets/x",
  },
  { src: "../x", bundlePath: null, expected: "../x" },
  { src: "/x", bundlePath: null, expected: "/x" },
  {
    src: "https://example.com/x.png",
    bundlePath: null,
    expected: "https://example.com/x.png",
  },
];
