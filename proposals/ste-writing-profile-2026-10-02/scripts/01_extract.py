#!/usr/bin/env python3
"""Extract genuine human-typed user messages from Claude Code transcripts.

Streams ~/.claude/projects/<project>/<session>.jsonl line by line.
Subagent transcripts live in <session>/subagents/*.jsonl and are skipped
(glob is one level deep); isSidechain:true entries are also skipped.

Output: /tmp/ste-research/raw/messages.jsonl  (one deduped message per line)
        /tmp/ste-research/raw/extract_stats.json
"""
import glob, json, os, re, hashlib, collections

ROOT = os.path.expanduser("~/.claude/projects")
OUT = "/tmp/ste-research/raw/messages.jsonl"
STATS = "/tmp/ste-research/raw/extract_stats.json"

# Harness-injected tag blocks, removed with their contents.
INJECTED_TAGS = [
    "system-reminder", "task-notification", "command-name", "command-message",
    "command-args", "local-command-stdout", "local-command-stderr",
    "local-command-caveat", "bash-input", "bash-stdout", "bash-stderr",
    "user-prompt-submit-hook", "create-pr-command", "cross-session-message",
    "teammate-message", "ide_opened_file", "ide_selection", "ide_diagnostics",
    "tool_use_error", "persisted-output", "user-memory-input", "t3_context", "context",
]
TAG_RE = re.compile(r"<(%s)\b[^>]*>.*?</\1\s*>" % "|".join(map(re.escape, INJECTED_TAGS)), re.S)
LONE_TAG_RE = re.compile(r"</?(%s)\b[^>]*>" % "|".join(map(re.escape, INJECTED_TAGS)))
PASTE_RE = re.compile(r"<pasted_content[^>]*>(.*?)</pasted_content[^>]*>", re.S)
IMG_RE = re.compile(r"\[(Image|Attached (image|file))[^\]]*\]")
# secrets/ids: long mixed alnum tokens, key-like prefixes, emails
SECRET_RE = re.compile(r"\b(?=[A-Za-z0-9_\-]*\d)(?=[A-Za-z0-9_\-]*[A-Za-z])[A-Za-z0-9_\-]{24,}\b|\b(sk|pk|ghp|gho|xox[abp]|whsec|hmac)[-_][A-Za-z0-9_\-]{8,}|[\w.+-]+@[\w-]+\.[\w.]+")
SKIP_PREFIXES = (
    "This session is being continued from a previous conversation",
    "Base directory for this skill",
    "Caveat: The messages below were generated",
    "[Request interrupted",
    "Contents of /",
    "<task-notification",
)
DICTATION_MARKERS = re.compile(r"\b(like,|i guess|kind of|sort of|okay,|um\b|uh\b|whatnot|and such|or something)", re.I)


def looks_agent_written(t: str) -> bool:
    """Structured briefs/handoffs pasted from another agent, not dictated."""
    lines = t.splitlines()
    bullets = sum(1 for l in lines if re.match(r"\s*([-*•]|\d+[.)])\s", l))
    heads = sum(1 for l in lines if re.match(r"\s*#{1,4}\s", l))
    ticks = t.count("`")
    paths = len(re.findall(r"/Users/\w+/\S+", t))
    filler = len(DICTATION_MARKERS.findall(t))
    if heads >= 2 and filler == 0:
        return True
    if bullets >= 6 and ticks >= 6 and filler == 0:
        return True
    if paths >= 4 and filler == 0 and len(t) > 600:
        return True
    if re.search(r"(Working dir:|GIT LAYOUT|## Context|Acceptance criteria)", t) and filler == 0:
        return True
    if "▎" in t and filler == 0:
        return True
    # model-written handoff briefs: long, no speech filler, em-dashes/arrows/semicolons/backticks
    speech = len(SPEECH.findall(t))
    style = t.count("—") + t.count("→") + t.count(";") + ticks / 3
    if len(t) >= 700 and speech == 0 and style >= 3:
        return True
    return False


SPEECH = re.compile(r"\b(like,|i guess|kind of|sort of|okay,|um\b|uh\b|whatnot|and such|or something|gonna|i think|i want)", re.I)


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    return ""


def main():
    st = collections.Counter()
    seen = set()
    files = sorted(glob.glob(os.path.join(ROOT, "*", "*.jsonl")))
    st["session_files"] = len(files)
    with open(OUT, "w") as out:
        for f in files:
            project = os.path.basename(os.path.dirname(f))
            short = re.sub(r"^-Users-Ford-?", "", project) or "~"
            with open(f, errors="replace") as fh:
                for line in fh:
                    if '"type":"user"' not in line:
                        continue
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    if d.get("type") != "user":
                        continue
                    st["user_entries"] += 1
                    if "toolUseResult" in d or d.get("sourceToolUseID"):
                        st["skip_tool_result"] += 1; continue
                    if d.get("isSidechain"):
                        st["skip_sidechain"] += 1; continue
                    if d.get("isMeta") or d.get("isCompactSummary") or d.get("isVisibleInTranscriptOnly"):
                        st["skip_meta"] += 1; continue
                    origin = (d.get("origin") or {}).get("kind")
                    if origin in ("task-notification", "peer") or d.get("promptSource") == "system":
                        st["skip_notification_or_peer"] += 1; continue
                    content = d.get("message", {}).get("content")
                    if isinstance(content, list) and any(isinstance(p, dict) and p.get("type") == "tool_result" for p in content):
                        st["skip_tool_result"] += 1; continue
                    raw = text_of(content)
                    if not raw.strip():
                        st["skip_empty"] += 1; continue
                    if raw.lstrip().startswith(SKIP_PREFIXES):
                        st["skip_injected_prefix"] += 1; continue
                    t = TAG_RE.sub(" ", raw)
                    t = LONE_TAG_RE.sub(" ", t)
                    # pasted blocks: keep only ones that read as dictation
                    kind = "typed"
                    def paste_sub(m):
                        nonlocal kind
                        body = m.group(1).strip()
                        if (len(body) <= 4000 and not looks_agent_written(body)
                                and not body.startswith(("http://", "https://"))):
                            kind = "pasted-dictation"
                            st["paste_kept"] += 1
                            return " " + body + " "
                        st["paste_dropped"] += 1
                        return " "
                    t = PASTE_RE.sub(paste_sub, t)
                    t = IMG_RE.sub(" ", t)
                    t = SECRET_RE.sub("[REDACTED]", t)
                    t = re.sub(r"[ \t]+", " ", t).strip()
                    if len(t) < 2:
                        st["skip_empty_after_clean"] += 1; continue
                    if len(t) > 4000:
                        st["skip_long_paste"] += 1; continue
                    if looks_agent_written(t):
                        st["skip_agent_written"] += 1; continue
                    norm = re.sub(r"\W+", " ", t.lower()).strip()
                    h = hashlib.md5(norm.encode()).hexdigest()
                    if h in seen:
                        st["dupe"] += 1; continue
                    seen.add(h)
                    st["kept"] += 1
                    st["kept_" + kind] += 1
                    out.write(json.dumps({
                        "project": short, "session": os.path.basename(f)[:8],
                        "ts": d.get("timestamp"), "entrypoint": d.get("entrypoint"),
                        "kind": kind, "text": t,
                    }) + "\n")
    json.dump(st, open(STATS, "w"), indent=1)
    print(json.dumps(st, indent=1))


if __name__ == "__main__":
    main()
