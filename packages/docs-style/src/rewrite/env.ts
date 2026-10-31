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

/** The Token Gateway gateway's OpenAI-compatible base: the fleet's model endpoint (it replaced codex-lb). */
export const TOKEN_GATEWAY_DEFAULT_URL = "http://100.104.171.122:8793/v1";
/** Key files under the home directory, first existing wins: the MacBook's, then services-01's. */
const TOKEN_GATEWAY_KEY_FILES = [".config/token-gateway/mini-macbook-key", ".config/token-gateway/mini-key"];

/** The gateway's /v1 base: TOKEN_GATEWAY_BASE_URL when set (a bare origin gets /v1), else the default. */
export function tokenGatewayUrl(): string {
  const configured = codecaineEnv("TOKEN_GATEWAY_BASE_URL")?.trim().replace(/\/+$/, "");
  if (!configured) return TOKEN_GATEWAY_DEFAULT_URL;
  try {
    return new URL(configured).pathname === "/" ? `${configured}/v1` : configured;
  } catch {
    return configured;
  }
}

/** The gateway key: TOKEN_GATEWAY_API_KEY, else the first existing key file under the home directory, trimmed. */
export function tokenGatewayKey(): string | undefined {
  const fromEnv = codecaineEnv("TOKEN_GATEWAY_API_KEY")?.trim();
  if (fromEnv) return fromEnv;
  for (const file of TOKEN_GATEWAY_KEY_FILES) {
    try {
      const key = readFileSync(join(homedir(), file), "utf8").trim();
      if (key) return key;
    } catch {
      // Missing or unreadable: try the next file.
    }
  }
  return undefined;
}
