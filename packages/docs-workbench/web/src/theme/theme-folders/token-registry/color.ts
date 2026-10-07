import type { ThemeTokenDefinition } from "../types";

export const color = (...vars: string[]): ThemeTokenDefinition => ({ vars, kind: "color" });
