import json
from pathlib import Path
p = Path('/home/ubuntu/xelitesolutions-review/api/data/db/chat-messages.json')
data = json.loads(p.read_text())
sid = '6a81049a7f98dd23753786d8'
for m in data:
    if m.get('sessionId') == sid and m.get('role') == 'assistant':
        print('ID', m.get('_id'), 'CREATED', m.get('createdAt'))
        print(str(m.get('content', '')).replace('\\n', '\n'))
        print('\n' + '=' * 80 + '\n')
