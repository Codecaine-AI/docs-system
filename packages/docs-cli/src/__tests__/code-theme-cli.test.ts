import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import darkPlusColorThemeData from "@codecaine-ai/docs-model/fixtures/cursor-dark-plus.colorThemeData.json";
import { DARK_PLUS_CODE_THEME } from "@codecaine-ai/docs-model/code-theme";

// `docs-cli code-theme` round trip against a temp code-themes root and a
// fake Cursor install under a temp HOME (no real editor state is touched).

const packageRoot = path.resolve(import.meta.dir, "../..");
let temp: string;
let env: Record<string, string>;

function cursorUserDir(home: string): string {
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Cursor", "User");
  if (process.platform === "win32") return path.join(home, "AppData", "Roaming", "Cursor", "User");
  return path.join(home, ".config", "Cursor", "User");
}

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], { cwd: packageRoot, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

beforeEach(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "docs-cli-code-theme-"));
  const home = path.join(temp, "home");
  const userDir = cursorUserDir(home);
  await mkdir(path.join(userDir, "globalStorage"), { recursive: true });
  const db = new Database(path.join(userDir, "globalStorage", "state.vscdb"));
  db.run("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
  db.query("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("colorThemeData", JSON.stringify(darkPlusColorThemeData));
  db.close();
  const { XDG_CONFIG_HOME: _xdg, APPDATA: _appdata, ...rest } = process.env;
  env = {
    ...(rest as Record<string, string>),
    HOME: home,
    CODECAINE_DOCS_CODE_THEMES: path.join(temp, "code-themes"),
  };
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe("docs cli code-theme", () => {
  test("import --from cursor writes the central file; list and show read it back", async () => {
    const imported = await runCli(["code-theme", "import", "--from", "cursor"]);
    expect(imported.exitCode).toBe(0);
    const filePath = path.join(temp, "code-themes", "cursor-dark-plus.json");
    expect(imported.stdout).toContain(`wrote:    ${filePath}`);
    expect(imported.stdout).toMatch(/control\s+#C586C0\s+keyword\.control/);
    const stored = JSON.parse(await readFile(filePath, "utf8"));
    expect(stored.roles).toEqual(DARK_PLUS_CODE_THEME.roles);

    const list = await runCli(["code-theme", "list"]);
    expect(list.exitCode).toBe(0);
    // `*` marks the active theme (dark-plus until one is chosen).
    expect(list.stdout.split("\n").slice(0, 3).map((line) => line.slice(0, 2) + line.slice(2).split(/\s+/)[0])).toEqual([
      "* dark-plus",
      "  light-plus",
      "  cursor-dark-plus",
    ]);

    const show = await runCli(["code-theme", "show", "cursor-dark-plus"]);
    expect(JSON.parse(show.stdout).source.settingsId).toBe("Default Dark+");

    const css = await runCli(["code-theme", "show", "cursor-dark-plus", "--css"]);
    expect(css.stdout).toContain("--syntax-keyword: #569CD6;");
    expect(css.stdout).toContain("--docs-code-block-bg: #1E1E1E;");
  });

  test("use sets the active theme; import --use activates the import", async () => {
    const activePath = path.join(temp, "code-themes", "active.json");
    const used = await runCli(["code-theme", "use", "light-plus"]);
    expect(used.exitCode).toBe(0);
    expect(used.stdout).toContain("Active code theme: light-plus");
    expect(JSON.parse(await readFile(activePath, "utf8"))).toEqual({ id: "light-plus" });

    expect((await runCli(["code-theme", "use", "missing"])).exitCode).toBe(1);
    expect(JSON.parse(await readFile(activePath, "utf8"))).toEqual({ id: "light-plus" });

    const imported = await runCli(["code-theme", "import", "--from", "cursor", "--use"]);
    expect(imported.exitCode).toBe(0);
    expect(JSON.parse(await readFile(activePath, "utf8"))).toEqual({ id: "cursor-dark-plus" });
    const list = await runCli(["code-theme", "list"]);
    expect(list.stdout).toMatch(/^\* cursor-dark-plus/m);
  });

  test("import with --id/--name; unknown show and reserved ids fail non-zero", async () => {
    const imported = await runCli(["code-theme", "import", "--id", "editor", "--name", "My Editor"]);
    expect(imported.exitCode).toBe(0);
    expect(imported.stdout).toContain('Imported "My Editor" (dark) as editor');

    expect((await runCli(["code-theme", "show", "missing"])).exitCode).toBe(1);
    const reserved = await runCli(["code-theme", "import", "--id", "light-plus"]);
    expect(reserved.exitCode).toBe(1);
    expect(reserved.stderr).toContain("reserved");
  });
});
