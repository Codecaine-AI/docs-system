import { describe, expect, it } from "bun:test";
import { grainMaskDeclarations, intersectRect } from "../_lib/grain-code-mask";

describe("grain code-pane mask", () => {
  it("drops the mask when no code pane is visible", () => {
    expect(grainMaskDeclarations([])).toBeNull();
    expect(grainMaskDeclarations([{ x: 0, y: 0, width: 0, height: 40 }])).toBeNull();
  });

  it("subtracts the union of the pane rects from a full layer", () => {
    const mask = grainMaskDeclarations([
      { x: 10, y: 20, width: 300, height: 120.456 },
      { x: 10, y: 200, width: 300, height: 80 },
    ])!;
    expect(mask["mask-image"].split("linear-gradient").length - 1).toBe(3);
    expect(mask["mask-size"]).toBe("100% 100%, 300px 120.46px, 300px 80px");
    expect(mask["mask-position"]).toBe("0 0, 10px 20px, 10px 200px");
    expect(mask["mask-composite"]).toBe("subtract, add, add");
    expect(mask["mask-repeat"]).toBe("no-repeat");
  });

  it("clips a pane to its scroll container", () => {
    expect(intersectRect({ x: 0, y: -50, width: 100, height: 100 }, { x: 0, y: 0, width: 80, height: 500 })).toEqual({ x: 0, y: 0, width: 80, height: 50 });
    expect(intersectRect({ x: 0, y: 600, width: 100, height: 100 }, { x: 0, y: 0, width: 80, height: 500 }).height).toBe(0);
  });
});
