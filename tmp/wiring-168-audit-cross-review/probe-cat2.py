import re

for label, path in [
    ('MUSE', r'D:\Joe\muse-worktree\api\src\core\orchestrator\plan-tools.ts'),
    ('NVIDIA', r'D:\Joe\xelitesolutions\api\src\core\orchestrator\plan-tools.ts'),
]:
    src = open(path, encoding='utf-8').read()
    m = re.search(r'PLANNER_TOOL_CATALOGUE[^=]*=\s*\[(.*?)\n\];', src, re.S)
    arr = m.group(1)
    tools = re.findall(r"\{\s*tool:\s*'([^']+)'", arr)
    print(label, 'catalogue entries:', len(tools))
    for t in ['visual_qa', 'generate_image', 'bulk_file_generator', 'manual', 'project_detect',
              'repo_search', 'repo_read_file', 'db_schema_migrator', 'auth_builder']:
        print('   ', t, t in tools)
    if label == 'MUSE':
        print('MUSE catalogue tools:', tools)
