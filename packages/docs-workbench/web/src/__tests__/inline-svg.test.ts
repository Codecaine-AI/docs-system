import { expect, test } from "bun:test";
import { scopeSvgIds } from "../lib/inline-svg";

const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

test("scopes every id and each kind of reference to it, leaving unknown references alone", () => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-labelledby="label">',
    '<title id="label">Title</title>',
    "<style>#shape{fill:url(#paint)} .note{fill:#fff}</style>",
    "<defs><linearGradient id=\"paint\"/><clipPath id='clip'/></defs>",
    "<rect id=\"shape\" clip-path=\"url( '#clip' )\"/>",
    '<use href="#shape"/><use xlink:href="#shape"/>',
    '<circle fill="url(#elsewhere)"/>',
    "</svg>",
  ].join("");
  const root = parse(scopeSvgIds(svg, "d1-"));
  expect(Array.from(root.querySelectorAll("[id]"), element => element.getAttribute("id"))).toEqual(["d1-label", "d1-paint", "d1-clip", "d1-shape"]);
  expect(root.getAttribute("aria-labelledby")).toBe("d1-label");
  expect(root.querySelector("style")!.textContent).toBe("#d1-shape{fill:url(#d1-paint)} .note{fill:#fff}");
  expect(root.querySelector("rect")!.getAttribute("clip-path")).toBe("url('#d1-clip')");
  expect(Array.from(root.querySelectorAll("use"), use => use.getAttribute("href") ?? use.getAttribute("xlink:href"))).toEqual(["#d1-shape", "#d1-shape"]);
  expect(root.querySelector("circle")!.getAttribute("fill")).toBe("url(#elsewhere)");
});

test("returns markup without ids unchanged", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>';
  expect(scopeSvgIds(svg, "d1-")).toBe(svg);
});
