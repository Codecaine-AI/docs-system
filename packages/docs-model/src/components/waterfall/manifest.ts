"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "waterfall",
  ownedTypes: ["waterfall"],
  description:
    "Process-flow waterfall: a recursive step tree (steps with nested sub-steps, > clarification notes as leaves) rendered as connected steps on a rail; arrow-tree text is the import/projection format. The high-level 'this process flows this way' diagram — canvas covers relationships, sequence covers exact exchanges.",
};
