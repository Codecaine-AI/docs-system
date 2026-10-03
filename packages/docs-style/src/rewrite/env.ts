/**
 * The shared Codecaine env file (~/.config/codecaine/env): KEY=value lines every Codecaine service
 * reads, because background services do not inherit the user's shell. Same format and precedence
 * as docs-mcp/src/codecaine-env.ts, which this package cannot import.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** One variable. The process env wins. The file is read at call time, so a new key needs no restart. */
export function codecaineEnv(name: string): string | undefined {
  return process.env[name] || readEnvFile()[name];
}

function readEnvFile(): Record<string, string> {
  const path = process.env.CODECAINE_ENV_FILE || join(homedir(), ".config", "codecaine", "env");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    if (value) values[match[1]!] = value;
  }
  return values;
}
