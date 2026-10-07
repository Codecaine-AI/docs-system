export function resolveCssColor(expr: string): string {
  if (typeof document === "undefined") return "#ffffff";
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.color = expr;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const toHex = (channels: readonly number[]) =>
    `#${channels
      .slice(0, 3)
      .map((value) => Math.round(value).toString(16).padStart(2, "0"))
      .join("")}`;
  if (/^rgba?\(/.test(computed)) {
    const parts = computed.match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return "#ffffff";
    return toHex(parts.map(Number));
  }
  // color-mix() and oklch() defaults compute to `color(srgb …)` / `oklch(…)`,
  // whose numbers are not 0–255 channels. Let a 1px canvas convert them.
  const context = document.createElement("canvas").getContext?.("2d");
  if (!context || !computed) return "#ffffff";
  context.fillStyle = computed;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] === 0 ? "#ffffff" : toHex([pixel[0]!, pixel[1]!, pixel[2]!]);
}

