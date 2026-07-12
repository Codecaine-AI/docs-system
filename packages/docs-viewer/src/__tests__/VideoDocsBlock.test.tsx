import { describe, expect, it } from "bun:test";
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

describe("VideoBlock — url embeds (provider iframes)", () => {
  it("renders a youtube-nocookie iframe for a youtube.com/watch url", () => {
    const html = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Docs walkthrough",
    });
    expect(html).toContain("<iframe");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="Docs walkthrough"');
    expect(html.toLowerCase()).toContain("allowfullscreen");
    // "origin" keeps the bare Referer header YouTube requires (a no-referrer
    // embed gets Error 153) while still hiding the doc's path/query.
    expect(html.toLowerCase()).toContain('referrerpolicy="origin"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('data-video-provider="youtube"');
    // 16:9 media surface.
    expect(html).toContain("aspect-video");
  });

  it("renders the same nocookie embed for youtu.be and shorts forms", () => {
    for (const url of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const html = renderVideo({ url });
      expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    }
  });

  it("renders vimeo and loom embeds through their player hosts", () => {
    expect(renderVideo({ url: "https://vimeo.com/76979871" })).toContain(
      'src="https://player.vimeo.com/video/76979871"',
    );
    expect(
      renderVideo({ url: "https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184" }),
    ).toContain('src="https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184"');
  });

  it("url wins over src when both are set", () => {
    const html = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      src: "./assets/videos/demo.mp4",
    });
    expect(html).toContain("<iframe");
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

  it("falls back to a generic card title when title is absent", () => {
    expect(renderVideo({ url: "https://example.com/demo" })).toContain("External video");
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

describe("VideoBlock — chrome", () => {
  it("renders the dashed placeholder when neither src nor url is present", () => {
    const html = renderVideo();
    expect(html).toContain("Video block is missing a src or url.");
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<video");
  });

  it("renders a muted figcaption line when caption is present", () => {
    const html = renderVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      caption: "An external video.",
    });
    expect(html).toContain("<figcaption");
    expect(html).toContain("An external video.");
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
