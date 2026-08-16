import json
from pathlib import Path

p = Path('/home/ubuntu/xelitesolutions-review/api/data/db/chat-messages.json')
data = json.loads(p.read_text()) if p.exists() else []
print('count', len(data))
for m in data[-80:]:
    content = str(m.get('content', '')).replace('\\n', '\n')
    print('---')
    print('id=', m.get('_id'), 'session=', m.get('sessionId'), 'role=', m.get('role'), 'created=', m.get('createdAt'))
    print(content[:500].replace('\n', ' | '))
