# Case variants of the same word mid-sentence, sentence-bearing fields only (headings/titles excluded).
import json,re,collections
pages=json.load(open('/tmp/ste-research/raw/corpus-prose.json'))
stop=set("the a an is with one its it from are by this that to of in on and or for as be".split())
m=collections.defaultdict(collections.Counter); pg=collections.defaultdict(set)
for p in pages:
  for f in p['fields']:
    if f.get('blockType') in ('title','heading') or re.match(r'props\.(title|columns)',f['field']): continue
    for mm in re.finditer(r'(?<=[a-z0-9,)] )([A-Za-z][a-zA-Z-]+)\b', f['text']):
      w=mm.group(1); k=w.lower()
      if k in stop: continue
      m[k][w]+=1; pg[(k,w)].add(p['page'])
out=[]
for k,c in m.items():
  if len(c)>=2:
    forms=c.most_common()
    if forms[1][1]>=2 and sum(c.values())>=6:
      out.append({'word':k,'forms':{w:{'n':n,'pages':len(pg[(k,w)])} for w,n in forms},'total':sum(c.values())})
out.sort(key=lambda x:-min(v['n'] for v in x['forms'].values()))
json.dump(out,open('/tmp/ste-research/raw/corpus-case-variants.json','w'),indent=1)
for o in out[:30]: print(o['word'], {w:v['n'] for w,v in o['forms'].items()})
