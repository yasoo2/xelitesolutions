import re

paths = [
    ('MUSE-PhaseExec', r'D:\Joe\muse-worktree\api\src\modules\tools\definitions\PhaseExecutorTool.ts'),
    ('NVIDIA-PhaseExec', r'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\PhaseExecutorTool.ts'),
]
for label, p in paths:
    src = open(p, encoding='utf-8').read()
    print(label, 'bytes:', len(src))
    for pat in ['proseObservationPassed', 'realVerificationPassed', 'prose', 'verificationNote']:
        print('   ', pat, len(re.findall(pat, src)))

# full-tree check for the two flags
import os
for label, root in [('MUSE', r'D:\Joe\muse-worktree\api\src'), ('NVIDIA', r'D:\Joe\xelitesolutions\api\src')]:
    hits = []
    for dp, dn, fns in os.walk(root):
        for fn in fns:
            if not fn.endswith('.ts'):
                continue
            fp = os.path.join(dp, fn)
            try:
                t = open(fp, encoding='utf-8').read()
            except Exception:
                continue
            for pat in ['proseObservationPassed', 'realVerificationPassed']:
                if pat in t:
                    hits.append((pat, fp))
    print(label, 'flag hits:', hits if hits else 'NONE')
