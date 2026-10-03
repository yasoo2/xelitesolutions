import re

for label, path in [
    ('MUSE', r'D:\Joe\muse-worktree\api\src\modules\services\ToolService.ts'),
    ('NVIDIA', r'D:\Joe\xelitesolutions\api\src\modules\services\ToolService.ts'),
]:
    src = open(path, encoding='utf-8').read()
    print('===', label, '===')
    print('browser_ui_audit occurrences:', len(re.findall(r'browser_ui_audit', src)))
    for m in re.finditer(r'.*browser_ui_audit.*', src):
        print('   ', m.group(0).strip()[:140])
    # dynamic browser rewrites: look for browser_run redirect patterns
    print('browser_run occurrences:', len(re.findall(r'browser_run', src)))
    for m in re.finditer(r'.*(startsWith\(.browser_.|=== .browser_open.|browser_get_state).*', src):
        print('   REWRITE:', m.group(0).strip()[:150])
