#!/usr/bin/env python3
"""Count curated technical terms grouped by domain (occurrences / messages / projects).
Plural and simple inflections are folded into the listed form."""
import json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

def rx(term):
    if term.startswith("re:"):
        return re.compile(term[3:], re.I)
    parts = [re.escape(p) for p in term.split()]
    last = parts[-1] + r"(s|es)?"
    return re.compile(r"\b" + r"[\s-]?".join(parts[:-1] + [last]) + r"\b", re.I)

DOMAINS = {
    "Agents and LLMs": [
        "agent", "re:\\bsub[- ]?agents?\\b|sub-agent", "worker", "prompt", "system prompt", "context", "context block",
        "context window", "model", "re:\\bLLMs?\\b", "opus", "fable", "codex", "luna", "terra", "jev", "tool", "tool call",
        "skill", "re:\\bMCPs?\\b", "spawn", "thread", "librarian", "orchestrator", "extractor", "summarizer", "classification",
        "structured output", "output shape", "eval", "evaluation", "judge", "trace", "transcript", "turn", "token",
        "reasoning", "harness", "agent kernel", "kernel", "re:\\bBAML\\b", "runner", "researcher",
    ],
    "Docs system": [
        "docs system", "re:\\bdoc system\\b", "re:\\bdocs?\\b", "page", "section", "diagram", "canvas", "block", "component",
        "custom component", "state shape", "state structure", "file tree", "sequence diagram", "process outline", "code block",
        "json block", "markdown", "bullet point", "re:\\bsub-?bullets?\\b", "re:\\bsub-?headers?\\b", "header", "heading",
        "writing style", "technical writing", "lint", "lint gate", "standard", "rule", "spec", "blog post", "table",
        "annotation", "callout", "re:\\bunslop\\w*", "doc.json", "readability",
    ],
    "UI and frontend": [
        "re:\\bUIs?\\b", "re:\\bUX\\b", "sidebar", "style sidebar", "tab", "panel", "viewer", "agent viewer", "trace viewer",
        "dashboard", "layout", "color", "icon", "border", "font", "font size", "dark mode", "light mode", "card", "click",
        "render", "rendering", "editor", "screen", "modal", "tooltip", "zebra striping", "drag and drop", "html", "frontend",
        "app", "electron", "mockup", "re:\\bmock-ups?\\b", "eyebrow", "theme", "styling",
    ],
    "Infra and tooling": [
        "re:\\bPRs?\\b", "pull request", "branch", "main branch", "commit", "push", "merge", "merge conflict", "repo", "sync",
        "local", "dev", "deploy", "server", "restart", "api", "api key", "codex lb", "database", "sqlite", "json", "config",
        "env", "chrome", "github", "port", "concurrency", "queue", "sandbox", "cron", "re:\\bbun\\b", "re:\\bUAT\\b",
        "endpoint", "webhook", "worktree", "submodule",
    ],
    "Code structure and data": [
        "state", "data", "data model", "type", "object", "function", "file", "folder", "structure", "schema", "entity", "record",
        "fact", "target", "knowledge base", "knowledge system", "knowledge record", "knowledge source", "field", "node",
        "event", "message", "ledger", "translation unit", "shape", "interface", "variable", "enum", "id", "metadata",
    ],
    "Process and workflow": [
        "run", "process", "review", "audit", "confirm", "verify", "re:\\bQA\\b", "test", "plan", "implementation", "implement",
        "phase", "step", "epoch", "backfill", "status update", "report", "research", "brainstorm", "handoff", "objective",
        "goal", "criteria", "feedback", "cleanup", "re:\\bclean(ed|ing)? ?up\\b", "blast radius", "re:\\bfan(ned)? out\\b",
        "parallel", "draft", "attempt", "pass", "milestone", "pipeline", "flow", "sweep",
    ],
}

msgs = load()
texts = [(m["project"], clean(m["text"])) for m in msgs]
out = {}
for dom, terms in DOMAINS.items():
    rows = []
    for t in terms:
        r = rx(t)
        c = 0; nm = 0; ps = set()
        for p, s in texts:
            k = len(r.findall(s))
            if k:
                c += k; nm += 1; ps.add(p)
        label = t[3:] if t.startswith("re:") else t
        label = {"\\bsub[- ]?agents?\\b|sub-agent": "sub-agent", "\\bLLMs?\\b": "LLM", "\\bMCPs?\\b": "MCP",
                 "\\bBAML\\b": "BAML", "\\bdoc system\\b": "doc system", "\\bdocs?\\b": "doc / docs",
                 "\\bsub-?bullets?\\b": "sub-bullet", "\\bsub-?headers?\\b": "subheader", "\\bunslop\\w*": "unslop",
                 "\\bUIs?\\b": "UI", "\\bUX\\b": "UX", "\\bmock-ups?\\b": "mock-up", "\\bPRs?\\b": "PR", "\\bbun\\b": "bun",
                 "\\bUAT\\b": "UAT", "\\bQA\\b": "QA", "\\bclean(ed|ing)? ?up\\b": "clean up (verb)",
                 "\\bfan(ned)? out\\b": "fan out"}.get(label, label)
        rows.append({"term": label, "count": c, "messages": nm, "projects": len(ps)})
    rows.sort(key=lambda r: -r["count"])
    out[dom] = rows
json.dump(out, open("/tmp/ste-research/raw/domain_terms.json", "w"), indent=1)
total = 0
for dom, rows in out.items():
    rows = [r for r in rows if r["count"] >= 3]
    total += len(rows)
    print(f"### {dom} ({len(rows)})")
    print(", ".join(f"{r['term']} {r['count']}/{r['projects']}p" for r in rows))
print("total terms", total)
