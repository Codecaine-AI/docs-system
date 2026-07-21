import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createDocsStore } from "../store";
import { createDocsRoutes } from "../routes";
import { themesRootFor } from "../themes";

/**
 * Theme-folder routes (docs/20-implementation/40-theming): the repo's
 * themes/ directory lives SIBLING to the docs root; ids are strict slugs;
 * content is opaque JSON (the workbench loader owns shape validation).
 */

describe("theme folder routes", () => {
  let repoRoot: string;
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "docs-server-themes-"));
    docsRoot = join(repoRoot, "docs");
    await mkdir(docsRoot, { recursive: true });
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("GET /api/themes returns an empty catalogue when themes/ does not exist", async () => {
    const response = await app.handle(new Request("http://localhost/api/themes"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ themes: [] });
  });

  test("POST creates a theme folder that then lists and reads back", async () => {
    const payload = {
      id: "my-theme",
      manifest: { name: "My Theme", base: "default", dark: true },
      components: { "inline-code": { fg: { light: "#aa0000", dark: "#ff8888" }, bg: "#eeeeee" } },
    };
    const created = await app.handle(
      new Request("http://localhost/api/themes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { theme: typeof payload };
    expect(createdBody.theme.manifest).toEqual(payload.manifest);
    expect(createdBody.theme.components).toEqual(payload.components);

    // The folder shape on disk: theme.json + components/<file>.json.
    const manifestOnDisk = JSON.parse(
      await readFile(join(themesRootFor(docsRoot), "my-theme", "theme.json"), "utf8"),
    );
    expect(manifestOnDisk).toEqual(payload.manifest);
    const tokensOnDisk = JSON.parse(
      await readFile(
        join(themesRootFor(docsRoot), "my-theme", "components", "inline-code.json"),
        "utf8",
      ),
    );
    expect(tokensOnDisk).toEqual(payload.components["inline-code"]);

    const list = await app.handle(new Request("http://localhost/api/themes"));
    expect(await list.json()).toEqual({ themes: [{ id: "my-theme", name: "My Theme" }] });

    const read = await app.handle(new Request("http://localhost/api/themes/my-theme"));
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { theme: typeof payload };
    expect(readBody.theme).toEqual(payload);
  });

  test("hand-authored theme folders are readable without a POST", async () => {
    const dir = join(themesRootFor(docsRoot), "hand-made", "components");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "..", "theme.json"), JSON.stringify({ name: "Hand Made" }));
    await writeFile(join(dir, "callout.json"), JSON.stringify({ fill: "#123456" }));

    const read = await app.handle(new Request("http://localhost/api/themes/hand-made"));
    const body = (await read.json()) as {
      theme: { manifest: Record<string, unknown>; components: Record<string, unknown> };
    };
    expect(body.theme.manifest).toEqual({ name: "Hand Made" });
    expect(body.theme.components).toEqual({ callout: { fill: "#123456" } });
  });

  test("invalid theme ids are rejected on write and unroutable on read", async () => {
    const bad = await app.handle(
      new Request("http://localhost/api/themes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "../escape", manifest: { name: "Nope" } }),
      }),
    );
    expect(bad.status).toBe(400);

    const traversal = await app.handle(
      new Request("http://localhost/api/themes/..%2Fescape"),
    );
    expect([400, 404]).toContain(traversal.status);
  });

  test("GET of an unknown theme is a 404", async () => {
    const missing = await app.handle(new Request("http://localhost/api/themes/nope"));
    expect(missing.status).toBe(404);
  });

  test("POST is refused with 403 on a theme-locked serve, before any write", async () => {
    const locked = createDocsRoutes(createDocsStore(docsRoot), { themeLocked: true });
    const refused = await locked.handle(
      new Request("http://localhost/api/themes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "my-theme", manifest: { name: "My Theme" } }),
      }),
    );
    expect(refused.status).toBe(403);
    const body = (await refused.json()) as { detail: string };
    expect(body.detail).toContain("locked");
    // The refusal precedes validation AND the write: a valid payload leaves
    // no theme folder behind, and theme reads stay open (locked viewers
    // still inherit the repo theme).
    expect(existsSync(join(themesRootFor(docsRoot), "my-theme"))).toBe(false);
    const list = await locked.handle(new Request("http://localhost/api/themes"));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ themes: [] });
  });
});
