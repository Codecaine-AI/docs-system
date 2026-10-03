/**
 * Small HTML and number helpers for the report. Every string that comes from a sweep (paths,
 * titles, block text, rule IDs, model names, guardrail details) goes through esc() or prose()
 * before it reaches the markup.
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML content and attribute values. Control characters become U+FFFD. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "�");
}

/** JSON that is safe inside a <script> element: no "<", ">", "&", or line separators survive raw. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const PLACEHOLDER = '<span class="ph" title="code or reference span">code</span>';

/**
 * Inline markdown or proseText as readable HTML. Escapes everything, shows each "\u0000"
 * (a code or reference span in proseText form) as a placeholder, and styles `code` spans.
 * Other markdown (bold, links) stays as written, so a diff shows exactly what changed.
 */
export function prose(text: string): string {
  return text
    .split("\u0000")
    .map((part) => esc(part).replace(/`([^`\n]*)`/g, '<code class="cs">$1</code>'))
    .join(PLACEHOLDER);
}

/** 12345 → "12,345". Non-finite numbers render as an en dash. */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const sign = n < 0 ? "−" : "";
  return sign + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A ratio as an unsigned percent number: 0.031 → "3.1", 0.714 → "71", 0.03 → "3". */
export function pct(ratio: number): string {
  const value = Math.abs(ratio) * 100;
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

/** A relative change as a signed percent: -0.031 → "−3.1%". Undefined renders as an en dash. */
export function signedPct(ratio: number | undefined): string {
  if (ratio === undefined || !Number.isFinite(ratio)) return "–";
  const text = pct(ratio);
  if (text === "0") return "0%";
  return `${ratio < 0 ? "−" : "+"}${text}%`;
}

/** (after − before) / before, or undefined when before is 0. */
export function relativeChange(before: number, after: number): number | undefined {
  return before > 0 ? (after - before) / before : undefined;
}

/** 640 → "640 ms", 4200 → "4.2 s". */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${Math.round(ms / 100) / 10} s`;
}

/** A run length: "48 s", "4 min 35 s", "1 h 3 min". */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "2026-10-02T14:05:12.000Z" → "2026-10-02 14:05:12 UTC". Other strings pass through. */
export function fmtStamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}

/** plural(1, "page") → "1 page", plural(3, "page") → "3 pages". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${fmtInt(n)} ${n === 1 ? word : many}`;
}
