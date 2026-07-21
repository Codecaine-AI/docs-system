"use client";

import type { ComponentManifest } from "../types";

export const manifest: ComponentManifest = {
  name: "state-shape",
  ownedTypes: ["state-shape"],
  description:
    "Object shape definition: a recursive field tree (name, type, optionality, meaning) describing what a structure's state looks like, with an optional link to the defining source symbol.",
};
