import re
src = open(r'D:\Joe\muse-worktree\api\src\modules\tools\registry.ts', encoding='utf-8').read()
base = re.search(r'const baseTools.*?\[(.*?)\];', src, re.S).group(1)
allnew = re.findall(r'new ([\w.]+)\(', base)
print('all new-X( in base:', len(allnew))
from collections import Counter
print(Counter(allnew))
# any non-empty-arg news?
print('with-args:', [m for m in re.finditer(r'new ([\w.]+)\(([^)]+)\)', base)])
# safeNew labels vs actual names: list labels
rev = re.search(r'const revivedTools.*?\[(.*?)\];', src, re.S).group(1)
labels = re.findall(r"safeNew\('([^']+)'", rev)
print('safeNew count:', len(labels))
