"""F3 linkedApiDir containment check (Muse cycle 223, read-only, aggregates only)."""
import json, os, re, hashlib
PROJECTS = r'D:\Joe\xelitesolutions\api\data\db\joe-projects.json'
SESSIONS = r'D:\Joe\xelitesolutions\api\data\db\chat-sessions.json'
EXTERNAL_ROOT = os.path.realpath(r'D:\Joe\xelitesolutions\data\projects')
def h(s): return hashlib.sha1(s.encode('utf-8', 'replace')).hexdigest()[:12]
def safe_ws(ws): return (re.sub(r'[^a-zA-Z0-9_-]', '_', ws)[:120]) or h(ws)
projects = json.load(open(PROJECTS, encoding='utf-8'))
sessions = json.load(open(SESSIONS, encoding='utf-8'))
by_id = {}
for s in sessions:
    if isinstance(s, dict):
        for k in ('id', '_id'):
            if s.get(k): by_id[str(s.get(k))] = s
n_link = n_exist = n_exp = n_ext = 0
for key, e in projects.items():
    l = e.get('linkedApiDir')
    if not l or not isinstance(l, str): continue
    n_link += 1
    rl = os.path.realpath(l) if os.path.exists(l) else ''
    if rl: n_exist += 1
    s = by_id.get(str(key)); ws = str((s or {}).get('workspaceId') or '')
    exp = os.path.realpath(os.path.join(EXTERNAL_ROOT, safe_ws(ws))) if ws else ''
    if rl and exp and (rl == exp or rl.startswith(exp + os.sep)): n_exp += 1
    if rl and (rl == EXTERNAL_ROOT or rl.startswith(EXTERNAL_ROOT + os.sep)): n_ext += 1
print('entries_with_linkedApiDir=', n_link, 'exist=', n_exist,
      'under_expected_ws_root=', n_exp, 'under_external=', n_ext)
