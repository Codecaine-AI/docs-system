"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "pseudocode",
  ownedTypes: ["pseudocode"],
  description:
    "Pseudocode: plain-language code with control words, calls and arrows highlighted, trailing // comments in one aligned column, and an optional +/- diff gutter.",
  authoring: {
    whenToUse:
      "Use Pseudocode to explain an algorithm or a change in logic without the noise of real syntax. Write each step in plain words, such as equals, is empty, and, or, and \"add 1 to\", never ===, &&, ??, ?., += or an object literal. Keep a line to about 70 characters. Keep the source's function and field names and its order of branches, loops, calls, and returns. Give each trailing // comment a reason in about 40 characters. Set diff to show which lines a change adds or removes. Use Code when the reader needs the actual source.",
    example: "Sketch how the renderer builds header rows, marking the line this change removes.",
    docsPath: "10-system-design/40-block-vocabulary/20-code/20-pseudocode",
  },
};
