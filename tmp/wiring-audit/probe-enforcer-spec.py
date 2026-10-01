import hashlib
import re

P = r'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\SpecificationVerificationTool.ts'
c = open(P, encoding='utf-8').read()
print('LINES=' + str(len(c.splitlines())))
print('SHA256=' + hashlib.sha256(c.encode('utf-8')).hexdigest())
spawn = re.compile(r'(?<!\.)spawn(Sync)?\(')
exe = re.compile(r'(?<!\.)exec(Sync|File|FileSync)?\(')
imp = re.compile('from [\'"]child_process[\'"]|require\\([\'"]child_process[\'"]\\)')
print('spawn_match=' + str(bool(spawn.search(c))))
print('exec_match=' + str(bool(exe.search(c))))
print('import_match=' + str(bool(imp.search(c))))
