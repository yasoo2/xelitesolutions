import re

for label, path in [
    ('MUSE', r'D:\Joe\muse-worktree\api\src\core\orchestrator\plan-tools.ts'),
    ('NVIDIA', r'D:\Joe\xelitesolutions\api\src\core\orchestrator\plan-tools.ts'),
]:
    src = open(path, encoding='utf-8').read()
    m = re.search(r'PLANNER_TOOL_CATALOGUE[^=]*=\s*\[(.*?)\];', src, re.S)
    arr = m.group(1)
    names = re.findall(r"name:\s*['\"]", arr)
    print(label, 'catalogue entries:', len(names),
          'visual_qa:', 'visual_qa' in arr,
          'generate_image:', 'generate_image' in arr,
          'bulk_file_generator:', 'bulk_file_generator' in arr)
    print(label, 'MEANS present:', 'MEANS' in src)

# TOOL_ALIASES size + visual_qa redirect check (Muse tree)
src = open(r'D:\Joe\muse-worktree\api\src\modules\services\ToolService.ts', encoding='utf-8').read()
m = re.search(r'TOOL_ALIASES[^=]*=\s*\{(.*?)\};', src, re.S)
if m:
    keys = re.findall(r"['\"]([a-z_0-9]+)['\"]\s*:", m.group(1))
    print('MUSE TOOL_ALIASES keys:', len(keys))
    print('visual_qa alias target:', 'visual_qa' in m.group(1))
else:
    print('TOOL_ALIASES static object not found; dynamic only?')
    print('TOOL_ALIASES occurrences:', len(re.findall(r'TOOL_ALIASES', src)))
