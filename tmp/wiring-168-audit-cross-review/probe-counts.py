import re

def count_mem(path, label):
    src = open(path, encoding='utf-8').read()
    m = re.search(r'MemoryTools[^=]*=\s*\[(.*?)\];', src, re.S)
    arr = m.group(1)
    names = re.findall(r"name:\s*['\"]", arr)
    print(label, 'MemoryTools entries:', len(names))

def elite(path, label):
    src = open(path, encoding='utf-8').read()
    ex = re.findall(r'export\s+(?:class|const)\s+(\w+)', src)
    print(label, 'EliteTools exports:', len(ex), ex)

count_mem(r'D:\Joe\muse-worktree\api\src\modules\tools\definitions\MemoryTool.ts', 'MUSE')
count_mem(r'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\MemoryTool.ts', 'NVIDIA')
elite(r'D:\Joe\muse-worktree\api\src\modules\tools\definitions\EliteTools.ts', 'MUSE')
elite(r'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\EliteTools.ts', 'NVIDIA')

# visual_qa / generate_image references outside registry (Muse tree)
import subprocess
for pat in ['visual_qa', 'generate_image', 'image_generate']:
    r = subprocess.run(['rg', '-l', pat, r'D:\Joe\muse-worktree\api\src'], capture_output=True, text=True)
    files = [f for f in r.stdout.splitlines() if f.strip()]
    print(pat, 'referenced in', len(files), 'files')
    for f in files[:12]:
        print('   ', f)
