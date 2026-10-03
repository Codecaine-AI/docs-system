import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyOps, type DocDocument } from "@codecaine-ai/docs-model";
import { lintRules } from "@codecaine-ai/docs-model/lint";
import { styleRules } from "../rules";
import { oneTopicRule } from "../rules/one-topic";
import { passiveVoiceRule } from "../rules/passive-voice";
import { blockMarkdown } from "../text";
import { JudgeUnavailable, type Judge, type JudgeQuestion, type RuleLayer, type StyleFinding, type SweepResult } from "../types";
import { createFakeVerifier } from "../verify";
import { docHash, lintPage, loadCorpus, pickPilotPages, planStage, stageOps, sweep } from ".";
import { coreRule } from "./core-rules";
import { sectionBlockIds } from "./exempt";
import { judgedFinding } from "./tier2";
import { isTrigger, planRewrites } from "./tier3";
import {
  block,
  code,
  heading,
  jev,
  listItem,
  page,
  paragraph,
  recordingJudge,
  recordingRewriter,
  recordingVerifier,
  sameMeaning,
  splitClauses,
  stepsParagraph,
} from "./fixtures";

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** 32 words in its first sentence, over both sentence limits. The second sentence is clean. */
const longParagraph = (id: string) =>
  paragraph(
    id,
    "The sweep reads each page and runs ",
    code("lintStyle"),
    " on each block, then it writes the findings to one report, and a reviewer opens that report via the browser after the run ends. The report lists each finding.",
  );

/** Splits the long sentence of longParagraph into three, keeping every word and the token. */
const splitLong = (markdown: string) => markdown.replace(", then it", ". Then it").replace(", and a reviewer", ". A reviewer");

/** A passive sentence with a known actor, and its active form. Long enough to stay within the shrink limit. */
const PASSIVE = "The block is checked by the client before the sweep writes the report.";
const ACTIVE = "The client checks the block before the sweep writes the report.";

const textOf = (result: Awaited<ReturnType<typeof sweep>>, pageIndex: number, blockId: string) =>
  blockMarkdown(result.pages[pageIndex]!.after.blocks[blockId]);

const count = (findings: readonly StyleFinding[], ruleId: string) => findings.filter((finding) => finding.ruleId === ruleId).length;

// ---------------------------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------------------------

describe("sweep", () => {
  test("records each autofix as an accepted change and applies it to the page", async () => {
    const result = await sweep({ pages: [page("guide", paragraph("p", "Run the check in order to find broken links."))], deepPages: new Set() });
    const [change] = result.pages[0]!.changes;

    expect(change).toMatchObject({
      blockId: "p",
      kind: "autofix",
      status: "accepted",
      before: "Run the check in order to find broken links.",
      after: "Run the check to find broken links.",
      ops: [{ type: "updateBlock", blockId: "p", text: [{ insert: "Run the check to find broken links." }] }],
    });
    expect(change!.ruleIds).toContain("ste.replacement");
    expect(textOf(result, 0, "p")).toBe("Run the check to find broken links.");
    expect(count(result.pages[0]!.findings, "writing.filler")).toBe(1);
    expect(count(result.pages[0]!.findingsAfter, "writing.filler")).toBe(0);
  });

  test("rejects an autofix that makes a rule fire more often on its block", async () => {
    // "ensures" becomes "makes sure": safe in prose, but it adds a word to a sentence that has
    // exactly the 25 words a description may have.
    const full =
      "The sweep ensures that every page keeps its links, tables, and headings in one stable order after each change, so reviewers can compare both versions.";
    const result = await sweep({
      pages: [page("guide", paragraph("full", full), paragraph("p", "Run the check in order to find broken links."))],
      deepPages: new Set(),
    });

    expect(result.pages[0]!.changes).toMatchObject([
      { blockId: "full", kind: "autofix", status: "rejected", reason: "autofix added a finding: ste.sentence-length", ops: [] },
      { blockId: "p", kind: "autofix", status: "accepted" },
    ]);
    expect(result.pages[0]!.changes[0]!.produced).toBeUndefined();
    expect(textOf(result, 0, "full")).toBe(full);
  });

  test("never swaps a word that the page uses in a heading", async () => {
    // "Ensure" in a heading names the section, so neither the heading nor the prose under it changes.
    const result = await sweep({
      pages: [page("guide", heading("h", "Ensure That Builds Pass", 2), paragraph("p", "The check ensures that builds pass in order to ship."))],
      deepPages: new Set(),
    });

    expect(result.pages[0]!.changes.map((change) => [change.blockId, change.after])).toEqual([["p", "The check ensures that builds pass to ship."]]);
  });

  test("sends only structure triggers to the model, and never rewrites a block without one", async () => {
    const { rewriter, calls } = recordingRewriter((request) => splitLong(request.markdown));
    const result = await sweep({
      pages: [
        page(
          "guide",
          longParagraph("long"),
          paragraph("vocab", "The tool reads the file via the cache."),
          // A label-colon opener is a structure finding, but its fix is a restructure, not a rewrite.
          paragraph("label", "Note: the cache keeps reads fast."),
        ),
      ],
      judge: jev().judge,
      verifier: sameMeaning,
      rewriter,
    });
    const [swept] = result.pages;
    const ruleIdsOn = (findings: readonly StyleFinding[], blockId: string) =>
      findings.filter((finding) => finding.blockId === blockId).map((finding) => finding.ruleId);

    expect(calls.map((call) => call.request.markdown)).toEqual([
      "The sweep reads each page and runs ⟦0⟧ on each block, then it writes the findings to one report, and a reviewer opens that report via the browser after the run ends. The report lists each finding.",
    ]);
    const { request } = calls[0]!;
    // Only the long sentence may change. The clean sentence is pinned.
    expect(request.flaggedSentences).toEqual([
      "The sweep reads each page and runs ⟦0⟧ on each block, then it writes the findings to one report, and a reviewer opens that report via the browser after the run ends.",
    ]);
    // The "via" finding on the same text stays out of the request, but the report still shows it.
    expect(request.findings.map((finding) => finding.ruleId).sort()).toEqual(["ste.sentence-length", "writing.sentence-length"]);
    expect(ruleIdsOn(swept!.findings, "long")).toContain("ste.replacement");
    expect(ruleIdsOn(swept!.findingsAfter, "long")).toContain("ste.replacement");
    expect(ruleIdsOn(swept!.findings, "label")).toContain("structure.label-colon-opener");

    expect(swept!.changes).toMatchObject([{ blockId: "long", kind: "rewrite", status: "accepted" }]);
    expect(textOf(result, 0, "long")).toBe(
      "The sweep reads each page and runs `lintStyle` on each block. Then it writes the findings to one report. A reviewer opens that report via the browser after the run ends. The report lists each finding.",
    );
  });

  test("records a rewrite the model returned unchanged, with no guardrails, no retry, and no ops", async () => {
    // Jev flags one topic, and Tier 1 flags the semicolon: one topic alone starts no rewrite.
    const { judge } = recordingJudge((question) => (question.question === oneTopicRule.judge!.question ? 0.9 : 0));
    const { rewriter, calls } = recordingRewriter((request) => request.markdown);
    const text = "The server stores each page in the cache; the client renders the page after the fetch.";
    const result = await sweep({ pages: [page("guide", paragraph("p", text))], judge, verifier: sameMeaning, rewriter });

    expect(calls.map((call) => call.strength)).toEqual(["fast"]);
    expect(result.pages[0]!.changes).toMatchObject([
      { blockId: "p", kind: "rewrite", status: "unchanged", reason: "model returned the block unchanged", ops: [], ruleIds: ["writing.semicolon", "ste.one-topic"] },
    ]);
    expect(result.pages[0]!.changes[0]!.verdict).toBeUndefined();
    expect(textOf(result, 0, "p")).toBe(text);
  });

  test("rejects a lossy rewrite, retries once on the strong model, and keeps the block when both fail", async () => {
    const dropToken = (markdown: string) => markdown.replace(/⟦\d+⟧ /, "");
    const { rewriter, calls } = recordingRewriter((request, strength) =>
      // Block "retry" gets a faithful answer from the strong model. Block "lossy" never does.
      strength === "strong" && request.markdown.includes("retry") ? splitLong(request.markdown) : dropToken(request.markdown),
    );
    const retry = longParagraph("retry");
    retry.text![2] = { insert: retry.text![2]!.insert.replace("each finding", "each retry") };
    const result = await sweep({ pages: [page("guide", retry, longParagraph("lossy"))], judge: jev().judge, verifier: sameMeaning, rewriter });
    const changes = Object.fromEntries(result.pages[0]!.changes.map((change) => [change.blockId, change]));

    const strengths = (word: string) => calls.filter((call) => call.request.markdown.includes(word)).map((call) => call.strength);
    expect(strengths("each retry")).toEqual(["fast", "strong"]);
    expect(strengths("each finding")).toEqual(["fast", "strong"]);
    expect(changes.retry).toMatchObject({ status: "accepted" });
    expect(changes.retry!.attempts!.map((attempt) => [attempt.strength, attempt.accepted])).toEqual([
      ["fast", false],
      ["strong", true],
    ]);
    expect(changes.retry!.attempts![0]!.failed).toContain("tokens");

    expect(changes.lossy).toMatchObject({ status: "rejected", ops: [] });
    expect(changes.lossy!.attempts!.map((attempt) => [attempt.strength, attempt.failed.includes("tokens")])).toEqual([
      ["fast", true],
      ["strong", true],
    ]);
    expect(changes.lossy!.verdict!.accepted).toBe(false);
    expect(textOf(result, 0, "lossy")).toBe(blockMarkdown(longParagraph("lossy")));
  });

  test.each(["paragraph", "callout", "list-item"] as const)("refuses bullets in a rewrite of a %s, then retries on the strong model", async (type) => {
    // The fast model answers with a lead and a bullet. The strong model splits the sentence in place.
    const text = "The beta server stores each page; the client renders it.";
    const split = "The beta server stores each page. The client renders it.";
    const { rewriter, calls } = recordingRewriter((_, strength) =>
      strength === "fast" ? "The beta server stores each page.\n- The client renders it." : split,
    );
    const result = await sweep({ pages: [page("guide", block("b", type, text))], judge: jev().judge, verifier: sameMeaning, rewriter });
    const [change] = result.pages[0]!.changes;

    expect(calls.map((call) => call.request.allowList)).toEqual([false, false]);
    expect(change!.attempts!.map((attempt) => [attempt.strength, attempt.accepted])).toEqual([
      ["fast", false],
      ["strong", true],
    ]);
    expect(change).toMatchObject({ status: "accepted", after: split });
    expect(result.pages[0]!.after.blocks.b!.children).toEqual([]);
    expect(result.pages[0]!.after.blocks.root!.children).toEqual(["b"]);
  });

  test("runs Tier 1 and autofixes on every page, and Tiers 2 and 3 only on the deep pages", async () => {
    const { judge, questions } = recordingJudge(() => 0);
    const { rewriter, calls } = recordingRewriter((request) => splitClauses(request.markdown));
    const pageFor = (name: string) =>
      page(name, stepsParagraph("steps", name), paragraph("wordy", `Run the ${name} check in order to find broken links.`));
    const result = await sweep({ pages: [pageFor("alpha"), pageFor("beta")], deepPages: new Set(["alpha"]), judge, verifier: sameMeaning, rewriter });
    const [alpha, beta] = result.pages;

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.filter((question) => JSON.stringify(question.state).includes("beta"))).toEqual([]);
    expect(calls.map((call) => call.request.markdown.includes("alpha"))).toEqual([true]);
    expect(result.config.deepPages).toEqual(["alpha"]);

    expect(alpha!.deep).toBe(true);
    expect(alpha!.changes.map((change) => change.kind)).toEqual(["autofix", "rewrite"]);
    expect(beta!.deep).toBe(false);
    expect(count(beta!.findings, "writing.semicolon")).toBe(1);
    expect(beta!.changes.map((change) => [change.kind, change.status])).toEqual([["autofix", "accepted"]]);
    expect(textOf(result, 1, "wordy")).toBe("Run the beta check to find broken links.");
  });

  test("an exempt page gets no findings, no questions, and no changes", async () => {
    // exemptSections exempts the whole manifesto: it is written in a personal voice.
    const { judge, questions } = recordingJudge(() => 0.9);
    const { rewriter, calls } = recordingRewriter((request) => splitClauses(request.markdown));
    const manifesto = page("00-foundation/00-manifesto", stepsParagraph("steps", "first"), paragraph("wordy", "Run the check in order to find broken links."));
    // A title finding belongs to no block, and the whole-page exemption drops it too.
    manifesto.doc.title = "Manifesto; Draft";
    const result = await sweep({ pages: [manifesto], judge, verifier: sameMeaning, rewriter });

    expect(result.pages[0]).toMatchObject({ findings: [], findingsAfter: [], changes: [] });
    expect(questions).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("splits a semicolon finding by sentence, so a fix there may not touch the other sentences", async () => {
    // The fix splits the flagged sentence, but it also drops "Then it stops.", which had no finding.
    const { rewriter, calls } = recordingRewriter(() => "The tool reads the page and checks each block. The server stores each page. The client renders it.");
    const flagged = "The server stores each page; the client renders it.";
    const result = await sweep({
      pages: [page("guide", paragraph("p", `The tool reads the page and checks each block. ${flagged} Then it stops.`))],
      judge: jev().judge,
      verifier: sameMeaning,
      rewriter,
    });
    const [change] = result.pages[0]!.changes;

    expect(result.pages[0]!.findings.filter((finding) => finding.ruleId === "writing.semicolon")).toMatchObject([{ sentence: flagged }]);
    expect(calls[0]!.request.flaggedSentences).toEqual([flagged]);
    expect(change).toMatchObject({ status: "rejected", ops: [] });
    expect(change!.attempts!.every((attempt) => attempt.failed.includes("smallest-edit"))).toBe(true);
  });

  test("only sentence-level findings start a rewrite, and no request allows bullets", async () => {
    const { rewriter, calls } = recordingRewriter((request) => request.markdown);
    await sweep({
      pages: [
        page(
          "guide",
          paragraph("semicolon", "The beta server stores each page; the client renders it."),
          paragraph(
            "long",
            "The gamma server reads every page from the disk and then checks each block against the style rules before it writes one report for the reviewer to read later.",
          ),
          // These findings need a person: restructuring a block, or a tense that may carry meaning.
          ...listItem("items", "The delta step reads the page. It checks each block. It writes a report."),
          paragraph("sentences", "The epsilon tool starts. It reads the page. It checks the blocks. It writes a report. It stops."),
          paragraph("tense", "The zeta tool has written the report."),
        ),
      ],
      judge: jev().judge,
      verifier: sameMeaning,
      rewriter,
    });
    const asked = ["beta", "gamma", "delta", "epsilon", "zeta"].filter((word) => calls.some((call) => call.request.markdown.includes(word)));

    expect(asked).toEqual(["beta", "gamma"]);
    expect(calls.every((call) => call.request.allowList === false)).toBe(true);
  });

  test("reuses one outcome for identical blocks, so shared boilerplate reads the same on every page", async () => {
    const shared = "The theme server stores each page; the theme client renders each page.";
    const lossy = "The lossy server stores each page; the lossy client renders each page.";
    // The model drops a clause from the lossy text, so that rewrite is rejected on both attempts.
    const { rewriter, calls } = recordingRewriter((request) =>
      request.markdown.startsWith("The lossy") ? "The lossy server stores each page." : splitClauses(request.markdown),
    );
    const result = await sweep({
      pages: [page("a", paragraph("p", shared)), page("b", paragraph("p", shared)), page("c", paragraph("p", lossy)), page("d", paragraph("p", lossy))],
      judge: jev().judge,
      verifier: sameMeaning,
      rewriter,
    });
    const [a, b, c, d] = result.pages.map((swept) => swept.changes[0]!);
    const callsFor = (start: string) => calls.filter((call) => call.request.markdown.startsWith(start)).map((call) => call.strength);

    // Only the first occurrence of each text pays for model calls.
    expect(callsFor("The theme")).toEqual(["fast"]);
    expect(callsFor("The lossy")).toEqual(["fast", "strong"]);
    expect(a).toMatchObject({ status: "accepted" });
    expect(a!.reusedFrom).toBeUndefined();
    expect(b).toMatchObject({ status: "accepted", reusedFrom: "a#p", attempts: [], after: a!.after });
    expect(textOf(result, 1, "p")).toBe(textOf(result, 0, "p"));
    expect(c).toMatchObject({ status: "rejected" });
    expect(d).toMatchObject({ status: "rejected", reusedFrom: "c#p", attempts: [], reason: c!.reason });
    expect(textOf(result, 3, "p")).toBe(lossy);
  });

  test("never rewrites a block with a finding that holds it for a person", async () => {
    const { rewriter, calls } = recordingRewriter((request) => request.markdown);
    const result = await sweep({
      pages: [
        page(
          "guide",
          // "page. the save loop" is the em-dash cleanup damage that ste.broken-sentence holds.
          paragraph("held", "The editor saves the page. the save loop runs; the server stores it."),
          stepsParagraph("free", "free"),
        ),
      ],
      judge: jev().judge,
      verifier: sameMeaning,
      rewriter,
    });
    const held = result.pages[0]!.findings.filter((finding) => finding.blockId === "held").map((finding) => finding.ruleId);

    expect(held).toEqual(expect.arrayContaining(["ste.broken-sentence", "writing.semicolon"]));
    // Tier 3 ran: the free block with the same kind of finding went to the model.
    expect(calls.map((call) => call.request.markdown)).toEqual([blockMarkdown(stepsParagraph("free", "free"))]);
  });

  test("re-asks the Tier 2 question that started a rewrite about the rewritten block", async () => {
    // The semicolon is a second trigger: one topic alone starts no rewrite.
    const original = "The cache keeps each page in memory; the server writes each change to disk. The client reads it. The page loads fast.";
    const rewritten = "The cache keeps each page in memory. The server writes each change to disk. The client reads it. The page loads fast.";
    const { judge, questions } = recordingJudge((question) =>
      question.question === oneTopicRule.judge!.question && (question.state as { block: string }).block === original ? 0.9 : 0,
    );
    const { rewriter } = recordingRewriter(() => rewritten);
    const result = await sweep({ pages: [page("guide", paragraph("p", original))], judge, verifier: sameMeaning, rewriter });
    const oneTopicBlocks = questions.filter((question) => question.question === oneTopicRule.judge!.question).map((question) => (question.state as { block: string }).block);

    expect(oneTopicBlocks).toEqual([original, rewritten]);
    expect(result.pages[0]!.changes).toMatchObject([{ status: "accepted", ruleIds: ["writing.semicolon", "ste.one-topic"] }]);
  });

  test("a detect match that Jev overrules stays a finding but starts no rewrite", async () => {
    const passive = passiveVoiceRule.judge!.question;
    // Jev keeps the passive in the "server" page and overrules nothing else.
    const { judge } = recordingJudge((question) =>
      question.question === passive ? (JSON.stringify(question.state).includes("server") ? 0.1 : 0.9) : 0,
    );
    const { rewriter, calls } = recordingRewriter(() => ACTIVE);
    const result = await sweep({
      pages: [
        page("kept", paragraph("p", "The page is checked by the server before the sweep writes the report.")),
        page("fixed", paragraph("p", PASSIVE)),
      ],
      judge,
      verifier: sameMeaning,
      rewriter,
    });
    const [kept, fixed] = result.pages;
    const passiveFinding = (findings: readonly StyleFinding[]) => findings.find((finding) => finding.ruleId === passiveVoiceRule.id);

    expect(passiveFinding(kept!.findings)?.probability).toBe(0.1);
    expect(kept!.changes).toEqual([]);
    expect(passiveFinding(fixed!.findings)?.probability).toBe(0.9);
    expect(calls).toHaveLength(1);
    expect(fixed!.changes).toMatchObject([{ kind: "rewrite", status: "accepted" }]);
    expect(textOf(result, 1, "p")).toBe(ACTIVE);
  });

  test("when Jev is unavailable, Tiers 2 and 3 skip for the run, and detect matches stand", async () => {
    const asks: (readonly JudgeQuestion[])[] = [];
    const judge: Judge = {
      async ask(questions) {
        asks.push(questions);
        throw new JudgeUnavailable("TYPESAFE_API_KEY is not set.");
      },
    };
    const { rewriter, calls } = recordingRewriter(() => ACTIVE);
    const pages = [page("one", paragraph("p", PASSIVE)), page("two", paragraph("p", PASSIVE))];
    const result = await sweep({ pages, judge, verifier: sameMeaning, rewriter });

    expect(result.config).toMatchObject({
      judge: false,
      judgeError: "TYPESAFE_API_KEY is not set.",
      rewriteSkipped: "the fact check needs Jev",
    });
    for (const swept of result.pages) {
      const finding = swept.findings.find((f) => f.ruleId === passiveVoiceRule.id);
      expect(finding).toBeDefined();
      expect(finding!.probability).toBeUndefined();
      expect(swept.changes).toEqual([]);
    }
    // The first Tier 2 call finds Jev down. After that nothing asks Jev or the model.
    expect(asks).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  test.each([
    ["no judge", { verifier: sameMeaning }, "the fact check needs Jev"],
    ["no verifier", { judge: jev().judge }, "the meaning check needs a verifier"],
  ] as const)("skips Tier 3 with %s, and still runs Tier 1 and the autofixes", async (_, adapters, reason) => {
    const { rewriter, calls } = recordingRewriter((request) => splitClauses(request.markdown));
    const result = await sweep({
      pages: [page("guide", stepsParagraph("steps", "first"), paragraph("wordy", "Run the check in order to find broken links."))],
      rewriter,
      ...adapters,
    });

    expect(calls).toEqual([]);
    expect(result.config).toMatchObject({ rewriter: true, rewriteSkipped: reason });
    expect(result.config.judgeError).toBeUndefined();
    expect(result.pages[0]!.changes).toMatchObject([{ blockId: "wordy", kind: "autofix", status: "accepted" }]);
  });

  test("lands only the autofixes the verifier finds keep their meaning", async () => {
    // Sol objects to the "utilize" swap and accepts the "in order to" swap.
    const { verifier, compared } = recordingVerifier(({ before }) =>
      before.includes("utilize") ? [{ kind: "emphasis", before: "utilize", after: "use", why: "the fixture says so" }] : [],
    );
    const result = await sweep({
      pages: [
        page(
          "guide",
          heading("h", "Checks", 2),
          paragraph("swap", "The tool can utilize the cache."),
          paragraph("wordy", "Run the check in order to find broken links."),
        ),
      ],
      deepPages: new Set(),
      verifier,
    });
    const [swept] = result.pages;

    expect(compared).toContainEqual({
      before: "Run the check in order to find broken links.",
      after: "Run the check to find broken links.",
      blockType: "paragraph",
      heading: "Checks",
    });
    expect(swept!.changes).toMatchObject([
      { blockId: "swap", kind: "autofix", status: "rejected", reason: 'meaning check: emphasis: "utilize" became "use", the fixture says so', ops: [] },
      { blockId: "wordy", kind: "autofix", status: "accepted", verdict: { accepted: true, checks: [{ id: "meaning-equivalence", ok: true }] } },
    ]);
    expect(textOf(result, 0, "swap")).toBe("The tool can utilize the cache.");
    expect(textOf(result, 0, "wordy")).toBe("Run the check to find broken links.");
    expect(result.config.models).toContain("fake-verifier");
  });

  test("keeps an autofix out when the verifier cannot answer", async () => {
    const verifier = createFakeVerifier(() => {
      throw new Error("codex-lb is down");
    });
    const result = await sweep({ pages: [page("guide", paragraph("wordy", "Run the check in order to find broken links."))], deepPages: new Set(), verifier });

    expect(result.pages[0]!.changes).toMatchObject([{ status: "error", reason: "meaning check failed: codex-lb is down", ops: [] }]);
    expect(textOf(result, 0, "wordy")).toBe("Run the check in order to find broken links.");
  });
});

describe("rewrite triggers", () => {
  test("only six rules start a model rewrite; every other finding waits for a person", () => {
    const finding = (ruleId: string, source: StyleFinding["source"], layer: RuleLayer): StyleFinding => ({
      ruleId,
      source,
      layer,
      tier: 1,
      field: "text",
      message: "",
      evidence: "",
      hint: "",
    });
    const findings = [
      ...lintRules.map((rule) => finding(rule.id, "core", coreRule(rule.id).layer)),
      ...styleRules.map((rule) => finding(rule.id, "ste", rule.layer)),
    ];

    expect(findings.filter(isTrigger).map((f) => f.ruleId).sort()).toEqual([
      "ste.one-topic",
      "ste.passive-voice",
      "ste.sentence-length",
      "writing.no-em-dash",
      "writing.semicolon",
      "writing.sentence-length",
    ]);
  });

  test("one topic alone starts no rewrite, and stays among the triggers when a semicolon also fires", () => {
    const { path: pagePath, doc } = page(
      "guide",
      paragraph("alone", "The server stores each page in the cache, and the client renders the page after the fetch."),
      paragraph("joined", "The server stores each page in the cache; the client renders the page after the fetch."),
    );
    // Jev flags one topic in both blocks. Tier 1 flags the semicolon in "joined" only.
    const findings = [...lintPage(pagePath, doc), ...["alone", "joined"].map((id) => judgedFinding(doc, oneTopicRule, id, 0.9))];

    const jobs = planRewrites(pagePath, doc, findings);

    expect(jobs.map((job) => [job.block.id, job.triggers.map((finding) => finding.ruleId).sort()])).toEqual([
      ["joined", ["ste.one-topic", "writing.semicolon"]],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// stageOps
// ---------------------------------------------------------------------------------------------

describe("stageOps", () => {
  test("stages only the accepted changes, so rejecting the first change leaves its block as it was", async () => {
    const swept = page("guide", stepsParagraph("one", "first"), stepsParagraph("two", "second"), paragraph("x1", "The page ends."));
    const { rewriter } = recordingRewriter((request) => splitClauses(request.markdown));
    const result = await sweep({ pages: [swept], judge: jev().judge, verifier: sameMeaning, rewriter });
    // A stage step reads sweep.json, so stage from the JSON round trip.
    const [saved] = (JSON.parse(JSON.stringify(result)) as SweepResult).pages;
    expect(saved!.baseHash).toBe(docHash(swept.doc));

    // A person rejects the first rewrite and accepts the second.
    const staged = applyOps(swept.doc, stageOps(swept.doc, saved!, new Set(["guide#two"])));
    expect(staged.ok).toBe(true);
    const after = (staged as { doc: DocDocument }).doc;
    expect(after.blocks.root!.children.map((id) => blockMarkdown(after.blocks[id]))).toEqual([
      "The first tool reads the page; the first checker reviews each block; the first writer saves a report.",
      "The second tool reads the page. The second checker reviews each block. The second writer saves a report.",
      "The page ends.",
    ]);
  });
});

describe("planStage", () => {
  test("holds a rewrite whose block's autofix is not approved, because the rewrite text includes it", async () => {
    // "in order to" is autofixed first. The rewrite of the same block then splits the semicolons.
    const swept = page("guide", paragraph("p", "The tool reads the page in order to check it; the tool writes a report; the run stops."));
    const { rewriter } = recordingRewriter((request) => splitClauses(request.markdown));
    const result = await sweep({ pages: [swept], judge: jev().judge, verifier: sameMeaning, rewriter });
    const [saved] = result.pages;
    expect(saved!.changes.map((change) => [change.kind, change.status])).toEqual([
      ["autofix", "accepted"],
      ["rewrite", "accepted"],
    ]);

    expect(planStage(swept.doc, saved!, new Set(["guide#p"]))).toMatchObject({
      ops: [],
      staged: [],
      held: [{ key: "guide#p", reason: "its block's autofix is not approved, and the rewrite text includes it" }],
    });
    expect(planStage(swept.doc, saved!, new Set(["guide#p", "guide#p@autofix"])).staged).toEqual(["guide#p@autofix", "guide#p"]);
  });
});

// ---------------------------------------------------------------------------------------------
// lintPage and exempt sections
// ---------------------------------------------------------------------------------------------

describe("lintPage", () => {
  test("drops label-colon findings whose label is a role marker", () => {
    const { path: pagePath, doc } = page(
      "guide",
      paragraph("why", "Why: the cache keeps reads fast."),
      paragraph("applies", "Applies to: every page in the corpus."),
      paragraph("note", "Note: the cache keeps reads fast."),
    );
    const labels = lintPage(pagePath, doc).filter((finding) => finding.ruleId === "structure.label-colon-opener");

    expect(labels.map((finding) => finding.blockId)).toEqual(["note"]);
  });

  test("an exempt section runs from its heading to the next heading of the same or a higher level", () => {
    const { doc } = page(
      "guide",
      paragraph("intro", "The page starts here."),
      heading("example", "Worked Example", 2),
      paragraph("bad", "The quoted text is bad on purpose."),
      heading("sub", "The Original", 3),
      listItem("item", "A quoted list item.", ...listItem("child", "A nested quoted item.")),
      heading("next", "Review Checklist", 2),
      paragraph("after", "The page goes on here."),
    );

    expect([...sectionBlockIds(doc, "Worked Example")].sort()).toEqual(["bad", "child", "example", "item", "sub"]);
    expect(sectionBlockIds(doc, "*").size).toBe(Object.keys(doc.blocks).length);
  });
});

// ---------------------------------------------------------------------------------------------
// pickPilotPages
// ---------------------------------------------------------------------------------------------

describe("pickPilotPages", () => {
  const finding = (layer: StyleFinding["layer"]): StyleFinding => ({
    ruleId: "ste.fixture",
    source: "ste",
    layer,
    tier: 1,
    field: "text",
    message: "",
    evidence: "",
    hint: "",
  });
  const result = (pagePath: string, sentences: number, structure: number, vocabulary = 0) => ({
    path: pagePath,
    sentences,
    findings: [...Array(structure).fill(finding("structure")), ...Array(vocabulary).fill(finding("vocabulary"))],
  });
  const results = [
    result("10-system-design/a", 40, 20), // 50 per 100 sentences
    result("10-system-design/a2", 40, 20), // ties with a, so the path decides
    result("10-system-design/b", 20, 12), // 60
    result("10-system-design/short", 10, 9), // 90, but under 20 sentences
    result("40-guides/x", 30, 12), // 40
    result("40-guides/y", 30, 6, 30), // 20: vocabulary findings do not count
    result("00-foundation/z", 5, 1), // the only page in its section is short
    result("30-implementation/empty", 0, 0), // no sentences, never picked
    result("99-appendix/w", 25, 0),
    result("10-system-design/30-data-model/m", 20, 2),
  ];

  test.each([
    [3, ["10-system-design/b", "10-system-design/a", "10-system-design/a2", "00-foundation/z", "40-guides/x", "99-appendix/w", "10-system-design/30-data-model/m"]],
    // 40-guides/x and 40-guides/y are both among the 5 worst, so 40-guides adds no page.
    [5, ["10-system-design/b", "10-system-design/a", "10-system-design/a2", "40-guides/x", "40-guides/y", "00-foundation/z", "99-appendix/w", "10-system-design/30-data-model/m"]],
  ])("with n = %i, takes the n worst long pages, then the worst unchosen page of each diverse section", (n, expected) => {
    expect(pickPilotPages(results, n)).toEqual(expected);
  });

  test("gives the same pages for the same results in any order", () => {
    expect(pickPilotPages([...results].reverse(), 3)).toEqual(pickPilotPages(results, 3));
  });
});

// ---------------------------------------------------------------------------------------------
// loadCorpus
// ---------------------------------------------------------------------------------------------

describe("loadCorpus", () => {
  const roots: string[] = [];
  afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });

  test("reads every page under the root and skips dot folders, installs, and assets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "docs-style-corpus-"));
    roots.push(root);
    // Every file is a valid page, so a folder the walk should skip would show up as an extra path.
    const doc = (folder: string) =>
      JSON.stringify({ schemaVersion: 1, id: folder.replace(/^\./, "").replaceAll("/", ":"), root: "r", blocks: { r: { id: "r", type: "paragraph", props: {}, children: [] } } });
    for (const folder of ["b-page", "a-page", "a-page/child", ".changesets/backup/a-page", "a-page/assets", "node_modules/pkg"]) {
      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(path.join(root, folder, "doc.json"), doc(folder));
    }

    const pages = await loadCorpus(root);

    expect(pages.map((loaded) => [loaded.path, loaded.doc.id])).toEqual([
      ["a-page", "a-page"],
      ["a-page/child", "a-page:child"],
      ["b-page", "b-page"],
    ]);
  });
});
