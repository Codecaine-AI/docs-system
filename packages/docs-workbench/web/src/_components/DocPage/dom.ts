export function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

export function newLabAnnotationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `docs-lab-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

