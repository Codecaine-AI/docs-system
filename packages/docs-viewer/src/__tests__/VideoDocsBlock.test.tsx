import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VIDEO_AGENT_DESCRIPTION,
  VIDEO_LABEL,
  VideoBlock,
  parseVideoEmbed,
} from "../components/rich-text/VideoDocsBlock";

function renderVideo(props: Partial<Parameters<typeof VideoBlock>[0]> = {}): string {
  return renderToStaticMarkup(createElement(VideoBlock, { id: "video-1", ...props }));
}

describe("parseVideoEmbed — provider URL parsing", () => {
  it("parses youtube.com/watch?v= into the nocookie embed", () => {
    expect(parseVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("parses youtu.be short links", () => {
    expect(parseVideoEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("parses youtube.com/shorts/ links", () => {
    expect(parseVideoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("parses vimeo.com/{id} into the player embed", () => {
    expect(parseVideoEmbed("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("parses loom.com/share/{id} into the loom embed", () => {
    expect(
      parseVideoEmbed("https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184"),
    ).toEqual({
      provider: "loom",
      embedUrl: "https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184",
    });
  });

  it("returns null for unknown hosts, lookalike hosts, and malformed URLs", () => {
    expect(parseVideoEmbed("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoEmbed("https://notyoutube.be/dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoEmbed("https://vimeo.com/about")).toBeNull();
    expect(parseVideoEmbed("not a url")).toBeNull();
    expect(parseVideoEmbed("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("VideoBlock — provider urls (link card, player on request)", () => {
  // happy-dom would otherwise fetch the provider page into the swapped iframe.
  const dom = (window as unknown as { happyDOM?: { settings: { disableIframePageLoading: boolean } } }).happyDOM;
  beforeAll(() => { if (dom) dom.settings.disableIframePageLoading = true; });
  afterAll(() => { if (dom) dom.settings.disableIframePageLoading = false; });
  afterEach(cleanup);

  it("renders a provider url as a link card until the reader asks for the player", () => {
    const html = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Docs walkthrough",
    });
    // Static pages (no hydration) keep a plain link: nothing third-party loads.
    expect(html).not.toContain("<iframe");
    expect(html).toContain('data-video-link-card="true"');
    expect(html).toContain('data-video-provider="youtube"');
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Docs walkthrough");
    expect(html).toContain(">Watch<");
    // The head names the provider; the full URL stays readable on the card.
    expect(html).toContain(">youtube<");
    expect(html).toContain('title="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  });

  it("swaps the card for the youtube-nocookie player on click", () => {
    const { container, getByRole } = render(
      createElement(VideoBlock, {
        id: "video-1",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Docs walkthrough",
        caption: "An external video.",
      }),
    );
    fireEvent.click(getByRole("link"));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame.getAttribute("title")).toBe("Docs walkthrough");
    expect(frame.hasAttribute("allowfullscreen")).toBe(true);
    // "origin" keeps the bare Referer header YouTube requires (a no-referrer
    // embed gets Error 153) while still hiding the doc's path/query.
    expect(frame.getAttribute("referrerpolicy")).toBe("origin");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("data-video-provider")).toBe("youtube");
    // 16:9 media surface; the caption moves below the panel.
    expect(frame.parentElement?.className).toContain("aspect-video");
    expect(container.querySelector("[data-video-link-card]")).toBeNull();
    expect(container.querySelector("figcaption")?.textContent).toBe("An external video.");
    expect(document.activeElement).toBe(frame);
  });

  it("keeps a modified click as a plain link", () => {
    const { container, getByRole } = render(
      createElement(VideoBlock, { id: "video-1", url: "https://vimeo.com/76979871" }),
    );
    fireEvent.click(getByRole("link"), { metaKey: true });
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("url wins over src when both are set", () => {
    const html = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      src: "./assets/videos/demo.mp4",
    });
    expect(html).toContain('data-video-link-card="true"');
    expect(html).not.toContain("<video");
  });
});

describe("VideoBlock — unknown urls (link card, never an iframe)", () => {
  it("renders a neutral link card for a non-provider url", () => {
    const html = renderVideo({
      url: "https://example.com/talks/demo.mp4",
      title: "Conference talk",
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain('data-video-link-card="true"');
    expect(html).toContain('href="https://example.com/talks/demo.mp4"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Conference talk");
    // The raw url stays visible on the card.
    expect(html).toContain("https://example.com/talks/demo.mp4");
  });

  it("falls back to the block label as the title and names the host", () => {
    const html = renderVideo({ url: "https://www.example.com/demo" });
    expect(html).toContain(">Video<");
    expect(html).toContain(">example.com<");
  });

  it("never swaps an unknown url for a player", () => {
    const { container, getByRole } = render(
      createElement(VideoBlock, { id: "video-1", url: "https://example.com/talks/demo.mp4" }),
    );
    fireEvent.click(getByRole("link"));
    expect(container.querySelector("iframe")).toBeNull();
    cleanup();
  });
});

describe("VideoBlock — local bundle src", () => {
  it("renders a native video element with controls and metadata preload", () => {
    const html = renderVideo({ src: "./assets/videos/demo.mp4" });
    expect(html).toContain("<video");
    expect(html).toContain('src="./assets/videos/demo.mp4"');
    expect(html).toContain("controls");
    expect(html).toContain('preload="metadata"');
    expect(html).not.toContain("<iframe");
  });

  it("prefers resolvedSrc over the raw src when provided", () => {
    const html = renderVideo({
      src: "./assets/videos/demo.mp4",
      resolvedSrc: "https://api.example.com/asset?path=demo.mp4",
    });
    expect(html).toContain('src="https://api.example.com/asset?path=demo.mp4"');
    expect(html).not.toContain('src="./assets/videos/demo.mp4"');
  });
});

describe("VideoBlock — framing", () => {
  it("renders the dashed placeholder when neither src nor url is present", () => {
    const html = renderVideo();
    expect(html).toContain("Video block is missing a src or url.");
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
  });

  it("puts a url's caption on the card and a src video's caption below the panel", () => {
    const card = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      caption: "An external video.",
    });
    expect(card).not.toContain("<figcaption");
    expect(card).toContain("An external video.");
    const native = renderVideo({ src: "./assets/videos/demo.mp4", caption: "A recording." });
    expect(native).toMatch(/<figcaption[^>]*>A recording\.<\/figcaption><\/figure>$/);
    // The head names the file.
    expect(native).toContain(">demo.mp4<");
  });

  it("carries the docs-block data attributes on the figure", () => {
    const html = renderVideo({ url: "https://vimeo.com/76979871" });
    expect(html).toContain('data-docs-block-type="video"');
    expect(html).toContain('data-source-id="video-1"');
  });

  it("exports the label and an agent description documenting the props contract", () => {
    expect(VIDEO_LABEL).toBe("Video");
    expect(VIDEO_AGENT_DESCRIPTION).toContain("src");
    expect(VIDEO_AGENT_DESCRIPTION).toContain("url");
    expect(VIDEO_AGENT_DESCRIPTION).toContain("youtube-nocookie");
    expect(VIDEO_AGENT_DESCRIPTION).toContain("link card");
  });
});
