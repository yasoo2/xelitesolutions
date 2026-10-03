import os
M = r'D:\Joe\muse-worktree\api\src'

def show(rel, needle, ctx=0):
    p = os.path.join(M, rel)
    lines = open(p, encoding='utf-8', errors='replace').read().split('\n')
    print('### %s :: %r' % (rel, needle))
    for i, l in enumerate(lines, 1):
        if needle in l:
            print('  L%d: %s' % (i, l.strip()[:200]))

show(r'modules\tools\registry.ts', 'web_pipeline')
show(r'modules\tools\registry.ts', 'dev_server')
show(r'modules\services\ToolService.ts', 'web_pipeline')
show(r'modules\services\ToolService.ts', 'codebase_navigator')
show(r'modules\tools\definitions\CodebaseNavigatorTool.ts', 'codebase_navigator')
show(r'modules\tools\definitions\CodebaseNavigatorTool.ts', 'class ')
show(r'modules\tools\definitions\CodebaseNavigatorTool.ts', 'execute(')
show(r'modules\tools\definitions\InfrastructureTools.ts', 'shell: true')
show(r'modules\tools\definitions\InfrastructureTools.ts', 'shell:true')
show(r'modules\tools\definitions\DatabaseEnterpriseTools.ts', 'exec(')
show(r'modules\tools\definitions\RepoSelfCodingTools.ts', 'sudo')
show(r'modules\tools\definitions\RepoSelfCodingTools.ts', 'chmod')
show(r'modules\tools\definitions\WebDevelopmentTools.ts', 'dev_server')
show(r'modules\tools\definitions\ReactProjectTool.ts', 'dev_server')

print('## WHOLE-API GREP get_codebase_map / datasource_tool')
for dirpath, _, files in os.walk(r'D:\Joe\muse-worktree\api'):
    if 'node_modules' in dirpath:
        continue
    for f in files:
        if not (f.endswith('.ts') or f.endswith('.js') or f.endswith('.json')):
            continue
        p = os.path.join(dirpath, f)
        try:
            t = open(p, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        for n in ('get_codebase_map', 'datasource_tool'):
            if n in t:
                print('%s: %s x%d' % (n, os.path.relpath(p, r'D:\Joe\muse-worktree\api'), t.count(n)))
print('## DONE')
