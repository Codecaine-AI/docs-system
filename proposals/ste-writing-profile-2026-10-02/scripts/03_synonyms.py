#!/usr/bin/env python3
"""Count variants inside candidate synonym clusters; pick a short example quote per variant."""
import collections, json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

# cluster -> {variant label: regex}
CLUSTERS = {
    "documentation unit": {
        "doc": r"\bdocs?\b(?! system)(?!-system)", "page": r"\bpages?\b", "document": r"\bdocuments?\b",
        "bundle": r"\bbundles?\b", "file (md)": r"\b(markdown|md) files?\b", "article": r"\barticles?\b",
    },
    "docs product name": {
        "docs system": r"\bdocs[- ]system\b", "doc system": r"\bdoc system\b",
        "documentation system": r"\bdocumentation system\b", "docs tool(s)": r"\bdocs tools?\b",
    },
    "page building unit": {
        "component": r"\bcomponents?\b", "block": r"\bblocks?\b", "element": r"\belements?\b",
        "widget": r"\bwidgets?\b", "componentry": r"\bcomponentry\b",
    },
    "delegated agent": {
        "sub-agent / subagent": r"\bsub[- ]?agents?\b", "worker": r"\bworkers?\b",
        "agent (bare)": r"\bagents?\b", "thread": r"\bthreads?\b", "child agent": r"\bchild agents?\b",
    },
    "writing-quality check": {
        "lint": r"\blint(s|er|ers|ing)?\b", "check": r"\bchecks?\b", "rule": r"\brules?\b",
        "standard": r"\bstandards?\b", "guideline/guidance": r"\bguidelines?\b|\bguidance\b",
        "style guide": r"\bstyle guides?\b",
    },
    "verify step": {
        "confirm": r"\bconfirm(s|ed|ing)?\b", "check": r"\bcheck(s|ed|ing)?\b(?! out)", "verify": r"\bverif(y|ies|ied|ying)\b",
        "validate": r"\bvalidat(e|es|ed|ing|ion)\b", "QA": r"\bQA\b", "audit": r"\baudit(s|ed|ing)?\b",
        "review": r"\breview(s|ed|ing)?\b",
    },
    "model instructions": {
        "system prompt": r"\bsystem prompts?\b", "prompt (bare)": r"\bprompts?\b(?<!system prompt)",
        "instructions": r"\binstructions?\b", "context": r"\bcontext\b",
    },
    "execution record": {
        "trace": r"\btraces?\b", "log": r"\blogs?\b", "transcript": r"\btranscripts?\b",
        "history": r"\bhistory\b", "session": r"\bsessions?\b",
    },
    "one execution": {
        "run": r"\bruns?\b", "epoch": r"\bepochs?\b", "pass": r"\bpass(es)?\b", "attempt": r"\battempts?\b",
        "iteration": r"\biterations?\b", "cycle": r"\bcycles?\b",
    },
    "conversation unit": {
        "thread": r"\bthreads?\b", "session": r"\bsessions?\b", "conversation": r"\bconversations?\b",
        "chat": r"\bchats?\b",
    },
    "code container": {
        "repo": r"\brepos?\b", "repository": r"\brepositor(y|ies)\b", "codebase": r"\bcode ?base\b",
        "project": r"\bprojects?\b", "workspace": r"\bworkspaces?\b", "folder": r"\bfolders?\b",
        "directory": r"\bdirector(y|ies)\b",
    },
    "plan document": {
        "plan": r"\bplans?\b", "spec": r"\bspecs?\b", "objective": r"\bobjectives?\b", "brief": r"\bbriefs?\b",
        "handoff": r"\bhand-?offs?\b", "design doc": r"\bdesign docs?\b", "proposal": r"\bproposals?\b",
    },
    "page heading": {
        "header": r"\bheaders?\b", "heading": r"\bheadings?\b", "title": r"\btitles?\b",
        "subheader/subheading": r"\bsub-?head(er|ing)s?\b", "section": r"\bsections?\b",
    },
    "side UI region": {
        "sidebar": r"\bside ?bars?\b", "panel": r"\bpanels?\b", "pane": r"\bpanes?\b", "tab": r"\btabs?\b",
        "drawer": r"\bdrawers?\b", "rail": r"\brails?\b",
    },
    "list item": {
        "bullet / bullet point": r"\bbullets?( points?)?\b", "sub-bullet": r"\bsub-?bullets?\b",
        "list item": r"\blist items?\b", "list": r"\blists?\b",
    },
    "test of model output": {
        "eval": r"\bevals?\b", "evaluation": r"\bevaluations?\b", "test": r"\btests?\b", "judge": r"\bjudges?\b",
        "benchmark": r"\bbenchmarks?\b", "scorecard": r"\bscorecards?\b",
    },
    "data contract": {
        "state shape": r"\bstate shapes?\b", "state structure": r"\bstate structures?\b",
        "data shape": r"\bdata shapes?\b", "schema": r"\bschemas?\b", "data model": r"\bdata models?\b",
        "type": r"\btypes?\b",
    },
    "diagram surface": {
        "canvas": r"\bcanvas(es)?\b", "diagram": r"\bdiagrams?\b", "board": r"\bboards?\b",
        "chart": r"\bcharts?\b", "sequence diagram": r"\bsequence diagrams?\b",
    },
    "visual mockup": {
        "mockup": r"\bmock-?ups?\b", "prototype": r"\bprototypes?\b", "wireframe": r"\bwireframes?\b",
        "design": r"\bdesigns?\b", "preview": r"\bpreviews?\b",
    },
    "user-facing app": {
        "UI": r"\bUIs?\b", "viewer": r"\bviewers?\b", "app": r"\bapps?\b", "dashboard": r"\bdashboards?\b",
        "frontend": r"\bfront-?end\b", "interface": r"\binterfaces?\b",
    },
    "simplify text/code": {
        "clean up / cleanup": r"\bclean(ed|ing)? ?up\b|\bcleanup\b", "simplify": r"\bsimplif(y|ied|ies|ying)\b",
        "refactor": r"\brefactor(s|ed|ing)?\b", "unslop": r"\bunslop(ped|ping)?\b", "trim / cut": r"\b(trim|cut) (down|back)\b",
    },
    "connect parts": {
        "wire up": r"\bwire[ds]? ?up\b|\bwired\b", "hook up": r"\bhook(ed)? ?up\b", "integrate": r"\bintegrat(e|ed|es|ing|ion)\b",
        "connect": r"\bconnect(s|ed|ing)?\b", "tie in": r"\bt(ie|ying) (in|into)\b",
    },
    "start delegated work": {
        "spawn": r"\bspawn(s|ed|ing)?\b", "launch": r"\blaunch(es|ed|ing)?\b", "kick off": r"\bkick(ed)? ?off\b",
        "start": r"\bstart(s|ed|ing)?\b", "fan out": r"\bfan(ned)? ?out\b",
    },
    "ship change": {
        "push": r"\bpush(es|ed|ing)?\b", "merge": r"\bmerg(e|es|ed|ing)\b", "commit": r"\bcommit(s|ted|ting)?\b",
        "deploy": r"\bdeploy(s|ed|ing|ment)?\b", "land": r"\bland(s|ed)?\b", "ship": r"\bship(s|ped)?\b",
    },
    "change request": {"PR": r"\bPRs?\b", "pull request": r"\bpull requests?\b", "branch": r"\bbranch(es)?\b"},
    "reviewer feedback": {
        "annotation": r"\bannotations?\b", "comment": r"\bcomments?\b", "note": r"\bnotes?\b", "feedback": r"\bfeedback\b",
    },
    "reusable agent capability": {
        "skill": r"\bskills?\b", "tool": r"\btools?\b", "MCP": r"\bMCPs?\b", "command": r"\bcommands?\b", "plugin": r"\bplugins?\b",
    },
    "stored knowledge": {
        "knowledge base": r"\bknowledge bases?\b", "knowledge system": r"\bknowledge systems?\b",
        "knowledge graph": r"\bknowledge graphs?\b", "KB": r"\bKB\b", "facts": r"\bfacts?\b", "records": r"\brecords?\b",
    },
    "defect": {
        "bug": r"\bbugs?\b", "issue": r"\bissues?\b", "problem": r"\bproblems?\b", "broken": r"\bbroken\b", "error": r"\berrors?\b",
    },
    "configuration": {
        "set up / setup": r"\bset ?up\b|\bsetup\b", "configure / config": r"\bconfig(ure|ured|uration|s)?\b",
        "install": r"\binstall(s|ed|ing)?\b",
    },
    "model name in prompt": {
        "Opus": r"\bopus\b", "Fable": r"\bfable\b", "Codex": r"\bcodex\b", "Sonnet": r"\bsonnet\b",
        "GPT": r"\bgpt\b", "model": r"\bmodels?\b", "LLM": r"\bLLMs?\b",
    },
}

msgs = load()
sent_split = re.compile(r"(?<=[.!?])\s+|\n+")


def example(rx, used_projects):
    best = None
    for m in msgs:
        for s in sent_split.split(clean(m["text"])):
            mm = rx.search(s)
            if not mm:
                continue
            words = s.split()
            if len(words) < 5:
                continue
            # window of <=15 words around match
            pre = len(s[:mm.start()].split())
            lo = max(0, pre - 6); hi = min(len(words), lo + 15)
            q = " ".join(words[lo:hi]).strip(" ,;")
            score = (m["project"] in used_projects, abs(len(words) - 12), len(q))
            if best is None or score < best[0]:
                best = (score, q, m["project"])
    return best


out = {}
for cl, variants in CLUSTERS.items():
    res = {}
    used = set()
    for v, pat in variants.items():
        flags = 0 if v in ("UI", "QA", "PR", "KB", "MCP", "LLM") else re.I
        rx = re.compile(pat, flags)
        c = sum(len(rx.findall(clean(m["text"]))) for m in msgs)
        msgs_with = sum(1 for m in msgs if rx.search(clean(m["text"])))
        ex = example(rx, used) if c else None
        if ex: used.add(ex[2])
        res[v] = {"count": c, "messages": msgs_with, "example": ex[1] if ex else None, "project": ex[2] if ex else None}
    out[cl] = res
json.dump(out, open("/tmp/ste-research/raw/synonym_clusters.json", "w"), indent=1)
for cl, res in out.items():
    print("##", cl)
    for v, r in sorted(res.items(), key=lambda kv: -kv[1]["count"]):
        print(f"   {v:26s} {r['count']:5d} ({r['messages']} msgs)  {r['example']!r}")
