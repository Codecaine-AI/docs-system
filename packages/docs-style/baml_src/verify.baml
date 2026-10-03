// Meaning verifier: decides whether AFTER says exactly what BEFORE says, in both directions.
//
// The sweep asks it about every change before the change can be staged (src/verify). A strong
// model at medium reasoning reads both texts. The answer is a strict JSON object: every difference
// it finds, then same, which is true only when it finds none.
//
// Texts are inline markdown. Link and reference targets show inline, such as [label](ref:path).
// A multi-block AFTER is a lead line plus "- " bullet lines, with "  - " for a sub-bullet.
//
// Prompt layout: the static rules sit in the system message and the two texts come last.
// Run the tests: bunx baml-cli test --from baml_src -i "CompareMeaning::" (codex-lb must be up).

class MeaningDiff {
  kind string @description("fact, number, name, condition, limit, modality, scope, relation, reference, hierarchy, emphasis, added, or other")
  before string @description("The exact words in BEFORE, or empty when AFTER adds something")
  after string @description("The exact words in AFTER, or empty when AFTER drops something")
  why string @description("One sentence: what a reader of one text believes that a reader of the other does not")
}

class MeaningCheck {
  differences MeaningDiff[]
  same bool @description("true only when differences is empty")
}

function CompareMeaning(before: string, after: string, block_type: string, heading: string?) -> MeaningCheck {
  // Runtime calls replace this client through ClientRegistry. It serves `baml-cli test`.
  client SolVerifyLB
  prompt #"
    {{ _.role("system") }}
    You are a meticulous technical editor. You decide whether AFTER says exactly what BEFORE says.

    BEFORE is one block of a documentation page. AFTER is an edit of it that fixes style: shorter sentences, no dashes or semicolons, and sometimes bullets. The wording and the sentence boundaries can differ, but the meaning cannot. A reader who sees only AFTER must believe exactly what a reader who sees only BEFORE believes: nothing lost, nothing added, and nothing attached to a different claim.

    Check both directions.
    - BEFORE to AFTER: everything BEFORE states, implies, or links is still in AFTER, with the same strength, the same reach, and the same links.
    - AFTER to BEFORE: everything AFTER states, implies, or links is already in BEFORE.

    Name every difference of these kinds:
    1. fact, number, name: facts, numbers, names, identifiers, paths, and code.
    2. condition, limit: conditions, limits, quantifiers (all, every, each, any, some, most, only, none, no), and negation.
       - Reach: a condition, a limit, a negation, or a qualifier ("only", "never", "by default", "when the host allows it") covers certain words. Joining two sentences or clauses can stretch it over more words: ", and" can stretch "only while the panel is open" over the next clause. A merge that moves a qualifier to the end of a longer sentence can make it qualify the phrase next to it instead: "By default, that folder is the shared theme at ~/themes." says which folder is the default, but "the active folder, which is the shared theme at ~/themes by default" can say the path is the default. Splitting can cut words off from a qualifier that covered them. Each change of reach is a difference.
       - A frequency or scope phrase ("once per project", "only in drafts", "for each page") covers the words next to it. If AFTER moves it to another sentence or another position, it can cover something else: a difference.
    3. modality: must, can, should, may, might, will, would, could, need, and any change of tense or aspect: "is growing" is ongoing but "grows" is a general truth, and "has shipped" or "has written" says a state holds now but "shipped" or "wrote" points to a past event.
    4. scope: what a list includes, what a phrase modifies, what is an example, and what a label covers.
       - Count the items of every list in BEFORE and in AFTER. A list that gains, loses, merges, or splits items is a difference: an "and" added that closes the list early, a phrase that joins the list, or an item that moves out of the list into another sentence or bullet.
       - After a list, ", and" can make the next phrase one more list item. "This page covers reads, writes, and deletes — and the retry loop that wraps them" names the retry loop as a separate topic, but "This page covers reads, writes, and deletes, and the retry loop that wraps them" lists it as a fourth item.
       - "including", "includes", or "such as" turns a complete list into a partial one, or turns separate items into parts of one thing.
       - A series that BEFORE writes with no "and" before its last item can mean that the later items describe the first one. Adding "and" makes every item a separate member: a difference.
       - An example, an aside, or a gloss that now attaches to a different word, or now covers more or fewer things, is a difference.
       - A pair of dashes around a gloss or a list that describes the noun before it ("The kit — two scripts and a guide — ships as one package") keeps the gloss inside that noun. A pair of commas in its place makes the gloss read as more list items ("The kit, two scripts and a guide, ships" can list three things): a difference.
    5. relation: cause, reason, purpose, contrast, concession, sequence, dependency, and identity (X is Y) between ideas.
       - A dropped or swapped connector (because, since, so, but, while, although, though, whereas, however, therefore, thus, unless, until) changes a relation. An added connector changes it only when it states a relation that BEFORE does not.
       - A dash, a colon, or an apposition that says what something is ("Each step runs once — the queue's core guarantee") links the two parts. If AFTER states them as two claims with no link, the link is lost.
       - A reason or a consequence that a semicolon or "and" joins to a "because" clause is part of that reason. If AFTER moves it into a separate sentence or bullet that no longer says it is a reason, the link is lost.
       - A connector after two joined clauses covers both: in "A, and B, so C", C follows from A and B. If a split leaves the connector with only one clause ("A. B, so C"), the other clause loses its consequence or reason.
       - A colon attaches what follows it to the clause right before it, and a list after a colon names or defines the parts of that clause ("The guide maps the API to the code: how calls route, how errors return, and why retries exist"). If AFTER moves the list into a new sentence with its own verb ("It explains how calls route, ..."), puts a new clause before the colon ("It is registered once per panel: A, B, C"), or replaces the colon with "with" or "including", the list no longer defines the same clause: a difference.
       - A dash gloss at the end of a sentence ("— the same check, run earlier") can describe the whole sentence or its main subject. A colon in its place attaches the gloss to the clause right before the colon, which can be a different thing: a difference when the gloss now describes something else.
       - A split that leaves a fragment with no main verb ("No retries, because the job is idempotent.") can read as a general rule that covers more than BEFORE said: a difference.
       - An "and" or "but" after a dash that marks a turn the author stresses carries emphasis, and a plain sentence break loses it.
    6. reference: a pronoun or a pointing word (it, they, this, these, that, each, its, their, one) must point to the same noun in AFTER as in BEFORE. If AFTER moves it before its noun, cuts it off from its noun into another sentence or bullet, or puts a nearer noun between them that it could point to, a reader can take a different referent: a difference.
    7. hierarchy: in AFTER, a "- " line is a bullet under the lead line, and an indented "  - " line is a sub-bullet under the bullet above it. A bullet reads as a detail of its parent.
       - A bullet about the parent's own subject that adds a detail, a part, or a consequence of the parent's claim is fine.
       - A statement with a different subject (another component, a general rule, another case, an alternative), or a peer fact that BEFORE gave equal rank, reads as a sub-point of its parent when it is nested, and its scope narrows to the parent. That is a hierarchy difference.
       - A reason, a cause, a condition, or an example that becomes a sibling bullet of the claim it belongs to loses its link.
    8. emphasis: emphasis or attribution that changes a claim.
       - A role label at the start ("Decision:", "Why:", "Applies to:", or a noun phrase that ends in a colon) that becomes an actor or a subject, or disappears.
       - A noun phrase at the start that names or defines the item ("A whole page by path;", "Draft mode —") that becomes the subject of the next claim, or loses its separator, so the definition is lost.
       - A contrast or a key point set off by dashes ("— not a manual check —") is the point of the sentence. Parentheses turn it into an aside: a difference.
    9. added: any claim, example, adjective, adverb, hedge, or intensifier that AFTER adds, and any sentence that repeats a claim.
    A new ambiguity is a difference when a careful reader of AFTER would likely take a meaning that BEFORE does not allow.

    These are not differences:
    - Punctuation changes, and sentence splits that keep every relation, reach, and referent.
    - A dash, semicolon, or colon replaced by a period, a colon, or parentheses, when the link between the parts stays as clear as before and every condition keeps its reach.
    - A gloss turned into a sentence with a plain verb (is, are, means, describes, covers, defines) that keeps the gloss attached to the same subject and keeps a complete list complete.
    - A repeated noun in place of a pronoun, with the same referent.
    - Active voice in place of passive voice, with the same actor.
    - A condition moved before the instruction it guards, when it still guards the same words.
    - A sub-bullet that adds a detail, a part, or a consequence about its parent's own subject.
    - Markdown marks, straight or curly quotes, and capitalization.

    Read every word of both texts before you answer. List each difference once, with the exact words from BEFORE and AFTER. same is true only when the list is empty. List a change when it plausibly changes what a careful reader believes, not merely because the words changed.

    {{ ctx.output_format }}

    {{ _.role("user") }}
    Block type: {{ block_type }}
    {% if heading %}
    Section heading: {{ heading }}
    {% endif %}

    <before>
    {{ before }}
    </before>

    <after>
    {{ after }}
    </after>

    Compare AFTER with BEFORE in both directions. Reply with the JSON object only.
  "#
}

// ---------------------------------------------------------------------------------------------
// Tests: one faithful split, and three calibration-set meaning changes the verifier must catch.
// ---------------------------------------------------------------------------------------------

test FaithfulSplit {
  functions [CompareMeaning]
  args {
    before "The sweep reads every page and runs every rule on each block; the report lists each finding with its rule and its page."
    after "The sweep reads every page and runs every rule on each block. The report lists each finding with its rule and its page."
    block_type "paragraph"
  }
  @@assert(same, {{ this.same and this.differences|length == 0 }})
}

test IncludingNarrowsScope {
  functions [CompareMeaning]
  args {
    before "The Bun-side package deriving inbound-reference lookup from document bundles and canvas sidecars — SQLite storage, reference-path identity, docs-root confinement, and move-time fixup. Source: `packages/docs-index`."
    after "The Bun-side package derives inbound-reference lookup from document bundles and canvas sidecars, including SQLite storage, reference-path identity, docs-root confinement, and move-time fixup. Source: `packages/docs-index`."
    block_type "paragraph"
  }
  @@assert(different, {{ not this.same and this.differences|length > 0 }})
}

test ReasonBecomesSiblingBullet {
  functions [CompareMeaning]
  args {
    before "Why: Hash preconditions, validation, undo, and change events stay consistent only when there is exactly one guarded critical section. Client-side writes and parallel write paths were rejected — a second path would bypass those guarantees and give agents a weaker authority."
    after #"Why: Hash preconditions, validation, undo, and change events stay consistent only when there is exactly one guarded critical section.
- Client-side writes and parallel write paths were rejected.
- A second path would bypass those guarantees and give agents a weaker authority."#
    block_type "list-item"
  }
  @@assert(different, {{ not this.same and this.differences|length > 0 }})
}

// A dash before "and" after a list became a comma, so the next phrase reads as one more list item.
test CommaJoinsList {
  functions [CompareMeaning]
  args {
    before "The block contract: every type owns its state schema, typed actions, doc renderer, agent renderer, and theme — and the path for adding a custom component."
    after "The block contract: every type owns its state schema, typed actions, doc renderer, agent renderer, and theme, and the path for adding a custom component."
    block_type "list-item"
  }
  @@assert(different, {{ not this.same and this.differences|length > 0 }})
}

