import json, os, sys, glob, collections
from multiprocessing import Pool

ROOT = os.path.expanduser('~/.codex/sessions/2026')

def meta(path):
    try:
        with open(path, 'rb') as f:
            line = f.readline()
        d = json.loads(line)
        p = d.get('payload', {})
        src = p.get('source')
        if isinstance(src, dict):
            src = 'dict:' + ','.join(src.keys())
        return (path, p.get('originator'), str(src), p.get('thread_source'), os.path.getsize(path))
    except Exception as e:
        return (path, 'ERR', str(e)[:50], None, 0)

if __name__ == '__main__':
    files = sorted(glob.glob(ROOT + '/*/*/*.jsonl'))
    with Pool(12) as pool:
        res = pool.map(meta, files, chunksize=50)
    c = collections.Counter((r[1], r[2], r[3]) for r in res)
    sz = collections.Counter()
    for r in res:
        sz[(r[1], r[2], r[3])] += r[4]
    for k, v in c.most_common():
        print(v, round(sz[k]/1e9, 2), 'GB', k)
    json.dump(res, open('/tmp/ste-research/raw/codex-meta.json', 'w'))
