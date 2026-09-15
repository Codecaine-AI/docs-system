import { mkdtemp, mkdir, writeFile, truncate, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "bun:test";
import { readDocAsset } from "../assets";
import { MAX_ASSET_BYTES, MAX_VIDEO_ASSET_BYTES } from "../confine";

test("video reads accept the upload limit while attachments keep their smaller cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-media-read-"));
  try {
    await mkdir(join(root, "page/assets/videos"), { recursive: true });
    for (const [name, size, accepted] of [
      ["clip.mp4", MAX_ASSET_BYTES + 1, true],
      ["limit.webm", MAX_VIDEO_ASSET_BYTES, true],
      ["large.mov", MAX_VIDEO_ASSET_BYTES + 1, false],
      ["attachment.png", MAX_ASSET_BYTES + 1, false],
    ] as const) {
      const path = `page/assets/videos/${name}`;
      await writeFile(join(root, path), "");
      await truncate(join(root, path), size);
      const result = await readDocAsset(root, path);
      expect(result.ok).toBe(accepted);
      if (!result.ok) expect(result.status).toBe(413);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
