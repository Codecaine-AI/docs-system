// Tier 3: rewrite one documentation block with the smallest edit that fixes its style findings.
//
// The caller masks every code span, link, and page reference as a token such as ⟦0⟧ before the
// call (src/rewrite/protect.ts), so the model never sees text it must not change. Guardrails in
// TypeScript verify every answer. Nothing the model says about its own edit is trusted.
//
// Prompt layout: all static text (role, rules, style targets, format, output schema) sits in the
// system message, so a route with prefix caching can reuse it across every call in a sweep. All
// per-block text comes last, in the user message.
//
// Run the tests: bunx baml-cli test --from baml_src (codex-lb must be up at 127.0.0.1:2455).

class RewriteFinding {
  rule_id string
  message string
  hint string
  // Where the problem is, such as "flagged sentence 2", a quoted phrase, or "the whole block".
  target string
}

class RewriteToken {
  token string
  kind "code" | "link" | "reference"
  // The text the token stands for, as the reader sees it.
  preview string
}

// Text near the block, for meaning only.
class RewriteContext {
  heading string?
  previous string?
  next string?
  parent string?
}

class SplitCheck {
  sentence string @description("The first five words of the sentence")
  words int @description("How many words the sentence has")
  split_at string @description("The words on each side of the place a split would go, or \"none\"")
  after_split string @description("The words after the split point, copied exactly, or \"none\"")
  after_split_subject string @description("The subject that opens after_split, copied exactly, or \"none\"")
  pronouns_after_split string[] @description("Every it, its, they, them, their, this, these, or those in after_split")
  w1_under_15_words bool
  w2_short_contrast bool
  w3_colon_list bool
  w4_ends_with_citation bool
  w5_scope_opener bool
  w6_inside_list_or_before_reason bool
  decision "keep" | "split" @description("keep when any W answer is true, when after_split_subject is none, or when pronouns_after_split is not empty")
  result string @description("The sentence as your answer will hold it")
}

class RewriteResult {
  checks SplitCheck[]? @description("Step 1: one check for each sentence a finding names, written before markdown")
  markdown string @description("The whole block after your edit, as one paragraph")
}

function RewriteBlock(
  block_type: string,
  block_markdown: string,
  findings: RewriteFinding[],
  flagged_sentences: string[],
  nearby: RewriteContext,
  tokens: RewriteToken[],
  // Kept for callers. List form is off: the sweep always sends false, and the prompt never uses it.
  allow_list: bool
) -> RewriteResult {
  // Runtime calls replace this client through ClientRegistry. It serves `baml-cli test`.
  client LunaLB
  prompt #"
    {{ _.role("system") }}
    You are a copy editor for technical documentation. You get one block from a documentation page and the style findings it failed. You make the smallest sentence-level edit that fixes the findings, or you return the block unchanged. Your answer is always the whole block as one paragraph: no bullets and no line breaks.

    STEP 1: CHECK EACH SENTENCE BEFORE YOU EDIT IT
    Write "checks" first: one check for each sentence a finding names. When no sentence is flagged, check each sentence that has the problem the finding names. Fill the fields of a check in order:
    - "split_at": the place a split would go, or "none".
    - "after_split": the words after that place, copied exactly.
    - "after_split_subject": the subject that opens after_split, copied exactly. Write "none" when after_split opens with a verb, a participle, a preposition, "which", or a pronoun you would have to add.
    - "pronouns_after_split": every it, its, they, them, their, this, these, or those in after_split.
    - The W questions, each true or false:
    W1. Does the sentence have fewer than 15 words?
    W2. Is it a short contrast, such as "X, not Y"?
    W3. Does it hold a colon that introduces a list, a table, a code block, or a counted set, such as "The fix has two halves:"? A colon belongs to the clause before it. A label colon (rule 3) does not count.
    W4. Does it end with a citation: a reference in parentheses, decision IDs such as "(D81–D84, State Model)", or "see X"? The citation must still cover the whole claim.
    W5. Does it open with a scope phrase that covers several clauses, such as "Among sections,", "In this notation,", or "If X,"?
    W6. Does the split point fall inside a list or a series of three or more items ("A, B, and C"), or between a claim and its reason, condition, or example?
    - "decision": "keep" when any W answer is true, when after_split_subject is "none", or when pronouns_after_split is not empty. Otherwise "split". A pronoun cut off from its noun by a split has an unclear antecedent, and a subject repeated word for word ("Phase 1 keeps the scripts. Phase 1 adds a check.") or a pronoun you add is not a subject of its own.
    - "result": the sentence as your answer will hold it. "keep" means no split: the sentence is never split, never joined, and never reworded around its dash, colon, or semicolon. Its result is the sentence unchanged, or the sentence with a fix that needs no split, such as a verb form.
    Then write "markdown": the block with each checked sentence replaced by its result, and every other sentence copied exactly. If every result is unchanged, the markdown is the block unchanged.

    STEP 2: EDIT BY THESE RULES
    These rules win over the fix line of a finding when the two conflict.
    1. Change only the flagged sentences. Copy every other sentence exactly, character for character.
    2. Change sentence structure only. Keep the author's words: terms, names, and phrasing. Never swap a word for a synonym: "AI" stays "AI". Change a word only when a structure fix forces it, such as a verb form for the active voice.
    3. Keep a leading label exactly as written. A label is a word or short phrase plus a colon at the start of the block, such as "Decision:", "Why:", "Applies to:", "Rejected:", or "Source:". The label stays first, and only the text after it can change. Never drop it, and never fold it into the sentence, as in "The decision is to". The word after the label keeps its case: "Why: the" stays lowercase. A rejected alternative keeps the form "Rejected: <alternative>, because <reason>."
    4. Keep every fact, number, name, condition, and limit.
    5. Keep every quantifier, negation, and modal exactly, next to the words it limits: all, every, each, any, some, most, only, not, never, no, none, must, can, should, may, might, will, would, could, need, if, unless, except.
    6. Keep every connector attached to the same two clauses: because, since, so, but, while, although, though, whereas, however, therefore, thus, unless, until, including, such as, for example. Never add "including", "such as", or "for example": they turn a complete list into a partial one.
    7. A reason or an example stays where it is. Never move a reason into parentheses, and never turn an aside into a standalone claim.
    8. Keep the subject of each claim, and keep who does what. Each action keeps its actor, its object, and the words that say where, with what, or through what.
    9. Keep every list exactly as the author wrote it: the same items, in the same order, in the same sentence. A series "A, B, and C" is a list, and so is a series of actions or clauses. Never add "and" before the last item of a list, never drop its final "and", never change how many items a list has, and never move an item out of its list.
    10. Keep every frequency or scope phrase where it is, such as "once per repository" or "only while choosing". Moving it changes what it covers.
    11. Keep the author's pronouns and determiners. Never replace "it", "they", or "this X" with a noun phrase, and never change "this area" to "the area". Never move a pronoun in front of the noun it points to.
    12. Never join two sentences into one, and never fold a sentence into another sentence or into parentheses. A paragraph with too many sentences stays as it is: list form is not allowed here.
    13. Keep every token, such as ⟦0⟧, exactly once and unchanged. A token stands for code, a link, or a page reference, and it reads as the text the token legend gives. You can move a token inside its sentence. Never change, drop, repeat, or spell out a token.
    14. Add no new claims, examples, adjectives, or connectors that state a new relation, and never repeat a claim.
    15. Do not write robust, seamless, crucial, powerful, or "it is important to note". Never add an em dash (—) or a semicolon (;).
    16. "Concise" means tighter words, not less content. Never drop information to make text shorter.
    17. Abstain when unsure. Make a fix only when it has zero risk to meaning. If no finding can be fixed with zero risk, return the whole block unchanged, character for character. An unchanged block is a safe answer: the sweep records it as "unchanged". A changed meaning is never a safe answer.

    DASHES, COLONS, AND SEMICOLONS
    - A full clause after a dash that makes a second claim becomes a new sentence, when its check says "split". "The cache speeds up reads — the index doubles memory use." becomes "The cache speeds up reads. The index doubles memory use." A dash before a reason, an example, or a summary never starts a new sentence (rule 7).
    - A paired aside goes in parentheses. "The check — a lint rule — runs first." becomes "The check (a lint rule) runs first."
    - A contrast set off by dashes ("— not X —") takes commas, because it is the point of the sentence, not an aside. "A failing test — not a user report — is where a bug shows up first." becomes "A failing test, not a user report, is where a bug shows up first."
    - A phrase after a dash that starts with "including", "such as", or "for example" takes a comma.
    - A phrase after a dash that continues the sentence but is not a full clause ("— and the retry loop") stays as it is: leave that sentence unchanged. After a comma, the phrase would read as one more list item, and a new sentence would repeat the subject.
    - Never turn a dash into a colon, even when a finding asks for one. Every other dash stays as it is.
    - A colon is allowed only before a list or an example, and never in a sentence that already has a colon. A sentence after "Applies to:", "Decision:", or another label already has its colon.
    - A semicolon becomes a period only when its check says "split". Never replace a semicolon with ", and": the "and" can stretch a condition or a limit over the next clause.

    SENTENCE TARGETS
    Fix each finding with these targets. Fix only what a finding names.
    - Split a long or joined sentence at a natural boundary: between two complete statements, each with its own subject.
    - An instruction has 20 words or fewer. A descriptive sentence has 25 words or fewer. A token, a number with its unit, and a parenthetical each count as one word.
    - Each sentence has one topic. Each instruction tells the reader to do one thing.
    - The condition comes before the instruction: "If the check fails, run it again." A frequency or scope phrase is not a condition: "Run this once per repository." stays as it is. A "because" clause is a reason, not a condition: keep it where it is, and never turn it into "if".
    - Use the active voice only when the text names the actor after "by". Example: "The page is checked by ⟦0⟧ and saved in ⟦1⟧." becomes "⟦0⟧ checks the page, and the page is saved in ⟦1⟧."
    - If no actor follows "by", keep the passive. Example: "The value is stored with the page in ⟦1⟧." stays as it is. A word after "in", "with", or "through" is not the actor. Never invent an actor, and never hide the verb in a noun, as in "undergoes review".
    - Use simple tenses ("runs", "ran") only for a progressive verb, and only when the meaning stays the same: "is growing" says a change is ongoing. Keep every perfect verb, such as "has read" or "nobody has written", as it is: it says a state holds now.
    - Every sentence you write starts with a capital letter or a token. Never start one with "And", "So", "But", "Or", or "Nor". The text after a label is not a new sentence: it keeps its case (rule 3).
    - A list item holds at most 2 sentences, and a paragraph holds at most 4. If a split would pass that limit, leave the sentence as it is. A long sentence is a smaller problem than a changed meaning.

    FORMAT
    - Keep each bold or italic mark on the same words. Add no new markdown: no backticks, links, bold, italic, bullets, or headings.
    - Use straight quotes and apostrophes (" and ').
    - Answer with the whole block as one paragraph, with its sentences in their original order and no line breaks. Never copy the <block> tags into your answer.

    {{ ctx.output_format }}

    {{ _.role("user") }}
    {% if block_type == "list-item" %}
    Block type: list-item. A list item holds at most 2 sentences.
    {% elif block_type == "paragraph" %}
    Block type: paragraph. A paragraph holds at most 4 sentences.
    {% else %}
    Block type: {{ block_type }}.
    {% endif %}

    <block type="{{ block_type }}">
    {{ block_markdown }}
    </block>

    <findings>
    {% for f in findings %}
    - rule: {{ f.rule_id }}
      problem: {{ f.message }}
      fix: {{ f.hint }}
      where: {{ f.target }}
    {% endfor %}
    </findings>

    <flagged_sentences>
    {% if flagged_sentences|length == 0 %}
    All sentences. The findings cover the whole block.
    {% endif %}
    {% for s in flagged_sentences %}
    {{ loop.index }}. {{ s }}
    {% endfor %}
    </flagged_sentences>
    {% if nearby.heading or nearby.parent or nearby.previous or nearby.next %}

    <context>
    This text surrounds the block. Read it for meaning only, and never copy it into your answer.
    {% if nearby.heading %}
    Section heading: {{ nearby.heading }}
    {% endif %}
    {% if nearby.parent %}
    Parent list item: {{ nearby.parent }}
    {% endif %}
    {% if nearby.previous %}
    Previous block: {{ nearby.previous }}
    {% endif %}
    {% if nearby.next %}
    Next block: {{ nearby.next }}
    {% endif %}
    </context>
    {% endif %}
    {% if tokens|length > 0 %}

    <token_legend>
    {% for t in tokens %}
    {{ t.token }} = {{ t.kind }}: {{ t.preview }}
    {% endfor %}
    </token_legend>
    {% endif %}

    Write "checks" first, one for each sentence a finding names, and fill every field in order. Then write the markdown from the results.
    Answer with the whole block as one paragraph.
    Reply with the JSON object only.
  "#
  // ^ "JSON" must appear in a user message: codex-lb turns system messages into Responses
  //   `instructions`, and OpenAI rejects json_object mode when no input message says "json".
}

// ---------------------------------------------------------------------------------------------
// Tests. Inline maps in args need commas between fields. A "\n" inside a Jinja string literal is
// not a newline here, so line checks use regex_match, where \n means a newline.
// ---------------------------------------------------------------------------------------------

test LongSentence {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown #"The sweep reads every page in the corpus. When a block fails a structure rule and the cheaper tiers cannot settle it, the pipeline sends that block to the rewrite model together with its findings, the nearby headings, and a legend that explains each protected token. The sweep stages the result as a proposal."#
    findings [
      {
        rule_id "ste.sentence-length",
        message "This descriptive sentence has 38 words. The limit is 25.",
        hint "Split the sentence at a second thought. Keep every fact.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      #"When a block fails a structure rule and the cheaper tiers cannot settle it, the pipeline sends that block to the rewrite model together with its findings, the nearby headings, and a legend that explains each protected token."#
    ]
    nearby {
      heading "Tier 3 Model Rewrite"
    }
    tokens []
    allow_list false
  }
  @@assert(unflagged_kept, {{ "The sweep reads every page in the corpus." in this.markdown and "The sweep stages the result as a proposal." in this.markdown }})
  @@assert(facts_kept, {{ "cannot" in this.markdown and "findings" in this.markdown and "headings" in this.markdown and "legend" in this.markdown }})
  @@assert(split_or_unchanged, {{ this.markdown|regex_match("^(?:[^.]*[.]){4,}") or this.markdown == "The sweep reads every page in the corpus. When a block fails a structure rule and the cheaper tiers cannot settle it, the pipeline sends that block to the rewrite model together with its findings, the nearby headings, and a legend that explains each protected token. The sweep stages the result as a proposal." }})
  @@assert(paragraph_form, {{ not (this.markdown|regex_match("\n")) }})
  @@assert(no_semicolon_or_dash, {{ ";" not in this.markdown and "—" not in this.markdown }})
  @@assert(subject_named, {{ not (this.markdown|regex_match("(?:^|[.!?] )(?:It|They|This|These|That|Which|Its|Their) ")) }})
}

// The semicolons separate the three checks the first clause counts, so the sentence may stay
// whole. A split must make periods, never ", and".
test SemicolonList {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "Each rewrite must pass three checks; every token comes back exactly once; each meaning word keeps its count; and the block shrinks by no more than 20%."
    findings [
      {
        rule_id "writing.semicolon",
        message "The block joins clauses with semicolons.",
        hint "Split at each semicolon.",
        target "the whole block"
      }
    ]
    flagged_sentences []
    nearby {
      heading "Rewrite Guardrails",
      previous "Tier 3 stages a rewrite only when the rewrite passes two checks."
    }
    tokens []
    allow_list false
  }
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
  @@assert(no_semicolon_unless_whole, {{ ";" not in this.markdown or "three checks; every token comes back exactly once" in this.markdown }})
  @@assert(semicolons_become_periods, {{ not (this.markdown|regex_match(", and (every|each)")) }})
  @@assert(facts_kept, {{ "must" in this.markdown and "exactly once" in this.markdown and "no more than 20%" in this.markdown }})
}

test TokensKept {
  functions [RewriteBlock]
  args {
    block_type "list-item"
    block_markdown "The proposal is staged by ⟦0⟧, and it is reviewed in ⟦1⟧ before it is accepted with ⟦2⟧."
    findings [
      {
        rule_id "ste.passive-voice",
        message "The sentence uses the passive voice three times.",
        hint "Name the actor and use the active voice. Keep the passive only when the text does not name the actor.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "The proposal is staged by ⟦0⟧, and it is reviewed in ⟦1⟧ before it is accepted with ⟦2⟧."
    ]
    nearby {
      parent "A change set groups proposals for review."
    }
    tokens [
      { token "⟦0⟧", kind "code", preview "docs_proposal_stage" },
      { token "⟦1⟧", kind "reference", preview "Review Panel" },
      { token "⟦2⟧", kind "code", preview "docs_proposal_accept" }
    ]
    allow_list false
  }
  @@assert(each_token_kept, {{ "⟦0⟧" in this.markdown and "⟦1⟧" in this.markdown and "⟦2⟧" in this.markdown }})
  @@assert(three_tokens_total, {{ this.markdown|regex_match("^[^⟦]*(?:⟦[0-9]+⟧[^⟦]*){3}$") }})
  @@assert(place_not_actor, {{ "in ⟦1⟧" in this.markdown }})
  @@assert(paragraph_form, {{ not (this.markdown|regex_match("\n")) }})
}

// A label stays first and unchanged when its sentence splits.
test LabelKeptInSplit {
  functions [RewriteBlock]
  args {
    block_type "list-item"
    block_markdown "Decision: The sweep stages each accepted rewrite as a proposal; a reviewer accepts or rejects each proposal in the review panel."
    findings [
      {
        rule_id "writing.semicolon",
        message "The item joins two clauses with a semicolon.",
        hint "Split at the semicolon.",
        target "the whole block"
      }
    ]
    flagged_sentences []
    nearby {
      heading "Review the Change Set"
    }
    tokens []
    allow_list false
  }
  @@assert(label_first, {{ this.markdown|regex_match("^Decision: The sweep stages each accepted rewrite as a proposal[.] ") }})
  @@assert(words_kept, {{ "accepts or rejects each proposal in the review panel" in this.markdown }})
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
  @@assert(no_semicolon, {{ ";" not in this.markdown }})
}

// A dash before "and" after a list: a comma would make the phrase one more list item, and a new
// sentence would repeat the subject, so the sentence stays as it is.
test DashAndAfterList {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "This page defines the contract for typing, insertion, selection, and movement — and the save loop that carries every edit out of the editor."
    findings [
      {
        rule_id "writing.no-em-dash",
        message "The block uses an em dash.",
        hint "Replace the em dash. Keep what follows it attached to the same words.",
        target "the whole block"
      }
    ]
    flagged_sentences []
    nearby {
      heading "Editing"
    }
    tokens []
    allow_list false
  }
  @@assert(not_a_list_item, {{ not (this.markdown|regex_match("movement, and the save loop")) }})
  @@assert(save_loop_kept, {{ "save loop that carries every edit out of the editor" in this.markdown }})
  @@assert(subject_once, {{ not (this.markdown|regex_match("This page.*This page")) }})
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
}

// The easy split points of this sentence are "so" and "and". A rewrite must not start a sentence
// with either: it splits elsewhere or keeps that clause in its sentence.
test SoAndTrap {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "The build runs on every push. The runner compares each test result with the stored baseline, so a test that changes its output fails the snapshot check and the pipeline retries the job on a larger machine."
    findings [
      {
        rule_id "ste.sentence-length",
        message "This descriptive sentence has 31 words. The limit is 25.",
        hint "Split the sentence at a second thought. Keep every fact.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "The runner compares each test result with the stored baseline, so a test that changes its output fails the snapshot check and the pipeline retries the job on a larger machine."
    ]
    nearby {
      heading "Snapshot Tests"
    }
    tokens []
    allow_list false
  }
  @@assert(no_conjunction_start, {{ not (this.markdown|regex_match("(?:^|[.!?] |\n- )(?:And|So|But|Or|Nor)[ ,]")) }})
  @@assert(split_or_unchanged, {{ this.markdown|regex_match("^(?:[^.]*[.]){3,}") or this.markdown == "The build runs on every push. The runner compares each test result with the stored baseline, so a test that changes its output fails the snapshot check and the pipeline retries the job on a larger machine." }})
  @@assert(unflagged_kept, {{ "The build runs on every push." in this.markdown }})
  @@assert(facts_kept, {{ "stored baseline" in this.markdown and "snapshot check" in this.markdown and "larger machine" in this.markdown }})
  @@assert(paragraph_form, {{ not (this.markdown|regex_match("\n")) }})
}

// A pair of dashes around an aside becomes parentheses, never commas: with commas, the aside
// reads as more items of a list.
test PairedDashesBecomeParentheses {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "The release manual — checklists and rollback scripts behind a ⟦0⟧ entry point — ships as a workspace package with no runtime source."
    findings [
      {
        rule_id "writing.no-em-dash",
        message "The block uses em dashes.",
        hint "Replace each em dash. Keep what the dashes set off attached to the same words.",
        target "the whole block"
      }
    ]
    flagged_sentences []
    nearby {
      heading "Packages"
    }
    tokens [
      { token "⟦0⟧", kind "code", preview "RUNBOOK.md" }
    ]
    allow_list false
  }
  @@assert(aside_in_parentheses, {{ "(checklists and rollback scripts behind a ⟦0⟧ entry point)" in this.markdown }})
  @@assert(no_dash, {{ "—" not in this.markdown }})
  @@assert(token_once, {{ this.markdown|regex_match("^[^⟦]*⟦0⟧[^⟦]*$") }})
}

// Rule 11: the author's "this area" stays "this area" when its sentence splits, never "the area".
test ThisAreaKept {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "The presentation layer and its two faces live under ⟦0⟧. Rendering and interaction behavior are owned by design; this area records how the layer is assembled."
    findings [
      {
        rule_id "writing.semicolon",
        message "The sentence joins two clauses with a semicolon.",
        hint "Split at the semicolon.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "Rendering and interaction behavior are owned by design; this area records how the layer is assembled."
    ]
    nearby {
      heading "Stage"
    }
    tokens [
      { token "⟦0⟧", kind "code", preview "stage/" }
    ]
    allow_list false
  }
  @@assert(this_area_kept, {{ "this area records how the layer is assembled" in this.markdown or "This area records how the layer is assembled" in this.markdown }})
  @@assert(no_the_area, {{ "the area" not in this.markdown and "The area" not in this.markdown }})
  @@assert(unflagged_kept, {{ "The presentation layer and its two faces live under ⟦0⟧." in this.markdown }})
  @@assert(no_semicolon_unless_unchanged, {{ ";" not in this.markdown or "design; this area" in this.markdown }})
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
}

// Rule 11: after a split, "it" would sit in a new sentence next to two nouns it could point to,
// so the sentence stays whole and "it" stays "it".
test UnclearPronounNotSplit {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "**Reset to default** loads a draft; **Save shared preferences** applies it to future takes across clients. Existing custom prompts remain unchanged until edited or reset."
    findings [
      {
        rule_id "writing.semicolon",
        message "The sentence joins two clauses with a semicolon.",
        hint "Split at the semicolon.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "**Reset to default** loads a draft; **Save shared preferences** applies it to future takes across clients."
    ]
    nearby {
      heading "Text Correction"
    }
    tokens []
    allow_list false
  }
  @@assert(it_kept, {{ "applies it to future takes across clients" in this.markdown }})
  @@assert(not_split, {{ "loads a draft; **Save shared preferences** applies it" in this.markdown }})
  @@assert(unflagged_kept, {{ "Existing custom prompts remain unchanged until edited or reset." in this.markdown }})
}

// Rule "stays whole": the colon after "two halves" bounds a counted set, so the sentence that
// holds it is never split, even though it is long.
test CountedSetColonKept {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "The fix has two halves: geometric reconciliation records the large section as the parent of the sections it actually contains, and the area tie-break makes larger same-depth sections sink even when they appear later in the objects array. The disk repair is ⟦0⟧, an idempotent transform in the migration tool."
    findings [
      {
        rule_id "ste.sentence-length",
        message "This descriptive sentence has 39 words. The limit is 25.",
        hint "Split the sentence at a second thought. Keep every fact.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "The fix has two halves: geometric reconciliation records the large section as the parent of the sections it actually contains, and the area tie-break makes larger same-depth sections sink even when they appear later in the objects array."
    ]
    nearby {
      heading "The Layering Bug"
    }
    tokens [
      { token "⟦0⟧", kind "code", preview "migrateSectionMembership" }
    ]
    allow_list false
  }
  @@assert(colon_sentence_whole, {{ "The fix has two halves: geometric reconciliation records the large section as the parent of the sections it actually contains, and the area tie-break makes larger same-depth sections sink even when they appear later in the objects array." in this.markdown }})
  @@assert(unflagged_kept, {{ "The disk repair is ⟦0⟧, an idempotent transform in the migration tool." in this.markdown }})
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
}

// Rule "stays whole": a block that ends with a colon introduces the table after it. The colon
// stays on the whole lead-in sentence, never on half of it.
test LeadInColonKept {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "Every glyph picker (the Shapes panel and the Inspector's Glyph and Icon fields) groups glyphs by category with brands last, and it searches labels, ids, and category names:"
    findings [
      {
        rule_id "ste.one-topic",
        message "The sentence joins two complete sentences.",
        hint "Split each sentence that joins two complete statements into two sentences, one topic each. Keep every fact and condition.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "Every glyph picker (the Shapes panel and the Inspector's Glyph and Icon fields) groups glyphs by category with brands last, and it searches labels, ids, and category names:"
    ]
    nearby {
      heading "Glyph Additions",
      next "A table of glyph categories and their counts."
    }
    tokens []
    allow_list false
  }
  @@assert(ends_with_colon, {{ this.markdown|regex_match(":$") }})
  @@assert(lead_in_whole, {{ this.markdown|regex_match("^[^.]*:$") }})
  @@assert(subject_once, {{ not (this.markdown|regex_match("Every glyph picker.*Every glyph picker")) }})
}

// Rule "stays whole": the citation at the end covers both clauses, so the sentence stays one
// sentence and keeps its semicolon.
test CitationSentenceWhole {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "Assembled context is *reference* material. The working picture and the conversation window are section ③, produced by the state model below; loaders that deliver working state retire into state as agents adopt the sidecar (D81–D84, ⟦0⟧)."
    findings [
      {
        rule_id "writing.semicolon",
        message "The sentence joins two clauses with a semicolon.",
        hint "Split at the semicolon.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "The working picture and the conversation window are section ③, produced by the state model below; loaders that deliver working state retire into state as agents adopt the sidecar (D81–D84, ⟦0⟧)."
    ]
    nearby {
      heading "Assembled Context"
    }
    tokens [
      { token "⟦0⟧", kind "reference", preview "State Model" }
    ]
    allow_list false
  }
  @@assert(citation_kept, {{ "(D81–D84, ⟦0⟧)." in this.markdown }})
  @@assert(claim_whole, {{ "produced by the state model below; loaders that deliver working state retire into state as agents adopt the sidecar (D81–D84, ⟦0⟧)." in this.markdown }})
  @@assert(unflagged_kept, {{ "Assembled context is *reference* material." in this.markdown }})
}

// Rule 12: the easy split repeats the subject word for word or starts with an added "It". With
// neither allowed, the sentence stays whole.
test RepeatedSubjectTrap {
  functions [RewriteBlock]
  args {
    block_type "paragraph"
    block_markdown "The release script builds the package from the tagged commit and uploads the signed archive to the staging bucket for the nightly smoke test."
    findings [
      {
        rule_id "ste.one-topic",
        message "The sentence joins two complete sentences.",
        hint "Split each sentence that joins two complete statements into two sentences, one topic each. Keep every fact and condition.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "The release script builds the package from the tagged commit and uploads the signed archive to the staging bucket for the nightly smoke test."
    ]
    nearby {
      heading "Release"
    }
    tokens []
    allow_list false
  }
  @@assert(subject_once, {{ not (this.markdown|regex_match("The release script.*The release script")) }})
  @@assert(no_added_pronoun, {{ not (this.markdown|regex_match("(?:^|[.!?] )(?:It|They|This|These|That|Which|Its|Their) ")) }})
  @@assert(facts_kept, {{ "tagged commit" in this.markdown and "signed archive" in this.markdown and "nightly smoke test" in this.markdown }})
  @@assert(one_paragraph, {{ not (this.markdown|regex_match("\n")) }})
}

// Rule 12, short form: a 13-word sentence never splits, and its three-noun subject is never
// written twice. The label keeps its form.
test ShortSentenceNotSplit {
  functions [RewriteBlock]
  args {
    block_type "list-item"
    block_markdown "**Why.** Servers, scripts, and tests consume the headless entries and must install without React."
    findings [
      {
        rule_id "ste.one-topic",
        message "The sentence joins two complete sentences.",
        hint "Split each sentence that joins two complete statements into two sentences, one topic each. Keep every fact and condition.",
        target "flagged sentence 1"
      }
    ]
    flagged_sentences [
      "**Why.** Servers, scripts, and tests consume the headless entries and must install without React."
    ]
    nearby {
      heading "Package Split"
    }
    tokens []
    allow_list false
  }
  @@assert(unchanged, {{ this.markdown == "**Why.** Servers, scripts, and tests consume the headless entries and must install without React." }})
}
