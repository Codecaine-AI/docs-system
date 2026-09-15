# Client Installation QA

Verified 2026-09-08 using the installed clients, generated bindings, and the real local MCP server. No user configuration was changed. No model requests were made.

Client versions: Codex CLI 0.153.4, Claude Code 2.1.263, pi 0.84.0. Runtime versions: Bun 1.3.10 and Node 23.8.0.

## Results

| Check | Result |
| --- | --- |
| Generated installation in a temporary home | Passed. 29 binding and skill files written; generated standards and all nine component references included. |
| `doctorClients` against that installation | Passed. All 29 files matched current sources. |
| Codex `mcp get codecaine-docs --json` with temporary `CODEX_HOME` | Passed. Parsed stdio command, arguments, and timeouts. No fixed workspace configured. This validates configuration, not a model-driven Codex task. |
| Claude Code `mcp get codecaine-docs` with temporary `HOME` | Passed. User scope and `Status: Connected` reported after a real MCP handshake. |
| pi installed extension loader under Node | Passed. Loaded the generated extension from its installed location, ran `session_start`, registered all 45 server tools, and called `docs_discover` through the MCP SDK. |
| pi argument validation | Passed. The installed pi-ai validator accepts plain MCP JSON Schema, validates a required project field, and rejects a missing required field. No TypeBox symbol conversion is needed for this installed version. |
| pi discovery result | Found Docs System and embedded Canvas documentation. Sequence was reported as lacking a normalized corpus. |
| pi shutdown | Passed. The extension closed its MCP child and the isolated shared daemon stopped through the CLI. |
| Installer and pi unit tests | Passed. Nine tests, 36 assertions. Covers preview, settings preservation, backups, idempotence, malformed configuration, client selection, drift, path traversal, restore, schema forwarding, lifecycle, and error propagation. |

Temporary evidence was retained at `/var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/codecaine-clients-qa-A3oJ11/qa-result.json`. It contains generated paths, CLI output, and the pi tool list. Temporary paths are disposable and not required for normal setup.

## Client Bindings

- Codex reads `~/.codex/config.toml`, or the directory selected by `CODEX_HOME`. The installer adds a delimited managed table and preserves unrelated TOML and comments. It refuses to replace an unmanaged server of the same name or silently discard custom settings in its managed block.
- Claude Code reads the top-level `mcpServers` object in `~/.claude.json`. Existing unrelated settings and servers are preserved. Personal skills are copied to `~/.claude/skills/codecaine-docs`.
- pi has no built-in MCP client. A generated `~/.pi/agent/extensions/codecaine-docs.ts` imports the bridge from this checkout. The bridge connects on session start, registers schemas returned by MCP, forwards tool calls, injects server instructions, and closes on shutdown. Codex and pi share the copied skill at `~/.agents/skills/codecaine-docs`.
- Every changed existing file receives a private backup. `restoreInstallation(savedWriteReport)` previews restoration; `{write:true}` restores only when installed files and backup hashes still match. It refuses to overwrite changes made after installation. Backup files and empty directories remain.

Exact restoration is deliberately conservative. Claude Code updates its global state file during health checks, so restoration can refuse that file even without a manual edit. The temporary smoke run demonstrated this refusal. Use Claude's `claude mcp remove codecaine-docs -s user` for removal after such a change; do not copy an old whole-file backup over current client state. A future selective uninstall can preserve unrelated post-install changes.

## Workspace and Compatibility Limits

The user-level command has no fixed project. The server uses `CLAUDE_PROJECT_DIR` when supplied, otherwise process cwd. MCP roots can update the active workspace. pi passes its session `ctx.cwd` explicitly. `docs_discover` accepts an explicit workspace for clients whose launch directory is ambiguous. Real Codex GUI workspace propagation still needs the user's first acceptance station.

Skills use host model selection. Installation and MCP initialization do not prove that a model follows guidance automatically. Run the natural-language editing acceptance exercise in each client. The server requires an authoring task for writes so editing tools cannot bypass task guidance initialization.

Generated entry points point to the development checkout and Bun executable. Moving either requires reinstalling. Restart Codex and Claude Code after installation; pi supports `/reload`. For custom `CLAUDE_CONFIG_DIR`, the installer requires explicit `claudeDir` and `claudeConfigFile` API options instead of guessing Claude's state path. `PI_CODING_AGENT_DIR` is supported for the extension location. Skill sources refresh on reinstall; live MCP task guidance comes from current sources.

## Source Evidence

- [Official Codex MCP documentation](https://developers.openai.com/codex/mcp): stdio configuration, shared client config, timeouts, and server instructions.
- [Official Codex skills documentation](https://developers.openai.com/codex/skills): user skills at `~/.agents/skills`, progressive loading, automatic matching, and restart behavior.
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp): user scope in `~/.claude.json`, stdio server definitions, `CLAUDE_PROJECT_DIR`, and MCP roots.
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills): personal skills at `~/.claude/skills`.
- Installed pi `@earendil-works/pi-coding-agent` 0.84.0: `README.md` explicitly says no MCP; `docs/extensions.md` documents global discovery, delayed resource startup, dynamic tool registration and shutdown; `docs/skills.md` documents `~/.agents/skills`. Package root: `/Users/Ford/.nvm/versions/node/v23.8.0/lib/node_modules/@earendil-works/pi-coding-agent`.
