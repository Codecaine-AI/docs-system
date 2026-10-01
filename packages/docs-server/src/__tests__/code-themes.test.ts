import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import darkPlusColorThemeData from "@codecaine-ai/docs-model/fixtures/cursor-dark-plus.colorThemeData.json";
import { DARK_PLUS_CODE_THEME, LIGHT_PLUS_CODE_THEME } from "@codecaine-ai/docs-model/code-theme";

import { importCodeTheme, listCodeThemes, readCodeTheme } from "../code-themes";
import {
  editorStateDbPath,
  editorUserDir,
  loadThemeFile,
  parseJsonc,
  readActiveEditorTheme,
  type EditorEnvironment,
} from "../editor-themes";
import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

/**
 * Code themes (code-themes.ts / editor-themes.ts): the central code style
 * stored as `<codeThemesRoot>/<id>.json`, imported from the active VS Code /
 * Cursor theme (state.vscdb colorThemeData) or a theme file.
 */

const LIGHT_PLUS_FILE = join(import.meta.dir, "../__fixtures__/code-theme/light_plus.json");

async function writeFakeEditor(
  environment: EditorEnvironment,
  editor: "cursor" | "vscode",
  data: unknown,
  settings?: string,
): Promise<void> {
  const dbPath = editorStateDbPath(editor, environment);
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.run("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
  db.query("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("colorThemeData", JSON.stringify(data));
  db.close();
  if (settings !== undefined) await writeFile(join(editorUserDir(editor, environment), "settings.json"), settings);
}

let temp: string;
let environment: EditorEnvironment;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-code-themes-"));
  environment = { platform: "darwin", home: join(temp, "home"), env: {} };
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe("editor discovery", () => {
  test("user dirs follow each platform's convention", () => {
    expect(editorUserDir("cursor", { platform: "darwin", home: "/h", env: {} })).toBe(
      "/h/Library/Application Support/Cursor/User",
    );
    expect(editorUserDir("vscode", { platform: "linux", home: "/h", env: {} })).toBe("/h/.config/Code/User");
    expect(editorUserDir("cursor", { platform: "linux", home: "/h", env: { XDG_CONFIG_HOME: "/x" } })).toBe(
      "/x/Cursor/User",
    );
    expect(editorUserDir("cursor", { platform: "win32", home: "/h", env: { APPDATA: "/appdata" } })).toBe(
      join("/appdata", "Cursor", "User"),
    );
  });

  test("auto prefers Cursor, and a settings.json mismatch is reported", async () => {
    await writeFakeEditor(environment, "vscode", { ...darkPlusColorThemeData, label: "VS Code copy" });
    await writeFakeEditor(
      environment,
      "cursor",
      darkPlusColorThemeData,
      '{\n  // picked theme\n  "workbench.colorTheme": "Default Light+",\n}\n',
    );
    const snapshot = await readActiveEditorTheme("auto", environment);
    expect(snapshot.editor).toBe("cursor");
    expect(snapshot.data.label).toBe("Dark+");
    expect(snapshot.settingsTheme).toBe("Default Light+");
    expect(snapshot.warnings).toHaveLength(1);
  });

  test("a missing editor is a clear error", async () => {
    await expect(readActiveEditorTheme("auto", environment)).rejects.toThrow(/No VS Code or Cursor state found/);
    await expect(readActiveEditorTheme("vscode", environment)).rejects.toThrow(/VS Code state DB not found/);
  });
});

describe("theme files", () => {
  test("parseJsonc accepts comments and trailing commas but leaves strings alone", () => {
    expect(parseJsonc('{ /* c */ "a": "// not a comment", "b": [1, 2,], // x\n }')).toEqual({
      a: "// not a comment",
      b: [1, 2],
    });
  });

  test("an include chain resolves (VS Code's own Light+ -> light_vs) to the built-in Light+", async () => {
    const data = await loadThemeFile(LIGHT_PLUS_FILE);
    expect(data.colors?.["editor.background"]).toBe("#FFFFFF");
    const result = await importCodeTheme({ root: join(temp, "code-themes"), from: { path: LIGHT_PLUS_FILE } });
    // "light-plus" is a built-in id, so the file import gets a suffix.
    expect(result.theme.id).toBe("light-plus-imported");
    expect(result.theme.type).toBe("light");
    expect(result.theme.roles).toEqual(LIGHT_PLUS_CODE_THEME.roles);
    expect(result.theme.colors).toEqual(LIGHT_PLUS_CODE_THEME.colors);
  });

  test("a JSONC theme with an include, inline overrides, and a JSON tokenColors file", async () => {
    const dir = join(temp, "theme");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "base.json"),
      JSON.stringify({ type: "dark", colors: { "editor.background": "#101010" }, tokenColors: [{ scope: "string", settings: { foreground: "#AA0000" } }] }),
    );
    await writeFile(join(dir, "tokens.json"), JSON.stringify([{ scope: "comment", settings: { foreground: "#00AA00", fontStyle: "italic" } }]));
    await writeFile(
      join(dir, "mine.json"),
      `{
        // my theme
        "name": "Mine",
        "include": "./base.json",
        "colors": { "editor.foreground": "#EEEEEE", },
        "tokenColors": "./tokens.json",
      }`,
    );
    const result = await importCodeTheme({ root: join(temp, "code-themes"), from: { path: join(dir, "mine.json") } });
    expect(result.theme).toMatchObject({
      id: "mine",
      name: "Mine",
      type: "dark",
      colors: { background: "#101010", foreground: "#EEEEEE" },
      roles: { string: "#AA0000", comment: "#00AA00", punctuation: "#EEEEEE" },
      fontStyle: { comment: "italic" },
    });
  });
});

describe("code theme store", () => {
  test("importing the active editor theme writes <root>/<id>.json, then lists and reads back", async () => {
    await writeFakeEditor(environment, "cursor", darkPlusColorThemeData);
    const root = join(temp, "code-themes");
    const result = await importCodeTheme({
      root,
      from: "cursor",
      environment,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.path).toBe(join(root, "cursor-dark-plus.json"));
    const stored = JSON.parse(await readFile(result.path, "utf8"));
    expect(stored.roles).toEqual(DARK_PLUS_CODE_THEME.roles);
    expect(stored.source.importedAt).toBe("2026-01-01T00:00:00.000Z");

    expect((await listCodeThemes(root)).map((entry) => entry.id)).toEqual(["dark-plus", "light-plus", "cursor-dark-plus"]);
    expect((await readCodeTheme(root, "cursor-dark-plus"))?.source.editor).toBe("cursor");
  });

  test("built-in ids are reserved and invalid ids rejected", async () => {
    await writeFakeEditor(environment, "cursor", darkPlusColorThemeData);
    const root = join(temp, "code-themes");
    await expect(importCodeTheme({ root, from: "cursor", id: "dark-plus", environment })).rejects.toThrow(/reserved/);
    await expect(importCodeTheme({ root, from: "cursor", id: "active", environment })).rejects.toThrow(/reserved/);
    await expect(importCodeTheme({ root, from: "cursor", id: "../escape", environment })).rejects.toThrow(/slug/);
    expect(existsSync(root)).toBe(false);
  });

  test("a hand-edited file with gaps reads back complete", async () => {
    const root = join(temp, "code-themes");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "hand.json"), JSON.stringify({ name: "Hand", type: "dark", roles: { string: "#ff0000" } }));
    const theme = await readCodeTheme(root, "hand");
    expect(theme?.roles.string).toBe("#FF0000");
    expect(theme?.roles.keyword).toBe(DARK_PLUS_CODE_THEME.roles.keyword);
  });
});

describe("code theme routes", () => {
  let docsRoot: string;
  let codeThemesRoot: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    docsRoot = join(temp, "repo", "docs");
    codeThemesRoot = join(temp, "state", "code-themes");
    await mkdir(docsRoot, { recursive: true });
    // The import route reads the real environment: point HOME at a fake editor.
    for (const key of ["HOME", "XDG_CONFIG_HOME", "APPDATA"]) savedEnv[key] = process.env[key];
    process.env.HOME = join(temp, "home");
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const post = (body: unknown) =>
    new Request("http://localhost/api/code-themes/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("GET lists built-ins; GET :id reads one or 404s; code themes never list as page themes", async () => {
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    const list = await (await app.handle(new Request("http://localhost/api/code-themes"))).json();
    expect(list.codeThemes.map((entry: { id: string }) => entry.id)).toEqual(["dark-plus", "light-plus"]);
    const one = await app.handle(new Request("http://localhost/api/code-themes/dark-plus"));
    expect((await one.json()).codeTheme.roles).toEqual(DARK_PLUS_CODE_THEME.roles);
    expect((await app.handle(new Request("http://localhost/api/code-themes/nope"))).status).toBe(404);
    expect(await (await app.handle(new Request("http://localhost/api/themes"))).json()).toEqual({ themes: [] });
  });

  test("POST import reads the active editor theme and the result lists", async () => {
    await writeFakeEditor({}, "cursor", darkPlusColorThemeData);
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    const response = await app.handle(post({ from: "cursor", name: "My Dark" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.codeTheme).toMatchObject({ id: "cursor-dark-plus", name: "My Dark", roles: DARK_PLUS_CODE_THEME.roles });
    expect(existsSync(join(codeThemesRoot, "cursor-dark-plus.json"))).toBe(true);
    const list = await (await app.handle(new Request("http://localhost/api/code-themes"))).json();
    expect(list.codeThemes.at(-1)).toMatchObject({ id: "cursor-dark-plus", name: "My Dark", type: "dark" });
  });

  const put = (body: unknown) =>
    new Request("http://localhost/api/code-themes/active", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("GET active defaults to dark-plus; PUT switches it and survives a new host", async () => {
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    const initial = await (await app.handle(new Request("http://localhost/api/code-themes/active"))).json();
    expect(initial.id).toBe("dark-plus");
    expect(initial.codeTheme.roles).toEqual(DARK_PLUS_CODE_THEME.roles);

    const switched = await app.handle(put({ id: "light-plus" }));
    expect(switched.status).toBe(200);
    expect((await switched.json()).codeTheme.type).toBe("light");
    expect(JSON.parse(await readFile(join(codeThemesRoot, "active.json"), "utf8"))).toEqual({ id: "light-plus" });

    const fresh = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    expect((await (await fresh.handle(new Request("http://localhost/api/code-themes/active"))).json()).id).toBe("light-plus");
    // The pointer file is not a code theme.
    const list = await (await fresh.handle(new Request("http://localhost/api/code-themes"))).json();
    expect(list.codeThemes.map((entry: { id: string }) => entry.id)).toEqual(["dark-plus", "light-plus"]);
  });

  test("PUT active validates the id, obeys themeLocked, and needs a root", async () => {
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    expect((await app.handle(put({ id: "missing" }))).status).toBe(400);
    expect((await app.handle(put({}))).status).toBe(400);
    const locked = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot, themeLocked: true });
    expect((await locked.handle(put({ id: "light-plus" }))).status).toBe(403);
    const rootless = createDocsRoutes(createDocsStore(docsRoot));
    expect((await rootless.handle(put({ id: "light-plus" }))).status).toBe(409);
    expect((await (await rootless.handle(new Request("http://localhost/api/code-themes/active"))).json()).id).toBe("dark-plus");
    expect(existsSync(join(codeThemesRoot, "active.json"))).toBe(false);
  });

  test("an active pointer to a deleted theme falls back to dark-plus", async () => {
    await mkdir(codeThemesRoot, { recursive: true });
    await writeFile(join(codeThemesRoot, "active.json"), JSON.stringify({ id: "gone" }));
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    expect((await (await app.handle(new Request("http://localhost/api/code-themes/active"))).json()).id).toBe("dark-plus");
  });

  test("POST import refuses file paths, locked hosts, and hosts without a root", async () => {
    const app = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot });
    expect((await app.handle(post({ from: LIGHT_PLUS_FILE }))).status).toBe(400);
    expect((await app.handle(post({ from: "cursor" }))).status).toBe(400); // no editor installed

    const locked = createDocsRoutes(createDocsStore(docsRoot), { codeThemesRoot, themeLocked: true });
    expect((await locked.handle(post({ from: "cursor" }))).status).toBe(403);

    const rootless = createDocsRoutes(createDocsStore(docsRoot));
    expect((await rootless.handle(post({ from: "cursor" }))).status).toBe(409);
    expect(existsSync(codeThemesRoot)).toBe(false);
  });
});
