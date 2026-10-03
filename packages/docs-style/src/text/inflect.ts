/**
 * Inflection with compromise. A swap must keep the form of the word it replaces, so "utilizes"
 * becomes "uses" and "ensured" becomes "made sure". A verb form changes the first word of a
 * phrase ("makes sure"), and a plural changes the last word ("pull requests").
 */
import nlp from "compromise";

export type WordForm = "infinitive" | "present" | "past" | "participle" | "gerund" | "plural";
type VerbForm = Exclude<WordForm, "plural">;

interface Conjugation {
  Infinitive?: string;
  PresentTense?: string;
  PastTense?: string;
  Participle?: string;
  Gerund?: string;
}
// compromise types its methods as `object`. This is the slice of the transform API we call.
interface Transforms {
  verb: {
    conjugate(word: string, model: object): Conjugation;
    toInfinitive(word: string, model: object, tense?: string): string;
  };
  noun: { toPlural(word: string, model: object): string };
}
const model = nlp.model();
const transform = (nlp.methods() as { two: { transform: Transforms } }).two.transform;

const TENSES: [VerbForm, keyof Conjugation][] = [
  ["gerund", "Gerund"],
  ["participle", "Participle"],
  ["past", "PastTense"],
  ["present", "PresentTense"],
];
/** compromise lists no participle when it equals the past tense, or, for these verbs, the infinitive. */
const PARTICIPLE_IS_INFINITIVE = new Set(["run", "come", "become", "overcome"]);

const conjugations = new Map<string, Record<VerbForm, string>>();
function verbForms(lemma: string): Record<VerbForm, string> {
  let forms = conjugations.get(lemma);
  if (!forms) {
    const c = transform.verb.conjugate(lemma, model);
    const past = c.PastTense ?? lemma;
    forms = {
      infinitive: lemma,
      present: c.PresentTense ?? lemma,
      past,
      participle: c.Participle ?? (PARTICIPLE_IS_INFINITIVE.has(lemma) ? lemma : past),
      gerund: c.Gerund ?? lemma,
    };
    conjugations.set(lemma, forms);
  }
  return forms;
}

/** Inflect one word, keeping a leading capital. compromise works on lowercase words. */
function inflectWord(word: string, form: WordForm): string {
  const lower = word.toLowerCase();
  const out = form === "plural" ? transform.noun.toPlural(word, model) : verbForms(lower)[form];
  return word !== lower && /^\p{Lu}\p{Ll}*$/u.test(word) ? capitalize(out) : out;
}

/**
 * Put `base` (a dictionary form: an infinitive or a singular noun) into `form`. A verb form
 * changes the first word, and a plural changes the last word.
 */
export function inflect(base: string, form: WordForm): string {
  if (form === "infinitive" || !base.trim()) return base;
  const words = base.split(" ");
  const at = form === "plural" ? words.length - 1 : 0;
  words[at] = inflectWord(words[at]!, form);
  return words.join(" ");
}

/** The dictionary form of a verb in `form`, such as "let" for "lets" in the present. */
export function lemmaOf(word: string, form: WordForm): string {
  if (form === "infinitive" || form === "plural") return word;
  const tense = TENSES.find(([f]) => f === form)![1];
  return transform.verb.toInfinitive(word.toLowerCase(), model, tense) || word;
}

/** The tags compromise gives each word of a short text, such as "Verb" or "Noun". */
function termTags(text: string): Set<string>[] {
  const sentences = nlp(text).json() as { terms: { tags: string[] }[] }[];
  return (sentences[0]?.terms ?? []).map((term) => new Set(term.tags));
}

/** The tags of one word in isolation. */
function loneTags(word: string): Set<string> {
  return termTags(word)[0] ?? new Set();
}

/**
 * What a word or phrase can be, by compromise's lexicon: `verb` when its first word can be a
 * verb, `noun` when its last word can be a noun. A phrase is tagged as a whole, so "request" in
 * "pull request" is a noun. compromise tags "select" and "complete" as adjectives in isolation,
 * so a lone adjective that reads as a verb after a subject also counts as a verb.
 */
export function wordClass(text: string): { verb: boolean; noun: boolean } {
  const tags = termTags(text.toLowerCase());
  const first = tags[0] ?? new Set<string>();
  let verb = first.has("Verb");
  if (!verb && tags.length === 1 && first.has("Adjective")) verb = termTags(`we ${text} it`)[1]?.has("Verb") ?? false;
  return { verb, noun: tags.at(-1)?.has("Noun") ?? false };
}

/** Every verb form of a word, with the form each spelling is. Spellings can share forms. */
export function verbInflections(lemma: string): Map<string, WordForm[]> {
  const out = new Map<string, WordForm[]>();
  for (const [form, text] of Object.entries(verbForms(lemma.toLowerCase())) as [VerbForm, string][])
    out.set(text, [...(out.get(text) ?? []), form]);
  return out;
}

/** The plural of a noun or noun phrase: the last word changes. */
export function pluralOf(base: string): string {
  return inflect(base, "plural");
}

/**
 * The form of a word as written, judged from the word alone: a verb form of the first word, else
 * a plural of the last word, else the infinitive. "utilized" is "past" because its past tense
 * and participle share a spelling. Pass the form to inflectLike when the context decides it.
 */
export function formOf(matched: string): WordForm {
  const words = matched.toLowerCase().split(/\s+/);
  const first = words[0]!;
  for (const [form, tense] of TENSES) {
    const lemma = transform.verb.toInfinitive(first, model, tense);
    if (!lemma || lemma === first) continue;
    const forms = verbForms(lemma);
    if (forms[form] !== first) continue;
    if (form === "participle" && forms.past === first) return "past";
    if (form === "present" && words.length === 1 && loneTags(first).has("Plural")) return "plural";
    return form;
  }
  // Tag the whole phrase: "requests" alone reads as a verb, but not in "pull requests".
  return termTags(words.join(" ")).at(-1)?.has("Plural") ? "plural" : "infinitive";
}

/**
 * Give `base` the form of `matched`: inflectLike("utilizes", "use") is "uses", and
 * inflectLike("ensures", "make sure") is "makes sure". A plural stays plural. A capital first
 * letter carries over. A lowercase one does not, so "PR" stays "PR". `form` overrides formOf
 * when the caller knows the form from context.
 */
export function inflectLike(matched: string, base: string, form: WordForm = formOf(matched)): string {
  const out = inflect(base, form);
  return /^\p{Lu}/u.test(matched) ? capitalize(out) : out;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
