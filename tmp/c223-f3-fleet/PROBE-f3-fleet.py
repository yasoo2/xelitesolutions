"""F3 independent fleet-compat probe (Muse cycle 223, read-only).

Reads default disk stores only. Prints AGGREGATE counts and field names.
Never prints raw paths, session/user IDs, or file contents.
Dir identity is represented by sha1(dir)[:12] for cross-checking only.
"""
import json, os, re, hashlib

PROJECTS = r'D:\Joe\xelitesolutions\api\data\db\joe-projects.json'
SESSIONS = r'D:\Joe\xelitesolutions\api\data\db\chat-sessions.json'
EXTERNAL_ROOT = os.path.realpath(r'D:\Joe\xelitesolutions\data\projects')
LOCAL_ROOT_DEFAULT = os.path.join(EXTERNAL_ROOT, 'my-workspace')

def h(s):
    return hashlib.sha1(s.encode('utf-8', 'replace')).hexdigest()[:12]

def safe_ws(ws):
    return (re.sub(r'[^a-zA-Z0-9_-]', '_', ws)[:120]) or h(ws)

projects = json.load(open(PROJECTS, encoding='utf-8'))
sessions = json.load(open(SESSIONS, encoding='utf-8'))
print('projects_type=', type(projects).__name__, 'n=', len(projects))
print('sessions_type=', type(sessions).__name__, 'n=', len(sessions))

OWNER_FIELDS = ['ownerUserId', 'ownerId', 'owner', 'ownerEmail', 'userId', 'user_id']
by_id = {}
for s in sessions:
    if isinstance(s, dict):
        for k in ('id', '_id'):
            v = s.get(k)
            if v:
                by_id[str(v)] = s

n_owner = 0
n_wsfield = 0
n_dir = 0
n_dir_exists = 0
n_joined = 0
n_joined_with_ws = 0
n_under_expected_ws_root = 0
n_under_external_root = 0
n_under_local_default = 0
n_exact_expected_root = 0
owner_field_hits = {f: 0 for f in OWNER_FIELDS}
join_multi = 0
rows = []
for key, e in (projects.items() if isinstance(projects, dict) else []):
    if not isinstance(e, dict):
        rows.append((h(str(key)), 'non-dict-entry'))
        continue
    has_owner = False
    for f in OWNER_FIELDS:
        if e.get(f):
            owner_field_hits[f] += 1
            has_owner = True
    if has_owner:
        n_owner += 1
    if e.get('workspaceId'):
        n_wsfield += 1
    d = e.get('dir')
    if not d or not isinstance(d, str):
        rows.append((h(str(key)), 'no-dir'))
        continue
    n_dir += 1
    rd = os.path.realpath(d) if os.path.exists(d) else ''
    if rd:
        n_dir_exists += 1
    s = by_id.get(str(key))
    if s is None:
        rows.append((h(str(key)), 'dir=%s-exists' % ('yes' if rd else 'no'), 'join=none'))
        continue
    n_joined += 1
    ws = str(s.get('workspaceId') or '')
    if not ws:
        rows.append((h(str(key)), 'join=noworkspace'))
        continue
    n_joined_with_ws += 1
    exp = os.path.realpath(os.path.join(EXTERNAL_ROOT, safe_ws(ws)))
    under_exp = bool(rd) and (rd == exp or rd.startswith(exp + os.sep))
    under_ext = bool(rd) and (rd == EXTERNAL_ROOT or rd.startswith(EXTERNAL_ROOT + os.sep))
    under_loc = bool(rd) and (rd == os.path.realpath(LOCAL_ROOT_DEFAULT) or rd.startswith(os.path.realpath(LOCAL_ROOT_DEFAULT) + os.sep))
    if rd == exp:
        n_exact_expected_root += 1
    if under_exp:
        n_under_expected_ws_root += 1
    if under_ext:
        n_under_external_root += 1
    if under_loc:
        n_under_local_default += 1
    rows.append((h(str(key)), 'exists=%s' % bool(rd), 'under_expected_ws_root=%s' % under_exp,
                 'under_external=%s' % under_ext, 'under_local_default=%s' % under_loc))

print('owner_field_hits=', owner_field_hits)
print('entries_with_any_owner_field=', n_owner)
print('entries_with_workspaceId=', n_wsfield)
print('entries_with_dir=', n_dir, 'dirs_exist=', n_dir_exists)
print('joined_to_session=', n_joined, 'joined_with_workspaceId=', n_joined_with_ws)
print('exact_expected_root_match=', n_exact_expected_root)
print('under_expected_ws_root=', n_under_expected_ws_root)
print('under_external_root=', n_under_external_root)
print('under_local_default=', n_under_local_default)
print('--- per-entry (hashed id only) ---')
for r in rows:
    print(' '.join(r))
print('external_root_exists=', os.path.isdir(EXTERNAL_ROOT))
print('note=expected-root assumes API cwd D:/Joe/xelitesolutions/api, no EXTERNAL_PROJECTS_DIR/JOE_WORKSPACE_ROOT, no .joe-workspace-roots.json override, JSON single-user mode')
