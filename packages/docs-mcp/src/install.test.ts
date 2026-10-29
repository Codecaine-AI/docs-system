import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexConfig, doctorClients, installClients, restoreInstallation } from "./install";

const dirs: string[] = [];
async function fixture() {
  const homeDir = await mkdtemp(join(tmpdir(), "docs-install-test-"));
  dirs.push(homeDir);
  return { homeDir, packageRoot: "/checkout with spaces/docs-mcp", bunPath: "/bin/bun", skillFiles: { "SKILL.md": "---\nname: docs-system\ndescription: Read and edit docs.\n---\nUse the tools.\n", "references/standards.md": "Standards\n" } };
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("client installation", () => {
  test("preview creates no user files and includes all three clients", async () => {
    const options = await fixture();
    const result = await installClients(options);
    expect(result.mode).toBe("preview");
    expect(result.clients).toEqual(["codex", "claude", "pi"]);
    expect(result.changes.every((change) => change.action === "create" && !change.written)).toBe(true);
    expect(await readdir(options.homeDir)).toEqual([]);
    expect(result.command.args).toEqual(["/checkout with spaces/docs-mcp/src/cli.ts", "mcp"]);
  });
  test("preserves user settings, creates backups, and reinstalls without changes", async () => {
    const options = await fixture();
    await mkdir(join(options.homeDir, ".codex"));
    const originalToml = '# keep my comment\nmodel = "my-model"\n[mcp_servers.other]\ncommand = "other"\n';
    const originalClaude = JSON.stringify({ theme: "dark", mcpServers: { other: { type: "stdio", command: "other" } }, projects: { "/work": { trusted: true } } });
    await writeFile(join(options.homeDir, ".codex/config.toml"), originalToml);
    await writeFile(join(options.homeDir, ".claude.json"), originalClaude);
    const result = await installClients({ ...options, write: true });
    const codex = await readFile(join(options.homeDir, ".codex/config.toml"), "utf8");
    expect(codex.startsWith(originalToml)).toBe(true);
    expect((Bun.TOML.parse(codex) as Record<string, unknown>).mcp_servers).toMatchObject({ other: { command: "other" }, "docs-system": { command: "/bin/bun" } });
    const claude = JSON.parse(await readFile(join(options.homeDir, ".claude.json"), "utf8"));
    expect(claude).toMatchObject({ theme: "dark", mcpServers: { other: { command: "other" }, "docs-system": { type: "stdio", command: "/bin/bun" } } });
    expect(claude.mcpServers["docs-system"].args).not.toContain("--workspace");
    for (const change of result.changes.filter((entry) => entry.backup)) {
      expect(await readFile(change.backup!, "utf8")).toBe(change.path.endsWith("toml") ? originalToml : originalClaude);
    }
    const repeat = await installClients({ ...options, write: true });
    expect(repeat.changes.every((change) => change.action === "unchanged" && !change.written)).toBe(true);
    expect((await doctorClients(options)).ok).toBe(true);
    const pi = await readFile(join(options.homeDir, ".pi/agent/extensions/docs-system.ts"), "utf8");
    expect(pi).toContain("createPiExtension");
  });
  test("invalid existing config aborts before any install writes", async () => {
    const options = await fixture();
    await writeFile(join(options.homeDir, ".claude.json"), "broken JSON");
    await expect(installClients({ ...options, write: true })).rejects.toThrow();
    expect(await readdir(options.homeDir)).toEqual([".claude.json"]);
  });
  test("individual clients install only their bindings; doctor reports skill drift", async () => {
    const options = await fixture();
    await installClients({ ...options, clients: ["pi"], write: true });
    expect((await readdir(options.homeDir)).sort()).toEqual([".agents", ".pi"]);
    const result = await doctorClients({ ...options, clients: ["pi"], skillFiles: { ...options.skillFiles, "references/standards.md": "New standards\n" } });
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => check.status === "outdated")).toHaveLength(1);
  });
  test("does not overwrite unmanaged or customized Codex server entries", () => {
    expect(() => codexConfig('[mcp_servers.docs-system]\ncommand = "custom"\n', "bun", [])).toThrow("unmanaged");
    const managed = codexConfig("", "bun", []).replace("tool_timeout_sec = 120", 'tool_timeout_sec = 120\nenabled = false');
    expect(() => codexConfig(managed, "bun", [])).toThrow("custom fields");
  });
  test("removes what an earlier install created under the legacy name, and restore brings it back", async () => {
    const options = await fixture();
    const home = options.homeDir;
    const legacyToml = '[mcp_servers.other]\ncommand = "other"\n\n# BEGIN CODECAINE DOCS MCP (managed by docs-mcp install)\n[mcp_servers.codecaine-docs]\ncommand = "/bin/bun"\nargs = ["/old checkout/docs-mcp/src/cli.ts", "mcp"]\n# END CODECAINE DOCS MCP\n';
    const legacyPi = "// Managed by Codecaine Docs. Re-run install to update this checkout path.\nexport default {};\n";
    const legacySkill = "---\nname: codecaine-docs\ndescription: Old.\n---\n";
    await mkdir(join(home, ".codex"));
    await writeFile(join(home, ".codex/config.toml"), legacyToml);
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { other: { command: "other" }, "codecaine-docs": { type: "stdio", command: "/bin/bun", args: ["/old checkout/docs-mcp/src/cli.ts", "mcp"] } } }));
    await mkdir(join(home, ".pi/agent/extensions"), { recursive: true });
    await writeFile(join(home, ".pi/agent/extensions/codecaine-docs.ts"), legacyPi);
    for (const dir of [".agents/skills/codecaine-docs", ".claude/skills/codecaine-docs"]) {
      await mkdir(join(home, dir, "references"), { recursive: true });
      await writeFile(join(home, dir, "SKILL.md"), legacySkill);
      await writeFile(join(home, dir, "references/standards.md"), "Old standards\n");
    }
    const report = await installClients({ ...options, write: true });
    const codex = await readFile(join(home, ".codex/config.toml"), "utf8");
    expect(codex).not.toContain("CODECAINE DOCS");
    expect(Object.keys((Bun.TOML.parse(codex) as { mcp_servers: object }).mcp_servers)).toEqual(["other", "docs-system"]);
    expect(Object.keys(JSON.parse(await readFile(join(home, ".claude.json"), "utf8")).mcpServers)).toEqual(["other", "docs-system"]);
    // Backups of removed files stay beside them, as for every other change.
    expect(await readdir(join(home, ".pi/agent/extensions"))).not.toContain("codecaine-docs.ts");
    for (const dir of [".agents/skills/codecaine-docs", ".claude/skills/codecaine-docs"]) {
      expect(await readdir(join(home, dir))).not.toContain("SKILL.md");
      expect(await readdir(join(home, dir, "references"))).not.toContain("standards.md");
    }
    expect((await doctorClients(options)).ok).toBe(true);
    await restoreInstallation(report, { write: true });
    expect(await readFile(join(home, ".codex/config.toml"), "utf8")).toBe(legacyToml);
    expect(await readFile(join(home, ".pi/agent/extensions/codecaine-docs.ts"), "utf8")).toBe(legacyPi);
    expect(await readFile(join(home, ".claude/skills/codecaine-docs/SKILL.md"), "utf8")).toBe(legacySkill);
  });
  test("leaves unmanaged entries under the legacy name in place", async () => {
    const options = await fixture();
    const home = options.homeDir;
    const userToml = '[mcp_servers.codecaine-docs]\ncommand = "custom"\n';
    const userClaude = { command: "custom", args: ["serve"] };
    await mkdir(join(home, ".codex"));
    await writeFile(join(home, ".codex/config.toml"), userToml);
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "codecaine-docs": userClaude } }));
    await mkdir(join(home, ".pi/agent/extensions"), { recursive: true });
    await writeFile(join(home, ".pi/agent/extensions/codecaine-docs.ts"), "export default {};\n");
    await mkdir(join(home, ".claude/skills/codecaine-docs"), { recursive: true });
    await writeFile(join(home, ".claude/skills/codecaine-docs/SKILL.md"), "---\nname: my-docs\n---\n");
    await installClients({ ...options, write: true });
    expect(await readFile(join(home, ".codex/config.toml"), "utf8")).toStartWith(userToml);
    expect(JSON.parse(await readFile(join(home, ".claude.json"), "utf8")).mcpServers["codecaine-docs"]).toEqual(userClaude);
    expect((await readdir(join(home, ".pi/agent/extensions"))).sort()).toEqual(["codecaine-docs.ts", "docs-system.ts"]);
    expect(await readdir(join(home, ".claude/skills/codecaine-docs"))).toEqual(["SKILL.md"]);
  });
  test("rejects skill path traversal before installation", async () => {
    const options = await fixture();
    await expect(installClients({ ...options, write: true, skillFiles: { "../../escape": "bad" } })).rejects.toThrow("Invalid skill file path");
    expect(await readdir(options.homeDir)).toEqual([]);
  });
  test("restore previews, restores exact old configuration, and refuses later edits", async () => {
    const options = await fixture();
    const original = '{"theme":"dark"}\n';
    await writeFile(join(options.homeDir, ".claude.json"), original);
    const report = await installClients({ ...options, clients: ["claude"], write: true });
    const preview = await restoreInstallation(report);
    expect(preview.changes.every((item) => !item.written)).toBe(true);
    await writeFile(join(options.homeDir, ".claude.json"), "changed by user");
    await expect(restoreInstallation(report, { write: true })).rejects.toThrow("installed file changed");
    const current = report.changes.find((item) => item.path.endsWith(".claude.json"))!;
    const generated = JSON.stringify({ theme: "dark", mcpServers: { "docs-system": { type: "stdio", command: "/bin/bun", args: ["/checkout with spaces/docs-mcp/src/cli.ts", "mcp"] } } }, null, 2) + "\n";
    await writeFile(current.path, generated);
    await restoreInstallation(report, { write: true });
    expect(await readFile(current.path, "utf8")).toBe(original);
    expect(await readdir(join(options.homeDir, ".claude/skills/docs-system"))).not.toContain("SKILL.md");
  });
});
