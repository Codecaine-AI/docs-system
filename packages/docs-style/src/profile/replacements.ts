/**
 * The deny list: each word or phrase the profile replaces, with its fix and how safe the fix is.
 * A word that is not on this list is always allowed, so STE approved words, technical nouns, and
 * technical verbs never appear here. The rows come from three sources, in this order:
 * - Style guides: the 220 rows of proposals/ste-writing-profile-2026-10-02/data/replacements.csv,
 *   from Google, Microsoft, Red Hat, plainlanguage.gov, and STE.
 * - Habits: the owner's dictation and naming habits (Vocabulary page, "Habit Replacements").
 * - Filler: the Vocabulary page's "Banned Filler" table.
 *
 * Row conventions:
 * - `find` is lowercase, as written in prose. A rule keeps the inflection of the word it swaps,
 *   so "utilizes" becomes "uses".
 * - `replace: ""` deletes the word. Options are joined with " | ", and a row with options is never
 *   autofixed. In options, "(delete)", "(rewrite)", and "(state the fact)" are instructions.
 * - No fix writes a word that another row flags, so a fix never creates a new finding.
 *
 * Scope (see ProfileScope; profileFor picks the rows for one corpus):
 * - Style-guide rows have no scope, so they apply to every corpus.
 * - "house": the owner's spelling habits (subagent, mock-up, data set, work tree, side bar), the
 *   phrasal verbs, and the banned filler. They hold in every corpus the owner writes.
 * - "docs-system": the docs-system product names and naming decisions (doc system, subheader,
 *   pull request, state structure, issue, thread, directory, repository), and the figurative
 *   "land" and "ship". Other corpora use these words in other senses: Discord threads, a
 *   constant that "lands beside its consumer", and a "State Structure" heading in prompt-kit.
 *   The canon decisions behind them are docs-system decisions too.
 * - Two house rows are tighter than the Vocabulary page, so no corpus can lose meaning: "data set"
 *   is a flag ("the data set by the hook" is data plus a verb), and "mock up" swaps only a noun
 *   ("mock up the screen" is the verb).
 *
 * Conflicts resolved against the sources (each one drops or changes a source row):
 * - The naming canon wins. Dropped "repo" to "repository", "config" to "configuration", and
 *   "code base" to "codebase". A habit row now maps "code base" to "repo".
 * - STE approved words stay allowed. One script run against the local ste100/dictionary.json, by
 *   part of speech, dropped: approximately, previous, previously, subsequent, frequently,
 *   transmit, hit, kill, easily, easy, very, new, newer, will, since, while.
 *   - Also dropped "as" (meaning because): STE approves the preposition "as", which is almost
 *     every "as" in the corpus (282 hits), and a word list cannot find the conjunction.
 *   - Kept display and finish: STE approves only the nouns, and these rows swap the verbs.
 * - Technical verbs are never denied. Dropped search, generate, insert, and check (a checkbox).
 * - Registered technical nouns are never denied either. Dropped "request" for the same reason:
 *   almost every "request" here is an HTTP, MCP, or annotation request.
 * - Modal verbs live in `modals`. Dropped should, may, could, and would. The CSV row for "may"
 *   also suggested "might", which the profile bans.
 * - One row per find. simply, just, basically, and please come from the banned filler list.
 * - A fix must not write a flagged word. "has a requirement for" writes "must have", not "needs".
 *   require, desired, knock out, on the fly, and whether or not lose their flagged options.
 *   finalize keeps only "complete".
 * - Autofix only when the swap can never change meaning or grammar in any plausible technical
 *   sentence (corpus examples in quotes):
 *   - To flag: please, quite ("not quite"), note that ("a note that wants substructure"), info
 *     (the info callout tone), param and params (the params field of an action), permit ("as
 *     space permits"), choose ("a reader chooses to explore"), methodology ("the methodology
 *     package"), and inform ("research informs the design").
 *   - To flag in fix round 3 (each row's note names the sentence that breaks): every filler
 *     deletion (essentially, actually, really, basically, simply, please note that), because a
 *     hedge or contrast word can carry meaning. Also begin (tool names such as docs_begin),
 *     finish, remain, indicate, locate, terminate, finalize, facilitate, uncheck, deselect,
 *     grayed-out, drag and drop, close down, wrong ("went wrong"), and data shape.
 *   - To part-of-speech check: execute ("the execute step" of the annotations lifecycle).
 *   - New find: "a sufficient number of" keeps the article out of the swap, and "please note
 *     that" replaces "please note", whose deletion left a stray "that".
 * - Narrowed after wave 3 reviews (rules/replacement/match.ts holds the guards):
 *   - attempt swaps only before "to" and a verb. "Prior attempts are recorded" is a noun.
 *   - initiate keeps its sense before a connection or access: "who initiates the connection".
 *   - execute keeps "run" free on a page that names a run or a runner: "the DrawCore runner".
 *   - purchase skips network-setup, where "purchased" is an equipment status (skipCorpora).
 *   - A "pos" row's base form right before a noun can modify it: "add it to purchase costs".
 *   - No word is swapped on a page that uses it in a heading or a capitalized name, such as a
 *     "Retained History" heading.
 */
import type { Replacement } from "./types";

/** Rows from the public style guides (replacements.csv), in CSV order. */
const styleGuideRows: readonly Replacement[] = [
  { find: "in order to", replace: "to", tier: "autofix", category: "wordy phrase", note: "Keep it only when it adds clarity.", origin: "style-guides" },
  { find: "in order that", replace: "so that", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "as a means to", replace: "to", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "due to the fact that", replace: "because", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "because of the fact that", replace: "because", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "based on the fact that", replace: "because", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "despite the fact that", replace: "although", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in the event that", replace: "if", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in the event of", replace: "if", tier: "flag", category: "wordy phrase", note: "Needs a clause after \"if\". Rewrite the sentence.", origin: "style-guides" },
  { find: "prior to", replace: "before", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "subsequent to", replace: "after", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "at this point in time", replace: "now", tier: "autofix", category: "wordy phrase", note: "A present-state page can often delete it.", origin: "style-guides" },
  { find: "at the present time", replace: "now", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "has the ability to", replace: "can", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "is able to", replace: "can", tier: "autofix", category: "wordy phrase", note: "STE also maps \"able\" to \"can\".", origin: "style-guides" },
  { find: "are able to", replace: "can", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "has the capacity to", replace: "can", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "a large number of", replace: "many", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "a number of", replace: "many | some | the exact count", tier: "flag", category: "wordy phrase", note: "Give the number, or delete the phrase.", origin: "style-guides" },
  { find: "a majority of", replace: "most", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "with regard to", replace: "about", tier: "autofix", category: "wordy phrase", note: "STE prefers \"about\".", origin: "style-guides" },
  { find: "in regard to", replace: "about", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "pertaining to", replace: "about", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "whether or not", replace: "if", tier: "flag", category: "wordy phrase", note: "Keep it when it means \"regardless of whether\". The whether row flags \"whether\".", origin: "style-guides" },
  { find: "until such time as", replace: "until", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "for the duration of", replace: "during", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "take into account", replace: "consider", tier: "autofix", category: "wordy phrase", note: "Inflect the swap, so \"takes into account\" becomes \"considers\".", origin: "style-guides" },
  { find: "make use of", replace: "use", tier: "autofix", category: "wordy phrase", note: "Inflect the swap.", origin: "style-guides" },
  { find: "in addition", replace: "also", tier: "flag", category: "wordy phrase", note: "The position of \"also\" changes. Rewrite.", origin: "style-guides" },
  { find: "as well as", replace: "and", tier: "flag", category: "wordy phrase", note: "Can change the grouping in a list.", origin: "style-guides" },
  { find: "along the lines of", replace: "similar to", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "at all times", replace: "always", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in many cases", replace: "often", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in most cases", replace: "usually", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in some cases", replace: "sometimes", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "a sufficient number of", replace: "enough", tier: "autofix", category: "wordy phrase", note: "STE approves \"sufficient\". The profile picks \"enough\".", origin: "style-guides" },
  { find: "successfully complete", replace: "complete", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "conduct a review of", replace: "review", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "perform an assessment of", replace: "assess", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "establish connectivity", replace: "connect", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in lieu of", replace: "instead of", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "with the exception of", replace: "except for", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "has a requirement for", replace: "must have", tier: "autofix", category: "wordy phrase", note: "Not \"needs\", which the need row flags.", origin: "style-guides" },
  { find: "is applicable to", replace: "applies to", tier: "autofix", category: "wordy phrase", origin: "style-guides" },
  { find: "in accordance with", replace: "by | per | under | following", tier: "flag", category: "wordy phrase", note: "Pick the word by context.", origin: "style-guides" },
  { find: "as per", replace: "per | as", tier: "flag", category: "wordy phrase", note: "Google uses \"per\" only for rates.", origin: "style-guides" },
  { find: "on a regular basis", replace: "regularly | the interval", tier: "flag", category: "wordy phrase", note: "State the interval.", origin: "style-guides" },
  { find: "in the process of", replace: "", tier: "flag", category: "wordy phrase", note: "Deleting it often leaves a progressive verb. Rewrite.", origin: "style-guides" },
  { find: "there is", replace: "(rewrite)", tier: "flag", category: "wordy phrase", note: "Rewrite with a real subject.", origin: "style-guides" },
  { find: "there are", replace: "(rewrite)", tier: "flag", category: "wordy phrase", note: "Rewrite with a real subject.", origin: "style-guides" },
  { find: "plays a key role in", replace: "is essential to | (rewrite)", tier: "flag", category: "wordy phrase", note: "A slop phrase.", origin: "style-guides" },
  { find: "in terms of", replace: "(rewrite)", tier: "flag", category: "wordy phrase", note: "Name the relation instead.", origin: "style-guides" },
  { find: "utilize", replace: "use", tier: "autofix", category: "simple word", note: "Inflect the swap, so \"utilizes\" becomes \"uses\".", origin: "style-guides" },
  { find: "utilization", replace: "use | usage", tier: "flag", category: "simple word", note: "Keep it for a resource amount, such as CPU utilization.", origin: "style-guides" },
  { find: "leverage", replace: "use", tier: "pos", pos: "verb", category: "simple word", note: "Verb only.", origin: "style-guides" },
  { find: "facilitate", replace: "help", tier: "flag", category: "simple word", note: "\"Help\" needs a person or \"with\": \"facilitates debugging\" is not \"helps debugging\".", origin: "style-guides" },
  { find: "commence", replace: "start", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "initiate", replace: "start", tier: "autofix", category: "simple word", note: "Keep it for a connection, session, handshake, access, request, transfer, or contact: \"who initiates the connection\" names a direction.", origin: "style-guides" },
  { find: "terminate", replace: "stop", tier: "flag", category: "simple word", note: "Keep it in CLI syntax. \"Terminate\" ends a process, and \"stop\" can mean pause.", origin: "style-guides" },
  { find: "cease", replace: "stop", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "begin", replace: "start", tier: "flag", category: "simple word", note: "STE rejects \"begin\". Tool names such as docs_begin mirror the verb, so a person decides.", origin: "style-guides" },
  { find: "attempt", replace: "try", tier: "pos", pos: "verb", category: "simple word", note: "Verb only, and the fix needs \"to\" and a verb after it: \"attempts to parse\". The noun needs a rewrite: \"prior attempts are recorded\".", origin: "style-guides" },
  { find: "obtain", replace: "get", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "acquire", replace: "get", tier: "flag", category: "simple word", note: "\"Acquire a lock\" is a technical verb.", origin: "style-guides" },
  { find: "additional", replace: "more", tier: "flag", category: "simple word", note: "\"An additional X\" becomes \"another X\".", origin: "style-guides" },
  { find: "assist", replace: "help", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "assistance", replace: "help", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "modify", replace: "change", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "alter", replace: "change", tier: "autofix", category: "simple word", note: "SQL such as ALTER TABLE in a code span is out of scope.", origin: "style-guides" },
  { find: "numerous", replace: "many", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "demonstrate", replace: "show", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "indicate", replace: "show", tier: "flag", pos: "verb", category: "simple word", note: "Verb only. \"The results indicate\" suggests, and \"show\" proves.", origin: "style-guides" },
  { find: "display", replace: "show", tier: "pos", pos: "verb", category: "simple word", note: "Verb only. STE approves the noun.", origin: "style-guides" },
  { find: "exhibit", replace: "show", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "determine", replace: "find | find out | decide", tier: "flag", category: "simple word", note: "The meaning splits into calculate and decide.", origin: "style-guides" },
  { find: "eliminate", replace: "remove", tier: "flag", category: "simple word", note: "Sometimes means prevent or stop.", origin: "style-guides" },
  { find: "encounter", replace: "get | find | see", tier: "flag", category: "simple word", note: "Rewrite \"if you encounter an error\" as \"if an error occurs\".", origin: "style-guides" },
  { find: "ensure", replace: "make sure", tier: "autofix", category: "simple word", note: "STE requires \"make sure\". Microsoft keeps \"ensure\".", origin: "style-guides" },
  { find: "verify", replace: "make sure | check", tier: "flag", category: "simple word", note: "\"Verify a signature\" is a technical verb.", origin: "style-guides" },
  { find: "maintain", replace: "keep", tier: "flag", category: "simple word", note: "\"Maintain a library\" is a different sense.", origin: "style-guides" },
  { find: "permit", replace: "let", tier: "flag", category: "simple word", note: "\"Let\" takes no \"to\", and \"as space permits\" has no object. Rewrite.", origin: "style-guides" },
  { find: "allow", replace: "let", tier: "flag", category: "simple word", note: "Fine for a permission feature, such as a firewall rule.", origin: "style-guides" },
  { find: "allows you to", replace: "lets you", tier: "autofix", category: "simple word", note: "Inflect the swap.", origin: "style-guides" },
  { find: "enables you to", replace: "lets you", tier: "autofix", category: "simple word", note: "Better still, name the user action.", origin: "style-guides" },
  { find: "provide", replace: "give", tier: "flag", category: "simple word", note: "For an API, \"has\" or \"returns\" often reads better.", origin: "style-guides" },
  { find: "purchase", replace: "buy", tier: "pos", pos: "verb", category: "simple word", note: "Verb only: \"purchase costs\" is a noun. network-setup uses \"purchased\" as an equipment status.", origin: "style-guides", skipCorpora: ["network-setup"] },
  { find: "remain", replace: "stay", tier: "flag", pos: "verb", category: "simple word", note: "Verb only. \"Remains unimplemented\" means \"is still\", and \"stays\" means \"will continue\". The adjective \"remaining\" becomes \"other\".", origin: "style-guides" },
  { find: "retain", replace: "keep", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "require", replace: "must | necessary", tier: "flag", category: "simple word", note: "Keep \"required field\". Not \"need\", which the need row flags.", origin: "style-guides" },
  { find: "proceed", replace: "continue | go to", tier: "flag", category: "simple word", origin: "style-guides" },
  { find: "identical", replace: "same", tier: "flag", category: "simple word", note: "\"Identical to\" becomes \"the same as\".", origin: "style-guides" },
  { find: "however", replace: "but", tier: "flag", category: "simple word", note: "A sentence that opens with \"However,\" needs a rewrite.", origin: "style-guides" },
  { find: "therefore", replace: "thus | so", tier: "flag", category: "simple word", note: "STE uses \"thus\".", origin: "style-guides" },
  { find: "consequently", replace: "so | as a result", tier: "flag", category: "simple word", origin: "style-guides" },
  { find: "accordingly", replace: "so", tier: "flag", category: "simple word", origin: "style-guides" },
  { find: "whereas", replace: "but | because", tier: "flag", category: "simple word", origin: "style-guides" },
  { find: "comprise", replace: "include | consist of", tier: "flag", category: "simple word", note: "Writers often invert its meaning.", origin: "style-guides" },
  { find: "possess", replace: "have", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "desire", replace: "want", tier: "pos", pos: "verb", category: "simple word", note: "Verb only.", origin: "style-guides" },
  { find: "desired", replace: "that you want | necessary", tier: "flag", category: "simple word", note: "Not \"required\", which the require row flags.", origin: "style-guides" },
  { find: "wish to", replace: "want to", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "endeavor", replace: "try", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "finalize", replace: "complete", tier: "flag", category: "simple word", note: "Not \"finish\", which the finish row flags. \"Finalize a decision\" is not \"complete a decision\".", origin: "style-guides" },
  { find: "methodology", replace: "method", tier: "flag", category: "simple word", note: "A methodology is a system of methods, such as the methodology package.", origin: "style-guides" },
  { find: "optimum", replace: "best", tier: "flag", category: "simple word", note: "\"Optimal\" is technical in algorithms.", origin: "style-guides" },
  { find: "relocate", replace: "move", tier: "autofix", category: "simple word", origin: "style-guides" },
  { find: "inform", replace: "tell", tier: "flag", category: "simple word", note: "\"Research informs the design\" means shapes, not tells.", origin: "style-guides" },
  { find: "notify", replace: "tell", tier: "flag", category: "simple word", note: "A technical verb for events and webhooks.", origin: "style-guides" },
  { find: "implement", replace: "do | carry out", tier: "flag", category: "simple word", note: "\"Implement an interface\" is a technical verb.", origin: "style-guides" },
  { find: "execute", replace: "run", tier: "pos", pos: "verb", category: "simple word", note: "Verb only. \"The execute step\" names a lifecycle step. Keep it on a page that names a run or a runner.", origin: "style-guides" },
  { find: "perform", replace: "do | run", tier: "flag", category: "simple word", origin: "style-guides" },
  { find: "choose", replace: "select", tier: "flag", category: "simple word", note: "\"Chooses to\" needs a rewrite, and Google allows \"choose\" in general text.", origin: "style-guides" },
  { find: "locate", replace: "find", tier: "flag", category: "simple word", note: "\"Is located in\" means \"is in\", and \"is found in\" means discovered.", origin: "style-guides" },
  { find: "whether", replace: "if", tier: "flag", category: "simple word", note: "\"If\" can blur a condition and a choice.", origin: "style-guides" },
  { find: "via", replace: "through | by using | with", tier: "flag", category: "simple word", note: "Pick the word by context.", origin: "style-guides" },
  { find: "e.g.", replace: "for example", tier: "autofix", category: "Latin abbreviation", note: "Keep the comma after it.", origin: "style-guides" },
  { find: "i.e.", replace: "that is", tier: "autofix", category: "Latin abbreviation", origin: "style-guides" },
  { find: "etc.", replace: "and so on | (rewrite the list)", tier: "flag", category: "Latin abbreviation", note: "Better, give the full list or use \"such as\".", origin: "style-guides" },
  { find: "vs.", replace: "versus | compared to", tier: "flag", category: "Latin abbreviation", origin: "style-guides" },
  { find: "and/or", replace: "or | A, B, or both", tier: "flag", category: "Latin abbreviation", origin: "style-guides" },
  { find: "n/a", replace: "not applicable", tier: "autofix", category: "Latin abbreviation", origin: "style-guides" },
  { find: "aka", replace: "also known as", tier: "autofix", category: "Latin abbreviation", origin: "style-guides" },
  { find: "viz.", replace: "namely", tier: "autofix", category: "Latin abbreviation", origin: "style-guides" },
  { find: "click on", replace: "click", tier: "autofix", category: "UI verb", note: "STE lists \"click\" as a technical verb.", origin: "style-guides" },
  { find: "double-click on", replace: "double-click", tier: "autofix", category: "UI verb", origin: "style-guides" },
  { find: "tap on", replace: "tap", tier: "autofix", category: "UI verb", origin: "style-guides" },
  { find: "uncheck", replace: "clear", tier: "flag", category: "UI verb", note: "\"Clear\" can also mean empty a field.", origin: "style-guides" },
  { find: "deselect", replace: "clear", tier: "flag", category: "UI verb", note: "STE lists \"deselect\" as a technical verb. \"Clear\" can also mean empty a field.", origin: "style-guides" },
  { find: "grayed-out", replace: "unavailable", tier: "flag", category: "UI verb", note: "It can name a look, not a state: \"grayed-out placeholder text\".", origin: "style-guides" },
  { find: "navigate to", replace: "go to", tier: "autofix", category: "UI verb", origin: "style-guides" },
  { find: "pop-up", replace: "dialog | menu", tier: "flag", category: "UI verb", note: "The transcripts use \"pop-up\" for this. Pick one name.", origin: "style-guides" },
  { find: "mouse over", replace: "hover over", tier: "autofix", category: "UI verb", note: "Google prefers \"hold the pointer over\".", origin: "style-guides" },
  { find: "drag and drop", replace: "drag", tier: "flag", category: "UI verb", note: "STE lists \"drag and drop\" as a technical verb. \"Supports drag and drop\" cannot become \"supports drag\".", origin: "style-guides" },
  { find: "start up", replace: "start", tier: "autofix", category: "UI verb", origin: "style-guides" },
  { find: "print out", replace: "print", tier: "autofix", category: "UI verb", origin: "style-guides" },
  { find: "close down", replace: "close", tier: "flag", category: "UI verb", note: "\"Close down a service\" shuts it off, and \"close\" also names closing a window.", origin: "style-guides" },
  { find: "login", replace: "log in", tier: "pos", pos: "verb", category: "UI verb", note: "Verb only. The noun \"login\" is fine.", origin: "style-guides" },
  { find: "setup", replace: "set up", tier: "pos", pos: "verb", category: "UI verb", note: "Verb only. The noun \"setup\" is fine.", origin: "style-guides" },
  { find: "abort", replace: "stop | cancel", tier: "flag", category: "process verb", note: "STE lists \"abort\" as a technical verb.", origin: "style-guides" },
  { find: "launch", replace: "start | open", tier: "flag", category: "process verb", origin: "style-guides" },
  { find: "spawn", replace: "create | start", tier: "flag", category: "process verb", note: "Technical for processes and sub-agents.", origin: "style-guides" },
  { find: "spin up", replace: "start | create", tier: "flag", category: "process verb", note: "A phrasal verb. STE 9.3 bans phrasal verbs.", origin: "style-guides" },
  { find: "kick off", replace: "start", tier: "autofix", category: "process verb", note: "Derived from STE 9.3, not from a published list.", origin: "style-guides" },
  { find: "ingest", replace: "import | load", tier: "flag", category: "process verb", origin: "style-guides" },
  { find: "persist", replace: "save | store", tier: "flag", category: "process verb", note: "Transitive only, as in \"persist the file\". \"The setting persists\" is fine.", origin: "style-guides" },
  { find: "on the fly", replace: "dynamically | as necessary", tier: "flag", category: "idiom", note: "Not \"as needed\", which the need row flags.", origin: "style-guides" },
  { find: "out of the box", replace: "by default", tier: "flag", category: "idiom", note: "Pick the text for the context.", origin: "style-guides" },
  { find: "once", replace: "after", tier: "flag", category: "conjunction", note: "Only when it means \"after\". \"Once\" meaning one time is fine.", origin: "style-guides" },
  { find: "simple", replace: "(rewrite)", tier: "flag", category: "filler", note: "\"Simple type\" and similar terms are technical.", origin: "style-guides" },
  { find: "quite", replace: "", tier: "flag", category: "filler", note: "\"Not quite\" and \"quite a few\" change meaning without it.", origin: "style-guides" },
  { find: "obviously", replace: "", tier: "flag", category: "filler", note: "Condescending.", origin: "style-guides" },
  { find: "of course", replace: "", tier: "flag", category: "filler", note: "Condescending.", origin: "style-guides" },
  { find: "please note that", replace: "", tier: "flag", category: "filler", note: "Delete the whole phrase when it adds nothing. It can mark a warning. The please row flags other uses.", origin: "style-guides" },
  { find: "note that", replace: "", tier: "flag", category: "filler", note: "\"A note that ...\" is a noun plus a clause. Delete only the filler.", origin: "style-guides" },
  { find: "currently", replace: "", tier: "flag", category: "tense and time", note: "A page describes the present state.", origin: "style-guides" },
  { find: "performant", replace: "fast | efficient | a metric", tier: "flag", category: "hype", origin: "style-guides" },
  { find: "functionality", replace: "feature | capability", tier: "flag", category: "hype", origin: "style-guides" },
  { find: "state-of-the-art", replace: "latest | a specific claim", tier: "flag", category: "hype", origin: "style-guides" },
  { find: "robust", replace: "(state the fact)", tier: "flag", category: "hype", note: "Common tells of model-written text.", origin: "style-guides" },
  { find: "seamless", replace: "(state the fact)", tier: "flag", category: "hype", note: "Common tells of model-written text.", origin: "style-guides" },
  { find: "crucial", replace: "(state the fact)", tier: "flag", category: "hype", note: "Common tells of model-written text.", origin: "style-guides" },
  { find: "powerful", replace: "(state the fact)", tier: "flag", category: "hype", note: "Common tells of model-written text.", origin: "style-guides" },
  { find: "whitelist", replace: "allowlist", tier: "pos", pos: "noun", category: "inclusive", note: "Noun only. Rewrite verb forms.", origin: "style-guides" },
  { find: "blacklist", replace: "denylist | blocklist", tier: "flag", category: "inclusive", note: "The noun becomes denylist or blocklist. Rewrite verb forms.", origin: "style-guides" },
  { find: "master", replace: "main | primary", tier: "flag", category: "inclusive", note: "Git branch names in code spans are out of scope.", origin: "style-guides" },
  { find: "slave", replace: "replica | secondary", tier: "flag", category: "inclusive", origin: "style-guides" },
  { find: "sanity check", replace: "quick check | confidence check", tier: "flag", category: "inclusive", origin: "style-guides" },
  { find: "dummy", replace: "placeholder", tier: "flag", category: "inclusive", note: "Also test double, stub, or fake.", origin: "style-guides" },
  { find: "he", replace: "they | you", tier: "flag", category: "inclusive", origin: "style-guides" },
  { find: "she", replace: "they | you", tier: "flag", category: "inclusive", origin: "style-guides" },
  { find: "man-hours", replace: "person hours", tier: "autofix", category: "inclusive", origin: "style-guides" },
  { find: "achieve", replace: "get", tier: "flag", category: "STE core", origin: "style-guides" },
  { find: "assume", replace: "think", tier: "flag", category: "STE core", note: "\"Assume a role\" is technical.", origin: "style-guides" },
  { find: "evaluate", replace: "examine", tier: "flag", category: "STE core", note: "\"Evaluate an expression\" is technical.", origin: "style-guides" },
  { find: "establish", replace: "make sure | make", tier: "flag", category: "STE core", note: "\"Establish a connection\" becomes \"connect\".", origin: "style-guides" },
  { find: "exist", replace: "be", tier: "flag", category: "STE core", note: "Needs \"there is\" or a rewrite.", origin: "style-guides" },
  { find: "happen", replace: "occur", tier: "autofix", category: "STE core", note: "STE approves \"occur\".", origin: "style-guides" },
  { find: "wrong", replace: "incorrect", tier: "flag", pos: "adjective", category: "STE core", note: "Adjective only. \"Something went wrong\" cannot become \"went incorrect\".", origin: "style-guides" },
  { find: "finish", replace: "complete", tier: "flag", pos: "verb", category: "STE core", note: "Verb only. STE approves the noun. \"Wait for saves to finish\" needs an object after \"complete\".", origin: "style-guides" },
  { find: "need", replace: "necessary | must", tier: "flag", category: "STE core", note: "The grammar changes. STE uses the adjective \"necessary\".", origin: "style-guides" },
  { find: "fail", replace: "if ... not", tier: "flag", category: "STE core", note: "Common in software. A candidate technical verb.", origin: "style-guides" },
  { find: "able to", replace: "can", tier: "flag", category: "STE core", note: "The \"is able to\" and \"are able to\" rows autofix.", origin: "style-guides" },
  { find: "ask", replace: "tell", tier: "flag", category: "STE core", note: "STE maps \"ask\" to \"tell\".", origin: "style-guides" },
  { find: "info", replace: "information", tier: "flag", category: "shorthand", note: "Keep \"info\" for the callout tone and a code fence info string.", origin: "style-guides" },
  { find: "param", replace: "parameter", tier: "flag", category: "shorthand", note: "Keep it when it names the params field of an action or an operation.", origin: "style-guides" },
  { find: "params", replace: "parameters", tier: "flag", category: "shorthand", note: "Keep it when it names the params field of an action or an operation.", origin: "style-guides" },
  { find: "spec", replace: "specification", tier: "flag", category: "shorthand", note: "Flag only: \"spec\" is project vocabulary for a design page.", origin: "style-guides" },
  { find: "authn", replace: "authentication", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "authz", replace: "authorization", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "k8s", replace: "Kubernetes", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "regex", replace: "regular expression", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "distro", replace: "distribution", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "e-mail", replace: "email", tier: "autofix", category: "shorthand", note: "STE spells it \"e-mail\".", origin: "style-guides" },
  { find: "tarball", replace: "tar file", tier: "autofix", category: "shorthand", origin: "style-guides" },
  { find: "bugfix", replace: "bug fix", tier: "autofix", category: "shorthand", origin: "style-guides" },
];

/**
 * The owner's dictation and naming habits. Each row is "house" or "docs-system" (see the scope
 * notes above). "header" is not a row: every corpus use means a UI region, a header row, or a
 * code header.
 */
const habitRows: readonly Replacement[] = [
  { find: "doc system", replace: "docs system", tier: "autofix", category: "naming", note: "Matches the repo name.", origin: "habit", scope: "docs-system" },
  { find: "documentation system", replace: "docs system", tier: "flag", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "docs framework", replace: "docs system", tier: "flag", category: "naming", note: "\"Docs framework\" is also the name of an older skill.", origin: "habit", scope: "docs-system" },
  { find: "subheader", replace: "subheading", tier: "autofix", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "subagent", replace: "sub-agent", tier: "autofix", category: "naming", note: "docs-system only: agent-kernel uses \"subagent\" as its own term, and its docs must match its code.", origin: "habit", scope: "docs-system" },
  { find: "sub agent", replace: "sub-agent", tier: "autofix", category: "naming", origin: "habit", scope: "house" },
  { find: "mock-up", replace: "mockup", tier: "autofix", category: "naming", origin: "habit", scope: "house" },
  { find: "mock up", replace: "mockup", tier: "pos", pos: "noun", category: "naming", note: "Noun only. \"Mock up the screen\" is the verb, which keeps the space.", origin: "habit", scope: "house" },
  { find: "data set", replace: "dataset", tier: "flag", category: "spelling", note: "In \"the data set by the hook\", \"set\" is a verb, and \"dataset\" would change the sentence.", origin: "habit", scope: "house" },
  { find: "work tree", replace: "worktree", tier: "autofix", category: "spelling", note: "Matches the git spelling.", origin: "habit", scope: "house" },
  { find: "side bar", replace: "sidebar", tier: "autofix", category: "spelling", origin: "habit", scope: "house" },
  { find: "pull request", replace: "PR", tier: "autofix", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "state structure", replace: "state shape", tier: "autofix", category: "naming", note: "Matches the block type name.", origin: "habit", scope: "docs-system" },
  { find: "data shape", replace: "state shape", tier: "flag", category: "naming", note: "Matches the block type name. \"The data shape of a response\" is not a state shape.", origin: "habit", scope: "docs-system" },
  { find: "get rid of", replace: "remove", tier: "autofix", category: "phrasal verb", note: "Inflect the swap.", origin: "habit", scope: "house" },
  { find: "wire up", replace: "connect", tier: "autofix", category: "phrasal verb", note: "Inflect the swap.", origin: "habit", scope: "house" },
  { find: "hook up", replace: "connect", tier: "autofix", category: "phrasal verb", note: "Inflect the swap.", origin: "habit", scope: "house" },
  { find: "tie in", replace: "connect", tier: "autofix", category: "phrasal verb", note: "Inflect the swap.", origin: "habit", scope: "house" },
  { find: "figure out", replace: "find | find out", tier: "flag", category: "phrasal verb", origin: "habit", scope: "house" },
  { find: "look into", replace: "examine | find", tier: "flag", category: "phrasal verb", origin: "habit", scope: "house" },
  { find: "dig into", replace: "examine | find", tier: "flag", category: "phrasal verb", origin: "habit", scope: "house" },
  { find: "knock out", replace: "do | complete", tier: "flag", category: "phrasal verb", note: "Not \"finish\", which the finish row flags.", origin: "habit", scope: "house" },
  { find: "issue", replace: "problem | bug | error", tier: "flag", category: "naming", note: "Keep \"issue\" for a tracked item and a validation issue.", origin: "habit", scope: "docs-system" },
  { find: "thread", replace: "session", tier: "flag", category: "naming", note: "Only for a stored conversation. \"New thread\" and an annotation thread keep it.", origin: "habit", scope: "docs-system" },
  { find: "directory", replace: "folder", tier: "flag", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "dir", replace: "folder", tier: "flag", category: "naming", note: "Code spans and CLI flags keep \"dir\".", origin: "habit", scope: "docs-system" },
  { find: "repository", replace: "repo", tier: "flag", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "codebase", replace: "repo", tier: "flag", category: "naming", origin: "habit", scope: "docs-system" },
  { find: "code base", replace: "repo", tier: "flag", category: "naming", note: "Replaces the style-guide swap to \"codebase\", which the canon avoids.", origin: "habit", scope: "docs-system" },
  { find: "land", replace: "merge | deploy", tier: "flag", category: "figurative verb", note: "Only for a change, as in \"the fix lands\".", origin: "habit", scope: "docs-system" },
  { find: "ship", replace: "merge | deploy", tier: "flag", category: "figurative verb", note: "Only for a change, as in \"the feature ships\".", origin: "habit", scope: "docs-system" },
];

/** Banned filler, from the owner's dictation, so every row is "house". Every row is a flag. */
const fillerRows: readonly Replacement[] = [
  { find: "whatnot", replace: "", tier: "flag", category: "filler", note: "Name the list in full.", origin: "filler", scope: "house" },
  { find: "and such", replace: "", tier: "flag", category: "filler", note: "Name the list in full.", origin: "filler", scope: "house" },
  { find: "or something", replace: "", tier: "flag", category: "filler", note: "Name the thing, or delete the phrase.", origin: "filler", scope: "house" },
  { find: "stuff", replace: "", tier: "flag", category: "filler", note: "Name the things.", origin: "filler", scope: "house" },
  { find: "thing", replace: "", tier: "flag", category: "filler", note: "Name the thing.", origin: "filler", scope: "house" },
  { find: "things", replace: "", tier: "flag", category: "filler", note: "Name the things.", origin: "filler", scope: "house" },
  { find: "essentially", replace: "", tier: "flag", category: "filler", note: "Delete it when it adds nothing. A hedge can carry meaning.", origin: "filler", scope: "house" },
  { find: "kind of", replace: "", tier: "flag", category: "filler", note: "Delete the hedge in \"kind of slow\". In \"a kind of block\", write \"type\".", origin: "filler", scope: "house" },
  { find: "just", replace: "(delete) | only", tier: "flag", category: "filler", note: "\"Just\" can mean only or recently.", origin: "filler", scope: "house" },
  { find: "actually", replace: "", tier: "flag", category: "filler", note: "Delete it when it adds nothing. It can mark a contrast.", origin: "filler", scope: "house" },
  { find: "really", replace: "", tier: "flag", category: "filler", note: "Delete it when it adds nothing. It can mark a contrast.", origin: "filler", scope: "house" },
  { find: "basically", replace: "", tier: "flag", category: "filler", note: "Delete it when it adds nothing. A hedge can carry meaning.", origin: "filler", scope: "house" },
  { find: "simply", replace: "", tier: "flag", category: "filler", note: "Delete it when it adds nothing. It can mean \"only\".", origin: "filler", scope: "house" },
  { find: "please", replace: "", tier: "flag", category: "filler", note: "Keep it only to ask permission or forgiveness.", origin: "filler", scope: "house" },
];

export const replacements: readonly Replacement[] = [...styleGuideRows, ...habitRows, ...fillerRows];
