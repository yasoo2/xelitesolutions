"""F3 outlier classifier (Muse cycle 223, read-only, aggregates only)."""
import json, os, re, hashlib
PROJECTS = r'D:\Joe\xelitesolutions\api\data\db\joe-projects.json'
SESSIONS = r'D:\Joe\xelitesolutions\api\data\db\chat-sessions.json'
EXTERNAL_ROOT = os.path.realpath(r'D:\Joe\xelitesolutions\data\projects')
def h(s): return hashlib.sha1(s.encode('utf-8', 'replace')).hexdigest()[:12]
def safe_ws(ws): return (re.sub(r'[^a-zA-Z0-9_-]', '_', ws)[:120]) or h(ws)
projects = json.load(open(PROJECTS, encoding='utf-8'))
sessions = json.load(open(SESSIONS, encoding='utf-8'))
by_id, ws_set = {}, set()
for s in sessions:
    if isinstance(s, dict):
        ws_set.add(safe_ws(str(s.get('workspaceId') or '')))
        for k in ('id', '_id'):
            if s.get(k): by_id[str(s.get(k))] = s
fields = set()
for e in projects.values():
    if isinstance(e, dict): fields.update(e.keys())
print('entry_field_union=', sorted(fields))
print('n_entries=', len(projects))
for key, e in projects.items():
    rd = os.path.realpath(e['dir'])
    s = by_id.get(str(key)); ws = str(s.get('workspaceId') or '')
    exp = os.path.realpath(os.path.join(EXTERNAL_ROOT, safe_ws(ws)))
    if rd == exp or rd.startswith(exp + os.sep): continue
    rel = os.path.relpath(rd, EXTERNAL_ROOT); first = rel.split(os.sep)[0]
    kids = os.listdir(os.path.join(EXTERNAL_ROOT, first))
    print('outlier keyhash=', h(str(key)), 'depth_under_external=', len(rel.split(os.sep)),
          'firstseg_is_known_wsdir=', first in ws_set, 'firstseg_hash=', h(first),
          'firstseg_children=', len(kids))
