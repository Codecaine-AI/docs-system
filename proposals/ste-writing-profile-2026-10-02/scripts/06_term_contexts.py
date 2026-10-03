#!/usr/bin/env python3
"""Count + short contexts for a curated list of coined/project terms (used to infer meanings)."""
import json, re, sys, collections
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

TERMS = {
    "Jev": r"\bjev\b", "Codecaine": r"\bcodecaine\b", "Agent Kernel / kernel": r"\b(agent[- ])?kernels?\b",
    "Prompt Kit": r"\bprompt[- ]?kit\b", "canvas": r"\bcanvas(es)?\b", "Sotto": r"\bsotto\b", "Spectre": r"\bspectre\b",
    "librarian": r"\blibrarian\b", "decomp harness": r"\bdecomp(ilation)?( harness)?\b", "epoch": r"\bepochs?\b",
    "tier": r"\btiers?\b", "target": r"\btargets?\b", "entity": r"\bentit(y|ies)\b", "tactic": r"\btactics?\b",
    "Terra": r"\bterra\b", "Luna": r"\bluna\b", "Astra": r"\bastra\b", "Sol": r"\bsol\b", "Fable": r"\bfable\b",
    "Opus": r"\bopus\b", "Codex LB": r"\bcodex[- ]?lb\b", "T3 / T3 Code": r"\bt3( code)?\b", "unslop": r"\bunslop\w*\b",
    "Curate/Kurate": r"\b[ck]urate\b", "CCBCU": r"\bcc[bp]cu\b", "review bench": r"\breview ?bench\b",
    "brand review": r"\bbrand review\b", "call flow agent": r"\bcall flow\b", "sales center": r"\bsales center\b",
    "company brain": r"\bcompany brain\b", "knowledge record": r"\bknowledge records?\b", "objective(s)": r"\bobjectives?\b",
    "goal mode": r"\bgoal mode\b", "AutoHDR": r"\bauto ?hdr\b", "MainMenu": r"\bmain ?menu\b", "Bubba": r"\bbubba\b",
    "Pi (agent)": r"\bpi\b", "BAML": r"\bbaml\b", "process outline": r"\bprocess outlines?\b",
    "state shape": r"\bstate shapes?\b", "interaction surface": r"\binteraction surfaces?\b", "flow strip": r"\bflow ?strips?\b",
    "call stack": r"\bcall stacks?\b", "component tree": r"\bcomponent trees?\b", "layout editor": r"\blayout[- ]editor\b",
    "source-scout": r"\bsource[- ]scout\b", "backfill": r"\bbackfill\w*\b", "importer agent": r"\bimporter\b",
    "resolver agent": r"\bresolver\b", "link finder": r"\blink finder\b", "gale report": r"\bgale\b",
    "translation unit / TU": r"\btranslation units?\b|\bTUs?\b", "blast radius": r"\bblast radius\b", "sidecar": r"\bsidecars?\b",
    "handoff": r"\bhand-?offs?\b", "lane": r"\blanes?\b", "thread (work lane)": r"\bthreads?\b", "skills": r"\bskills?\b",
    "knowledge network": r"\bknowledge network\b", "second brain": r"\bsecond brain\b", "context block": r"\bcontext blocks?\b",
    "style sidebar": r"\bstyle sidebar\b", "agent viewer / trace viewer": r"\b(agent|trace)s? viewer\b",
    "Astra/Terra/Luna effort": r"\b(on|at) (low|medium|high|xhigh)\b", "scorecard": r"\bscorecard\b",
    "Discord (KB source)": r"\bdiscord\b", "smash wiki": r"\bsmash wiki\b", "game concept": r"\bgame concepts?\b",
    "worker summarizer": r"\bsummarizer\b", "ste": r"\bSTE\b|asd-ste100|simplified technical english",
    "block vocabulary": r"\bblock vocabulary\b", "componentry": r"\bcomponentry\b", "doc.json": r"\bdoc\.json\b",
    "lint gate": r"\b(lint|quality) gates?\b", "pen plotter": r"\bpen plotter|axidraw\b",
}
msgs = load()
out = {}
for name, pat in TERMS.items():
    flags = 0 if name in ("translation unit / TU", "ste") else re.I
    rx = re.compile(pat, flags)
    c = 0; projs = collections.Counter(); ctx = []
    for m in msgs:
        t = clean(m["text"]).replace("\n", " ")
        f = list(rx.finditer(t))
        if not f: continue
        c += len(f); projs[m["project"]] += len(f)
        if len(ctx) < 4 and (not ctx or m["project"] != ctx[-1][0] or len(ctx) < 2):
            s = f[0]
            ctx.append((m["project"], t[max(0, s.start() - 80): s.end() + 80]))
    out[name] = {"count": c, "projects": dict(projs.most_common(4)), "contexts": ctx}
json.dump(out, open("/tmp/ste-research/raw/term_contexts.json", "w"), indent=1)
for k, v in out.items():
    print(f"### {k}  n={v['count']}  {list(v['projects'].items())[:3]}")
    for p, s in v["contexts"][:3]:
        print(f"    [{p[-18:]}] …{s}…")
