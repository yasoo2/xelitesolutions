import json, os
r = json.load(open('bundle-run1.result.json'))
print('## NONZERO RISK MARKERS PER DEF FILE')
for t in ['repo_read_file', 'repo_apply_patch', 'repo_run_command', 'docker_manager',
          'terraform_manager', 'kubernetes_ops', 'github_actions', 'git_local_workflow',
          'deploy_pages', 'query_optimizer', 'large_data_seeder', 'sonar_analysis',
          'load_tester', 'codebase_navigator', 'analyze_codebase', 'dev_server']:
    p = r['perTool'].get(t)
    if not p:
        continue
    for f, m in (p.get('markers') or {}).items():
        nz = {k: v for k, v in m.items() if v}
        print(t, '|', f, '|', json.dumps(nz))
print('## STRING SEARCH FOR 5 UNREGISTERED NAMES (muse tree)')
roots = [r'D:\Joe\muse-worktree\api\src', r'D:\Joe\xelitesolutions\api\src']
names = ['codebase_navigator', 'get_codebase_map', 'web_pipeline', 'dev_server', 'datasource_tool']
for root in roots:
    print('### ' + root)
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith('.ts'):
                continue
            p = os.path.join(dirpath, f)
            try:
                text = open(p, encoding='utf-8', errors='replace').read()
            except Exception:
                continue
            for n in names:
                c = text.count(n)
                if c:
                    rel = os.path.relpath(p, root)
                    print('%s: %s x%d' % (n, rel, c))
