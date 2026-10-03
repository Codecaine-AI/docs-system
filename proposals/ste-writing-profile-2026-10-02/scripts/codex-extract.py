"""Stream every Codex rollout file, pull user-role message parts.

Writes /tmp/ste-research/raw/codex-user-parts.jsonl with one record per text part:
  {f, orig, src, ts_src, ts, i, text}
Only lines whose first 300 bytes contain "role":"user" are JSON-parsed.
Subagent / guardian sessions are skipped entirely but counted.
"""
import json, os, glob, sys
from multiprocessing import Pool

ROOT = os.path.expanduser('~/.codex/sessions/2026')
OUT = '/tmp/ste-research/raw/codex-user-parts.jsonl'
NEEDLE = b'"role":"user"'


def classify_session(meta):
    src = meta.get('source')
    ts = meta.get('thread_source')
    if isinstance(src, dict) or ts in ('subagent', 'guardian_review'):
        return 'subagent'
    if src == 'exec' or meta.get('originator') == 'codex_exec':
        return 'exec'
    if ts in ('agent_created_thread',) or meta.get('originator') == 'pi-subagents':
        return 'agent_thread'
    return 'interactive'


def work(path):
    out = []
    try:
        with open(path, 'rb') as f:
            first = f.readline()
            try:
                meta = json.loads(first).get('payload', {})
            except Exception:
                meta = {}
            kind = classify_session(meta)
            orig = meta.get('originator')
            src = meta.get('source') if isinstance(meta.get('source'), str) else 'subagent'
            if kind == 'subagent':
                # count user messages only (cheap) - do not keep text
                n = 0
                for line in f:
                    if NEEDLE in line[:300]:
                        n += 1
                return ('subagent', path, n, [])
            idx = 0
            for line in f:
                if NEEDLE not in line[:300]:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                pl = d.get('payload', {})
                if d.get('type') != 'response_item' or pl.get('role') != 'user':
                    continue
                parts = [c.get('text', '') for c in pl.get('content', []) if c.get('type') in ('input_text', 'text')]
                for p in parts:
                    out.append({'f': os.path.basename(path), 'kind': kind, 'orig': orig,
                                'tsrc': meta.get('thread_source'), 'ts': d.get('timestamp', ''),
                                'i': idx, 'text': p})
                idx += 1
        return (kind, path, idx, out)
    except Exception as e:
        return ('error', path, 0, [])


if __name__ == '__main__':
    files = sorted(glob.glob(ROOT + '/*/*/*.jsonl'), key=os.path.getsize, reverse=True)
    counts = {}
    with Pool(12) as pool, open(OUT, 'w') as o:
        for kind, path, n, recs in pool.imap_unordered(work, files, chunksize=4):
            c = counts.setdefault(kind, [0, 0])
            c[0] += 1
            c[1] += n
            for r in recs:
                o.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(json.dumps(counts))
    json.dump(counts, open('/tmp/ste-research/raw/codex-extract-counts.json', 'w'))
