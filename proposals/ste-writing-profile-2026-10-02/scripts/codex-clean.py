"""Filter extracted user parts down to genuine human-typed messages.

Input : raw/codex-user-parts.jsonl  (from codex-extract.py)
Output: raw/codex-human.jsonl       (deduped human messages, text cleaned)
        raw/codex-clean-stats.json  (exclusion counts by reason)
"""
import json, re, collections, hashlib

IN = '/tmp/ste-research/raw/codex-user-parts.jsonl'
OUT = '/tmp/ste-research/raw/codex-human.jsonl'
AGENT_OUT = '/tmp/ste-research/raw/codex-agent-authored-sample.jsonl'
STATS = '/tmp/ste-research/raw/codex-clean-stats.json'

INJECT_PREFIXES = (
    '<environment_context', '<turn_aborted', '# AGENTS.md', '<goal_context', '<subagent_notification',
    '</image>', '<image', '<recommended_plugins', '<external_codex_apps', '<send_user_message_question',
    '<user_instructions', '<INSTRUCTIONS', '<skill', '<user_shell_command', '<permissions',
    '<codex_internal_context', '<collaboration_mode', '<system', '<developer', '<model_switch',
    '<personality', '<apps_instructions', '<plugins', '<t3_context', '<context', '<review',
    '<user_action', '<task_notification', '<hook', '<memory', '<auto_compact', '<compaction',
)
AGENT_MARKERS = [
    (re.compile(r'Use sub-agents\s*/\s*parallel execution', re.I), 'use-subagents-phrase'),
    (re.compile(r'^A previous agent produced the plan', re.I), 'previous-agent-plan'),
    (re.compile(r'^## Referenced ChatGPT conversation', re.I), 'chatgpt-reference'),
    (re.compile(r'^(You are (a|an|the|working)\b|Your (task|job|role) is\b)', re.I), 'you-are-opener'),
    (re.compile(r'^# (Task|Goal|Objective|Context|Shared context|Brief|Mission)\b', re.I), 'spec-heading-opener'),
    (re.compile(r'^(Repo|Repository root|Working directory|Workspace)\s*(\(cwd\))?:\s*/', re.I), 'repo-path-opener'),
    (re.compile(r'^Read /(private/)?tmp/claude', re.I), 'claude-tmp-handoff'),
    (re.compile(r'<goal>|&lt;goal&gt;'), 'goal-xml'),
]
SPEC_WORDS = re.compile(r'^(#{1,4} |\*\*[A-Z][^*]{2,40}:?\*\*|(Deliverables?|Acceptance criteria|Constraints|Non-goals|Success criteria|Requirements|Output|Scope|Context|Goal|Steps|Verification|Report back|Return)\s*:)', re.M)
VOICE = re.compile(r"\b(like,|whatnot|kind of|sort of|i think|i guess|gonna|wanna|you know|basically|essentially|um|uh|right now|and such|or something)\b", re.I)

REQ_MARK = re.compile(r'##\s*My request(?: for Codex)?:\s*\n', re.I)
IMG_TAG = re.compile(r'\[Image: [^\]]*\]')
T3CTX = re.compile(r'<t3_context[\s\S]*?</t3_context>')
ATTACHED = re.compile(r'\[Attached image [^\]]*\]')
GENERIC_BLOCK = re.compile(r'<(in-app-browser-context|environment_context|codex_internal_context)[\s\S]*?</\1>')
UI_BUTTONS = {'implement the plan.', 'implement the plan'}


def clean(text):
    m = REQ_MARK.search(text)
    if m:
        text = text[m.end():]
    text = T3CTX.sub('', text)
    text = GENERIC_BLOCK.sub('', text)
    text = IMG_TAG.sub('', text)
    text = ATTACHED.sub('', text)
    return text.strip()


HUMAN = re.compile(r"\b(okay|ok|yeah|like,|whatnot|kind of|sort of|i think|i guess|i feel|i'm|im|we're|gonna|wanna|you know|basically|essentially|actually|um|uh|right now|and such|or something|please|can you|could you|can we|could we|i want|i need|i'd like|i would like|let's|my idea|honestly)\b", re.I)
IMPERATIVE_OPEN = re.compile(r'^(\*\*)?(Run|Read|Continue|Implement|Help me|Build|Create|Add|Fix|Investigate|Audit|Review|Refactor|Migrate|Write|Port|Update)\b')
LABEL_LINE = re.compile(r'^\s*(\*\*)?[A-Z][\w /()-]{1,28}:(\*\*)?\s*$|^\s*(Context|Goal|Goals|Engine repo|Repo|Workspace|Scope|Constraints?|Deliverables?|Current state|Next steps?|Rules|Notes|Background|Task|Status)\s*:', re.M)


def agent_score(t):
    sc = 0
    if t.count('`') >= 8: sc += 1
    if '\u2014' in t or '\u2192' in t: sc += 1
    if len(re.findall(r'^\s*[-*] ', t, re.M)) >= 4: sc += 1
    if len(re.findall(r'\b(Do not|Don\'t|Never)\b', t)) >= 2: sc += 1
    if len(LABEL_LINE.findall(t)) >= 2: sc += 1
    if re.search(r'^#{1,4} ', t, re.M): sc += 1
    if IMPERATIVE_OPEN.match(t) and '/Users/' in t: sc += 1
    if re.match(r'^\*\*[^*]+\*\*', t): sc += 1
    return sc


def agent_reason(t):
    if re.match(r'^---\s*\nname:', t) or re.search(r'Interview (me|the user) relentlessly', t):
        return 'skill-prompt-paste'
    if t.startswith('PLEASE IMPLEMENT THIS PLAN'):
        return 'plan-mode-implement'
    if re.match(r'^Read-only report thread', t):
        return 'you-are-opener'
    for rx, name in AGENT_MARKERS:
        if rx.search(t[:3000] if name != 'use-subagents-phrase' else t):
            return name
    spec = len(SPEC_WORDS.findall(t))
    voice = len(VOICE.findall(t))
    if spec >= 3 and voice == 0 and len(t) > 600:
        return 'structured-spec'
    lead = t[:600]
    if len(t) > 250 and agent_score(t) >= 3 and len(set(m.lower() for m in HUMAN.findall(lead))) <= 1:
        return 'handoff-or-spec-heuristic'
    return None


FENCE = re.compile(r'```[\s\S]*?(```|$)')


def strip_pastes(t):
    """Drop fenced code, quoted lines, log/code-like lines, and pasted docs after a heading."""
    t = FENCE.sub(' ', t)
    out = []
    for ln in t.split('\n'):
        s = ln.strip()
        if re.match(r'^#{1,6} ', s) and out:
            break  # human lead followed by pasted markdown doc
        if s.startswith('>') or s.startswith('$ ') or s.startswith('(base)'):
            continue
        if s and sum(ch.isalpha() or ch.isspace() for ch in s) / len(s) < 0.7:
            continue
        if re.match(r'^\s*(at |File "|Traceback|Error:|error:|warning:|\[\d+:\d+)', ln):
            continue
        out.append(ln)
    return '\n'.join(out).strip()


def main():
    st = collections.Counter()
    seen = set()
    out = open(OUT, 'w')
    aout = open(AGENT_OUT, 'w')
    agent_seen = set()
    for line in open(IN):
        r = json.loads(line)
        raw = r['text']
        t0 = raw.lstrip()
        kind = r['kind']
        if kind in ('exec', 'agent_thread'):
            if t0.startswith(INJECT_PREFIXES):
                st[f'{kind}:injection'] += 1
                continue
            h = hashlib.md5(re.sub(r'\s+', ' ', t0.lower()).encode()).hexdigest()
            if h in agent_seen:
                st[f'{kind}:dup'] += 1
                continue
            agent_seen.add(h)
            st[f'{kind}:agent-authored-exec-prompt'] += 1
            if 'Use sub-agents' in t0:
                st['exec:with-use-subagents-phrase'] += 1
            continue
        # interactive
        if t0.startswith(INJECT_PREFIXES) and not REQ_MARK.search(t0):
            st['interactive:injection'] += 1
            continue
        t = clean(t0)
        if not t:
            st['interactive:empty-after-clean'] += 1
            continue
        if t.lower() in UI_BUTTONS:
            st['interactive:ui-button'] += 1
            continue
        reason = agent_reason(t)
        norm = re.sub(r'\s+', ' ', t.lower()).strip()
        h = hashlib.md5(norm.encode()).hexdigest()
        if reason:
            if h not in agent_seen:
                agent_seen.add(h)
                st['interactive:agent-authored:' + reason] += 1
                aout.write(json.dumps({'reason': reason, 'text': t[:400]}, ensure_ascii=False) + '\n')
            else:
                st['interactive:agent-authored-dup'] += 1
            continue
        if h in seen:
            st['interactive:dup'] += 1
            continue
        seen.add(h)
        if len(t) > 4000:
            st['interactive:paste>4000'] += 1
            continue
        st['interactive:KEPT'] += 1
        prose = strip_pastes(t)
        if len(prose) < len(t) * 0.8:
            st['interactive:KEPT-with-paste-stripped'] += 1
        if not prose:
            st['interactive:all-paste'] += 1
            continue
        out.write(json.dumps({'f': r['f'], 'orig': r['orig'], 'ts': r['ts'], 'text': t, 'prose': prose}, ensure_ascii=False) + '\n')
    json.dump(st, open(STATS, 'w'), indent=1)
    for k, v in sorted(st.items()):
        print(v, k)


main()
