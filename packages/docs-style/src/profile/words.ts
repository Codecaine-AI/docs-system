/**
 * Word lists that are not swaps: modal verbs, slop words, and meaning words.
 */
import type { ModalRule } from "./types";

/**
 * Modal verbs and their STE replacements (STE Profile, "Modal verbs"). This list is the only
 * source for modals, so the deny list holds none of them.
 */
export const modals: readonly ModalRule[] = [
  { word: "should", use: "must", note: "Or rewrite the sentence as a command." },
  { word: "may", use: "can", note: "Keep \"may\" only for permission." },
  { word: "might", use: "can" },
  { word: "could", use: "can" },
  { word: "would", use: "can | will" },
];

/**
 * Words that mark model-written filler: the stock and puffery words from Writing Style ("Remove
 * Inflated Content" and "Replace Formulaic Language") and the hype rows of the style-guide table.
 * A rewrite must not add any of them. Lowercase, and phrases are allowed.
 *
 * Left out, because each has a literal meaning in our pages: landscape (page orientation),
 * highlighting (syntax highlighting), reflecting, underscore (the "_" character), features,
 * vector, primitive, harness, surface (agent surface), scaffolding, modality, and "potentially"
 * alone. "Not just X, but Y" and "from X to Y" are sentence patterns, not words.
 */
export const slopWords: readonly string[] = [
  // Puffery and unsupported claims
  "evolving landscape",
  "setting the stage",
  "indelible mark",
  "deeply rooted",
  "nestled",
  "breathtaking",
  "groundbreaking",
  "renowned",
  "stunning",
  "must-visit",
  "experts believe",
  "industry reports suggest",
  "some critics argue",
  "despite challenges",
  "continues to thrive",
  // Stock vocabulary
  "additionally",
  "crucial",
  "delve",
  "delves",
  "delving",
  "enduring",
  "enhance",
  "enhances",
  "ensuring",
  "foster",
  "fosters",
  "fostering",
  "garner",
  "garners",
  "garnered",
  "interplay",
  "intricate",
  "pivotal",
  "showcase",
  "showcases",
  "showcasing",
  "tapestry",
  "testament",
  "vibrant",
  "serves as",
  "stands as",
  "boasts",
  // Metaphors for a mechanism
  "substrate",
  "wedge",
  "locus",
  "vantage",
  "nexus",
  "bedrock",
  "paradigm",
  "gold-plating",
  "ratchet",
  "evacuate",
  "endgame",
  "north star",
  "flywheel",
  // Filler phrases and stacked hedges
  "it is important to note",
  "plays a key role",
  "could potentially",
  // Hype rows of the style-guide table
  "performant",
  "functionality",
  "state-of-the-art",
  "robust",
  "seamless",
  "seamlessly",
  "powerful",
];

/**
 * Limit and logic words. A rewrite must keep the count of each one, because dropping "only" or
 * "not" changes a fact. Beyond the design's list, this adds "no" and "cannot" plus clear limit
 * words ("exactly", "at least", "at most") and logic words ("neither", "nor", "without",
 * "otherwise").
 */
export const meaningWords: readonly string[] = [
  "not",
  "never",
  "only",
  "must",
  "if",
  "unless",
  "except",
  "all",
  "none",
  "no",
  "cannot",
  "neither",
  "nor",
  "without",
  "otherwise",
  "exactly",
  "at least",
  "at most",
];

/**
 * Labels that give a block its role in a template, such as the decision entries on implementation
 * pages ("Why: ...", "Applies to: ..."). A label-colon opener with one of these labels is the
 * template, not a style problem, so the sweep drops its finding.
 */
export const roleMarkers: readonly string[] = [
  "Decision",
  "Why",
  "Applies to",
  "Rejected",
  "Source",
  "Governed by",
  "Alternatives",
  "Status",
];
